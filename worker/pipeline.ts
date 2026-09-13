import { AppError, type Env, type Snapshot } from './contracts';
import { getRepository, getSnapshot, normalizeRepoUrl, verifySnapshot } from './github';
import { uploadSnapshot, verifyUpload } from './uploads';
import { review } from './ai';
import { loadAI } from './settings';
import { id, now, query, setting, purgeRemovedMaterials } from './db';
interface Plugin {
    id: string;
    repository_id: number;
    source_kind: 'github' | 'upload';
    full_name: string;
    revision: number;
    blocked: number;
    status: string;
    approved_snapshot_id: string | null;
    missing_count: number;
    missing_since: number | null;
}
interface Task {
    id: string;
    plugin_id: string;
    revision: number;
    status: string;
    attempts: number;
    lock_token: string;
    force_review: number;
}
export async function enqueue(env: Env, taskId: string) { try {
    await env.JOBS.send({ taskId });
    await query(env, 'UPDATE tasks SET queued_at=? WHERE id=?', now(), taskId).run();
}
catch {
    await query(env, "UPDATE tasks SET public_reason='任务已保存，等待恢复入队',queued_at=NULL WHERE id=?", taskId).run();
} }
export async function submit(env: Env, url: string, userId: string | null) {
    const name = normalizeRepoUrl(url);
    const repo = await getRepository(env, name);
    const pluginId = id(), taskId = id(), t = now();
    await env.DB.batch([query(env, "INSERT OR IGNORE INTO plugins(id,repository_id,full_name,submitter_id,created_at,updated_at) VALUES(?,?,?,?,?,?)", pluginId, repo.id, repo.full_name, userId, t, t), query(env, "INSERT OR IGNORE INTO tasks(id,plugin_id,revision,status,created_at,updated_at) SELECT ?,id,revision,'pending',?,? FROM plugins WHERE id=?", taskId, t, t, pluginId)]);
    const p = await query(env, 'SELECT id,status FROM plugins WHERE repository_id=?', repo.id).first<{
        id: string;
        status: string;
    }>();
    if (p?.id !== pluginId)
        return { pluginId: p?.id, taskId: null, status: p?.status, message: '该仓库已收录或正在处理' };
    await enqueue(env, taskId);
    return { pluginId, taskId, status: 'pending', message: '投稿已保存，自动审核将在后台进行' };
}
export async function refresh(env: Env, pluginId: string, force = false) {
    const p = await query(env, 'SELECT * FROM plugins WHERE id=?', pluginId).first<Plugin>();
    if (!p)
        throw new AppError(404, '插件不存在');
    if (p.blocked)
        throw new AppError(409, '插件已被管理员停用，需显式恢复');
    const active = await query(env, "SELECT id,status FROM tasks WHERE plugin_id=? AND revision=? AND status IN ('pending','running','retry')", pluginId, p.revision).first<{
        id: string;
        status: string;
    }>();
    if (active && !force)
        return { taskId: active.id, status: active.status };
    const taskId = id(), t = now();
    await env.DB.batch([query(env, "UPDATE plugins SET revision=revision+1 WHERE id=? AND revision=? AND blocked=0", pluginId, p.revision), query(env, "INSERT OR IGNORE INTO tasks(id,plugin_id,revision,status,force_review,created_at,updated_at) SELECT ?,id,revision,'pending',?,?,? FROM plugins WHERE id=? AND revision=? AND blocked=0", taskId, force ? 1 : 0, t, t, pluginId, p.revision + 1)]);
    const actual = await query(env, 'SELECT id,status FROM tasks WHERE plugin_id=? AND revision=?', pluginId, p.revision + 1).first<{
        id: string;
        status: string;
    }>();
    if (!actual)
        throw new AppError(409, '状态已更新，请重试');
    await enqueue(env, actual.id);
    return { taskId: actual.id, status: actual.status };
}
async function finish(env: Env, task: Task, token: string, status: string, reason: string, internal = '') { await env.DB.batch([query(env, 'UPDATE tasks SET status=?,public_reason=?,internal_reason=?,lock_until=NULL,updated_at=? WHERE id=? AND lock_token=?', status, reason, internal.slice(0, 6000), now(), task.id, token), query(env, 'UPDATE plugins SET public_reason=?,checked_at=?,status=CASE WHEN approved_snapshot_id IS NULL THEN ? ELSE status END WHERE id=? AND revision=? AND blocked=0 AND EXISTS(SELECT 1 FROM tasks WHERE id=? AND lock_token=?)', reason, now(), status, task.plugin_id, task.revision, task.id, token)]); }
export async function processTask(env: Env, taskId: string) {
    const token = id(), t = now();
    const task = await query(env, "UPDATE tasks SET status='running',attempts=attempts+1,lock_token=?,lock_until=?,updated_at=? WHERE id=? AND attempts<4 AND not_before<=? AND (status IN ('pending','retry') OR (status='running' AND lock_until<?)) RETURNING *", token, t + 600000, t, taskId, t, t).first<Task>();
    if (!task)
        return;
    const p = await query(env, 'SELECT * FROM plugins WHERE id=?', task.plugin_id).first<Plugin>();
    if (!p || p.blocked || p.revision !== task.revision) {
        await finish(env, task, token, 'superseded', '任务已被后续操作替代');
        return;
    }
    try {
        const snapshot = p.source_kind === 'upload' ? await uploadSnapshot(env, p.id) : await getSnapshot(env, p.repository_id);
        await query(env, 'UPDATE plugins SET missing_count=0,missing_since=NULL WHERE id=? AND revision=?', p.id, p.revision).run();
        const configVersion = await setting<string>(env, 'reviewVersion') ?? 'v1';
        const version = task.force_review ? configVersion + ':force:' + task.id : configVersion;
        const reused = await query(env, 'SELECT * FROM snapshots WHERE plugin_id=? AND fingerprint=? AND review_version=?', p.id, snapshot.fingerprint, version).first<{
            id: string;
            verdict: string;
            public_reason: string;
            internal_reason: string;
        }>();
        let result;
        if (reused)
            result = { verdict: reused.verdict, publicReason: reused.public_reason, internalReason: reused.internal_reason };
        else {
            const config = await loadAI(env);
            if (!config.apiKey || !config.model) {
                await finish(env, task, token, 'waiting_config', '等待配置 AI 审核服务');
                return;
            }
            const day = new Date().toISOString().slice(0, 10);
            const budget = Math.max(1, Math.min(10000, Number(env.DAILY_AI_BUDGET) || 100));
            const usage = await query(env, 'INSERT INTO ai_usage(day,count) VALUES(?,1) ON CONFLICT(day) DO UPDATE SET count=count+1 WHERE count<? RETURNING count', day, budget).first();
            if (!usage) {
                await finish(env, task, token, 'budget_exhausted', '今日自动审核额度已用完，等待下次检查');
                return;
            }
            result = await review(config, snapshot.materials);
        }
        if (!(await (snapshot.sourceKind === 'upload' ? verifyUpload(env, snapshot) : verifySnapshot(env, snapshot)))) {
            await finish(env, task, token, 'incomplete', '审核期间来源已变化，请重新检查');
            return;
        }
        const sid = reused?.id ?? id(), created = now();
        const statements = [];
        if (!reused) {
            statements.push(query(env, 'INSERT OR IGNORE INTO snapshots(id,plugin_id,revision,fingerprint,data,verdict,public_reason,internal_reason,review_version,created_at) SELECT ?,?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM plugins WHERE id=? AND revision=? AND blocked=0) AND EXISTS(SELECT 1 FROM tasks WHERE id=? AND lock_token=? AND lock_until>?)', sid, p.id, p.revision, snapshot.fingerprint, JSON.stringify(snapshot), result.verdict, result.publicReason, result.internalReason, version, created, p.id, p.revision, task.id, token, created));
            for (const a of snapshot.assets)
                statements.push(query(env, 'INSERT OR IGNORE INTO assets(id,snapshot_id,plugin_id,name,size,sha256,data) SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM snapshots WHERE id=?)', a.id, sid, p.id, a.name, a.size, a.sha256 ?? '', JSON.stringify(a), sid));
        }
        if (result.verdict === 'allow')
            statements.push(query(env, "UPDATE plugins SET approved_snapshot_id=?,status='published',description=?,full_name=?,public_reason=?,updated_at=CASE WHEN approved_snapshot_id=? THEN updated_at ELSE ? END,checked_at=? WHERE id=? AND revision=? AND blocked=0 AND EXISTS(SELECT 1 FROM tasks WHERE id=? AND lock_token=? AND lock_until>?) AND COALESCE((SELECT json_extract(value,'$') FROM settings WHERE key='reviewVersion'),'v1')=?", sid, snapshot.description, snapshot.fullName, result.publicReason, sid, created, created, p.id, p.revision, task.id, token, created, configVersion));
        statements.push(query(env, 'UPDATE tasks SET status=?,public_reason=?,internal_reason=?,lock_until=NULL,updated_at=? WHERE id=? AND lock_token=?', result.verdict === 'allow' ? 'done' : result.verdict === 'reject' ? 'rejected' : 'incomplete', result.publicReason, result.internalReason, created, task.id, token));
        await env.DB.batch(statements);
        if (result.verdict === 'allow') {
            const current = await query(env, "SELECT approved_snapshot_id,revision,blocked,COALESCE((SELECT json_extract(value,'$') FROM settings WHERE key='reviewVersion'),'v1') config_version FROM plugins WHERE id=?", p.id).first<{
                approved_snapshot_id: string | null;
                revision: number;
                blocked: number;
                config_version: string;
            }>();
            if (!current || current.blocked || current.revision !== p.revision) {
                await finish(env, task, token, 'superseded', '任务已被后续操作替代');
            }
            else if (current.approved_snapshot_id !== sid || current.config_version !== configVersion) {
                await query(env, "UPDATE tasks SET status='retry',public_reason='审核配置已变化，等待重新检查',not_before=0,queued_at=NULL WHERE id=? AND lock_token=?", task.id, token).run();
                await enqueue(env, task.id);
            }
        }
        if (result.verdict !== 'allow')
            await finish(env, task, token, result.verdict === 'reject' ? 'rejected' : 'incomplete', result.publicReason, result.internalReason);
    }
    catch (error) {
        const e = error instanceof AppError ? error : new AppError(503, '外部检查暂时失败', 'transient');
        if (e.code === 'github_missing') {
            // 相隔至少一小时、按稳定 repository ID 官方复查两次，单次404只记录。
            const count = p.missing_count + 1;
            const confirmed = count >= 2 && p.missing_since !== null && t - p.missing_since >= 3600000;
            await env.DB.batch([query(env, "UPDATE plugins SET missing_count=missing_count+1,missing_since=COALESCE(missing_since,?),status=CASE WHEN ? THEN 'removed' ELSE status END,public_reason=? WHERE id=? AND revision=? AND blocked=0", t, confirmed ? 1 : 0, confirmed ? '仓库已无法公开访问' : '仓库暂时不可访问，等待官方源复查', p.id, p.revision), ...(confirmed ? purgeRemovedMaterials(env, p.id) : [])]);
            await finish(env, task, token, confirmed ? 'removed' : 'incomplete', confirmed ? '仓库已无法公开访问' : '仓库暂时不可访问，等待复查');
            return;
        }
        if (e.code === 'malware_detected' || e.code === 'antivirus_unconfigured') {
            await finish(env, task, token, e.code === 'malware_detected' ? 'rejected' : 'waiting_config', e.message);
            return;
        }
        if (['waiting_package', 'incomplete', 'asset_missing'].includes(e.code)) {
            await query(env, 'UPDATE plugins SET missing_count=0,missing_since=NULL WHERE id=? AND revision=?', p.id, p.revision).run();
            await finish(env, task, token, e.code, e.message);
            return;
        }
        const retry = task.attempts < 4;
        await query(env, 'UPDATE tasks SET status=?,public_reason=?,internal_reason=?,lock_until=NULL,not_before=?,updated_at=? WHERE id=? AND lock_token=?', retry ? 'retry' : 'failed', retry ? '外部服务暂不可用，等待有限重试' : '检查失败，可在 Studio 重试', `${e.code}: ${e.message}`.slice(0, 6000), now() + Math.min(60000, 2000 * 2 ** task.attempts), now(), task.id, token).run();
        if (retry)
            throw e;
    }
}
export async function recover(env: Env) { await query(env, "UPDATE tasks SET status='failed',public_reason='任务重试已耗尽',lock_until=NULL WHERE attempts>=4 AND status IN ('running','retry') AND (lock_until IS NULL OR lock_until<?)", now()).run(); const rows = await query(env, "SELECT id FROM tasks WHERE attempts<4 AND not_before<=? AND ((status IN ('pending','retry') AND (queued_at IS NULL OR queued_at<?)) OR (status='running' AND lock_until<?)) ORDER BY created_at LIMIT 50", now(), now() - 600000, now()).all<{
    id: string;
}>(); for (const row of rows.results)
    await enqueue(env, row.id); }
/** 定时扫描：GitHub 投稿需要跟进上游变化；已上架的直传包没有上游，
 *  重新排队只会把 R2 对象整包读回来再解析一遍，因此跳过。
 *  未上架的直传包仍会扫描，保留 AI 配置补全后的自动重试。
 *  直传对象缺失由下载时的 etag/size 校验兜底，作者也可以用「重新检查」主动复核。 */
export async function scan(env: Env, cursor = '') { const rows = await query(env, "SELECT id FROM plugins WHERE blocked=0 AND NOT (status='published' AND (source_kind='upload' OR EXISTS(SELECT 1 FROM snapshots s WHERE s.id=plugins.approved_snapshot_id AND json_extract(s.data,'$.publicationMode')='manual'))) AND id>? ORDER BY id LIMIT 25", cursor).all<{
    id: string;
}>(); for (const row of rows.results)
    await refresh(env, row.id); if (rows.results.length === 25)
    await env.JOBS.send({ scanCursor: rows.results.at(-1)!.id }); }
export async function getApproved(env: Env, pluginId: string): Promise<Snapshot | null> { const row = await query(env, "SELECT s.data FROM plugins p JOIN snapshots s ON s.id=p.approved_snapshot_id WHERE p.id=? AND p.blocked=0 AND p.status='published'", pluginId).first<{
    data: string;
}>(); return row ? JSON.parse(row.data) : null; }
