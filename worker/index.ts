import { Hono } from 'hono';
import { AppError, type Env, type DownloadSource } from './contracts';
import { assertOrigin, createSession, getSession, logoutSession, normalizePhone, verifyPassword, hmac, rateLimit, sharedAdmin, activeAdmin } from './security';
import { id, now, query, audit, setting, setSetting, purgeRemovedMaterials } from './db';
import { submit, refresh, processTask, recover, scan, getApproved, enqueue } from './pipeline';
import { receiveUpload, deleteUploads, cleanupUploads } from './uploads';
import { manualPublish } from './manual-publication';
import { loadAI, saveAI } from './settings';
import { testAI } from './ai';
import { readBounded } from './network';
import { forwardDownload, testSource, OFFICIAL_SOURCE, validateSource } from './download';
import { listPlugins, overview, pluginDetail, sourceCandidates } from './studio';
type Variables = {
    userId: string;
    adminId: string;
};
const app = new Hono<{
    Bindings: Env;
    Variables: Variables;
}>();
app.use('*', async (c, next) => { if (c.env.APP_ENV === 'production' && (!c.env.APP_ORIGIN.startsWith('https://') || !c.env.MASTER_KEY || !c.env.PHONE_HMAC_KEY))
    return c.json({ error: '服务端配置未完成', code: 'configuration' }, 503); if (!['GET', 'HEAD', 'OPTIONS'].includes(c.req.method))
    assertOrigin(c.req.raw, c.env); await next(); c.header('X-Content-Type-Options', 'nosniff'); c.header('Referrer-Policy', 'no-referrer'); c.header('Cache-Control', 'no-store'); c.header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"); });
app.onError((e, c) => c.json({ error: e instanceof AppError ? e.message : '服务暂不可用，请稍后重试', code: e instanceof AppError ? e.code : 'internal' }, (e instanceof AppError ? e.status : 500) as 400));
async function body(c: any) { const text = new TextDecoder().decode(await readBounded(new Response(c.req.raw.body), 50000)); try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
        throw new Error('object');
    return parsed;
}
catch {
    throw new AppError(400, '需要 JSON 对象请求');
} }
async function limit(c: any, action: string, count = 15, seconds = 60) { const identity = await hmac(c.env.PHONE_HMAC_KEY, `${action}:${c.req.header('cf-connecting-ip') ?? 'local'}`); await rateLimit(c.env, identity, count, seconds); }
app.use('/api/studio/*', async (c, next) => { if (c.req.path === '/api/studio/login')
    return next(); const session = await getSession(c.req.raw, c.env, 'admin'); if (!session)
    throw new AppError(401, '请先登录 Studio'); c.set('adminId', session.subjectId); if (c.req.method !== 'GET')
    await limit(c, 'studio', 60); await next(); });
async function requireUser(c: any) { const s = await getSession(c.req.raw, c.env, 'user'); if (!s)
    throw new AppError(401, '请先填写手机号进入'); return s.subjectId; }
app.get('/api/session', async (c) => { const u = await getSession(c.req.raw, c.env, 'user'), a = await getSession(c.req.raw, c.env, 'admin'); return c.json({ user: u ? await query(c.env, 'SELECT id,phone_mask FROM users WHERE id=?', u.subjectId).first() : null, admin: a ? { id: a.subjectId, username: a.username } : null }); });
app.post('/api/login', async (c) => { await limit(c, 'login', 10, 600); const b = await body(c); const phone = normalizePhone(b.phone); const index = await hmac(c.env.PHONE_HMAC_KEY, phone); const uid = id(); await query(c.env, 'INSERT OR IGNORE INTO users(id,phone_index,phone_mask,created_at) VALUES(?,?,?,?)', uid, index, `${phone.slice(0, 4)}****${phone.slice(-4)}`, now()).run(); const user = await query(c.env, 'SELECT id,phone_mask FROM users WHERE phone_index=?', index).first<{
    id: string;
    phone_mask: string;
}>(); const session = await createSession(c.env, 'user', user!.id); c.header('Set-Cookie', session.cookie); return c.json({ user }); });
app.post('/api/logout', async (c) => { c.header('Set-Cookie', await logoutSession(c.req.raw, c.env, 'user')); return c.json({ ok: true }); });
app.post('/api/studio/login', async (c) => { await limit(c, 'admin-login', 5, 600); const b = await body(c); if (typeof b.username !== 'string' || typeof b.password !== 'string' || b.username.length > 100 || b.password.length > 1024)
    throw new AppError(400, '账号或密码格式错误'); const admin = await sharedAdmin(c.env, 'username', b.username); const dummy = 'pbkdf2-sha256$100000$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'; if (!await verifyPassword(b.password, admin?.password_hash ?? dummy) || !admin)
    throw new AppError(401, '账号或密码不正确'); if (!await activeAdmin(admin)) throw new AppError(403, '请先前往留言箱完成密码修改，再登录商店', 'password_change_required'); const s = await createSession(c.env, 'admin', admin.id, admin); c.header('Set-Cookie', s.cookie); await audit(c.env, admin.id, 'login', admin.id); return c.json({ admin: { id: admin.id, username: admin.username } }); });
app.post('/api/studio/logout', async (c) => { c.header('Set-Cookie', await logoutSession(c.req.raw, c.env, 'admin')); return c.json({ ok: true }); });
const publicSelect = `SELECT p.id,p.source_kind,p.full_name,p.description,p.updated_at,p.download_count, json_extract(s.data,'$.tag') version,(SELECT COUNT(*) FROM favorites f WHERE f.plugin_id=p.id) favorite_count FROM plugins p JOIN snapshots s ON s.id=p.approved_snapshot_id`;
/** 市场排序白名单：非法 sort 一律回落 updated，绝不把用户输入拼进 SQL。 */
const marketSorts: Record<string, string> = { updated: 'p.updated_at DESC,p.id', downloads: 'p.download_count DESC,p.updated_at DESC,p.id', favorites: 'favorite_count DESC,p.updated_at DESC,p.id' };
app.get('/api/plugins', async (c) => { const term = (c.req.query('q') ?? '').slice(0, 200), page = Math.max(1, Math.min(10000, Math.floor(Number(c.req.query('page'))) || 1)); const requested = c.req.query('sort') ?? ''; const sort = Object.hasOwn(marketSorts, requested) ? requested : 'updated'; const where = " WHERE p.status='published' AND p.blocked=0 AND (p.full_name LIKE ? ESCAPE '\\' OR p.description LIKE ? ESCAPE '\\')"; const like = '%' + term.replace(/[\\%_]/g, '\\$&') + '%'; const items = await query(c.env, publicSelect + where + ' ORDER BY ' + marketSorts[sort] + ' LIMIT 12 OFFSET ?', like, like, (page - 1) * 12).all(); const total = await query(c.env, 'SELECT COUNT(*) total FROM plugins p' + where + ' AND EXISTS(SELECT 1 FROM snapshots s WHERE s.id=p.approved_snapshot_id)', like, like).first<{
    total: number;
}>(); const session = await getSession(c.req.raw, c.env, 'user'); const favorites = session ? (await query(c.env, 'SELECT plugin_id FROM favorites WHERE user_id=?', session.subjectId).all<{
    plugin_id: string;
}>()).results : []; return c.json({ items: items.results.map(p => ({ ...p, favorited: favorites.some(f => f.plugin_id === p.id) })), total: total?.total ?? 0, page, pageSize: 12, sort }); });
app.get('/api/plugins/:id', async (c) => { const snapshot = await getApproved(c.env, c.req.param('id')); if (!snapshot)
    throw new AppError(404, '插件未上架或已下架'); const plugin = await query(c.env, publicSelect + ' WHERE p.id=?', c.req.param('id')).first(); const user = await getSession(c.req.raw, c.env, 'user'); const favorite = user ? !!await query(c.env, 'SELECT 1 FROM favorites WHERE user_id=? AND plugin_id=?', user.subjectId, c.req.param('id')).first() : false; const disabled = await query(c.env, 'SELECT id FROM assets WHERE snapshot_id=(SELECT approved_snapshot_id FROM plugins WHERE id=?) AND disabled=1', c.req.param('id')).all<{
    id: number;
}>();
// 只回显已批准快照的公开理由与时间；internal_reason 永不进入公共接口。
const review = await query(c.env, 'SELECT created_at,public_reason FROM snapshots WHERE id=(SELECT approved_snapshot_id FROM plugins WHERE id=?)', c.req.param('id')).first<{
    created_at: number;
    public_reason: string;
}>(); const publishedAt = plugin && typeof plugin.updated_at === 'number' ? plugin.updated_at : null; return c.json({ plugin: { ...plugin, favorited: favorite }, readme: snapshot.readme, readmePath: snapshot.readmePath, readmeCommit: snapshot.readmeCommit, sourceCommit: snapshot.sourceCommit, license: snapshot.license, assets: snapshot.assets.filter(a => !disabled.results.some(d => d.id === a.id)).map(({ id, name, size, sha256, packageName, architecture }) => ({ id, name, size, sha256, packageName, architecture })), publicationMode: snapshot.publicationMode ?? 'automatic', reviewLabel: snapshot.publicationMode === 'manual' ? '管理员手动上架，未经自动审核或查毒' : '通过自动审核，不保证无病毒', reviewedAt: snapshot.publicationMode === 'manual' ? null : review ? review.created_at : null, reviewPublicReason: review ? review.public_reason : '', publishedAt }); });
app.on(['GET', 'HEAD'], '/api/plugins/:id/download/:assetId', async (c) => { await limit(c, 'download', 60); if (!/^\d+$/.test(c.req.param('assetId')))
    throw new AppError(400, '附件编号无效'); return forwardDownload(c.req.raw, c.env, c.req.param('id'), Number(c.req.param('assetId'))); });
app.put('/api/plugins/:id/favorite', async (c) => { const uid = await requireUser(c); await rateLimit(c.env, `favorite:${uid}`, 60, 60); const b = await body(c); if (typeof b.active !== 'boolean')
    throw new AppError(400, '收藏状态错误'); if (!await getApproved(c.env, c.req.param('id')))
    throw new AppError(404, '插件未上架'); if (b.active)
    await query(c.env, 'INSERT OR IGNORE INTO favorites VALUES(?,?,?)', uid, c.req.param('id'), now()).run();
else
    await query(c.env, 'DELETE FROM favorites WHERE user_id=? AND plugin_id=?', uid, c.req.param('id')).run(); const count = await query(c.env, 'SELECT COUNT(*) total FROM favorites WHERE plugin_id=?', c.req.param('id')).first<{
    total: number;
}>(); return c.json({ favorite_count: count?.total ?? 0, favorited: b.active }); });
async function upload(c: any, uid: string | null, pid?: string) {
    const result = await receiveUpload(c.env, c.req.raw, uid, pid);
    if (result.taskId) await enqueue(c.env, result.taskId);
    return c.json(result, 202);
}
app.post('/api/submit/upload', async c => { const uid = await requireUser(c); await rateLimit(c.env, `submit:${uid}`, 5, 3600); await limit(c, 'submit', 10, 3600); return upload(c, uid); });
app.post('/api/plugins/:id/upload', async c => { const uid = await requireUser(c); await rateLimit(c.env, `submit:${uid}`, 5, 3600); await limit(c, 'submit', 10, 3600); return upload(c, uid, c.req.param('id')); });
app.post('/api/studio/submit/upload', async c => { const result = await receiveUpload(c.env, c.req.raw, null); if (result.taskId) await enqueue(c.env, result.taskId); await audit(c.env, c.get('adminId'), 'upload', result.pluginId); return c.json(result, 202); });
// 管理员更新自己提交的直传插件：管理员权限已由中间件校验，这里以 userId=null 跳过提交者归属检查。
app.post('/api/studio/plugins/:id/upload', async c => { const result = await receiveUpload(c.env, c.req.raw, null, c.req.param('id')); if (result.taskId) await enqueue(c.env, result.taskId); await audit(c.env, c.get('adminId'), 'upload-update', result.pluginId); return c.json(result, 202); });
app.post('/api/submit', async (c) => { const uid = await requireUser(c); await rateLimit(c.env, `submit:${uid}`, 5, 3600); await limit(c, 'submit', 10, 3600); const b = await body(c); if (typeof b.url !== 'string')
    throw new AppError(400, '请填写 GitHub 仓库链接'); return c.json(await submit(c.env, b.url, uid), 202); });
app.post('/api/plugins/:id/refresh', async (c) => { const uid = await requireUser(c); const p = await query(c.env, 'SELECT id FROM plugins WHERE id=? AND submitter_id=?', c.req.param('id'), uid).first(); if (!p)
    throw new AppError(403, '只能重新检查自己的提交'); await rateLimit(c.env, `refresh:${c.req.param('id')}`, 1, 600); return c.json(await refresh(c.env, c.req.param('id')), 202); });
app.get('/api/me', async (c) => { const uid = await requireUser(c); const submissions = await query(c.env, "SELECT p.id,p.source_kind,p.full_name,p.status,p.public_reason,json_extract(u.data,'$.name') upload_name,json_extract(u.data,'$.description') upload_description,json_extract(u.data,'$.tutorial') upload_tutorial,(SELECT status FROM tasks t WHERE t.plugin_id=p.id ORDER BY revision DESC LIMIT 1) task_status FROM plugins p LEFT JOIN uploads u ON u.id=p.upload_id WHERE submitter_id=? ORDER BY p.created_at DESC", uid).all(); const favorites = await query(c.env, publicSelect + " JOIN favorites own ON own.plugin_id=p.id WHERE own.user_id=? AND p.status='published' AND p.blocked=0 ORDER BY own.created_at DESC", uid).all(); return c.json({ submissions: submissions.results, favorites: favorites.results.map(p => ({ ...p, favorited: true })) }); });
app.get('/api/studio/plugins', async (c) => c.json(await listPlugins(c.env, { q: c.req.query('q'), status: c.req.query('status'), page: c.req.query('page'), pageSize: c.req.query('pageSize') })));
app.get('/api/studio/plugins/:id', async (c) => c.json(await pluginDetail(c.env, c.req.param('id'))));
app.get('/api/studio/overview', async (c) => c.json(await overview(c.env)));
// 兼容旧客户端：明确拒绝商店改密，不读取或转发提交的密码。
app.post('/api/studio/password', () => { throw new AppError(403, '请前往留言箱修改管理员密码', 'password_managed_externally'); });
app.post('/api/studio/submit', async (c) => { const b = await body(c); if (typeof b.url !== 'string')
    throw new AppError(400, '请填写链接'); const result = await submit(c.env, b.url, null); await audit(c.env, c.get('adminId'), 'submit', result.pluginId ?? ''); return c.json(result, 202); });
app.post('/api/studio/plugins/:id/manual-publish', async c => {
    const b = await body(c);
    if (b.confirmed !== true || !Number.isSafeInteger(b.revision)) throw new AppError(400, '请确认手动上架当前版本');
    return c.json(await manualPublish(c.env, c.req.param('id'), b.revision, async () => {
        const session = await getSession(c.req.raw, c.env, 'admin');
        if (!session) throw new AppError(401, '管理员会话已失效，请重新登录');
        return session.subjectId;
    }));
});
app.post('/api/studio/plugins/:id/:action', async (c) => { const action = c.req.param('action'), pid = c.req.param('id'); if (!['sync', 'retry', 'unlist', 'delete', 'restore'].includes(action))
    throw new AppError(404, '操作不存在'); if (!await query(c.env, 'SELECT id FROM plugins WHERE id=?', pid).first())
    throw new AppError(404, '插件不存在'); let result: unknown = { ok: true }; if (['unlist', 'delete'].includes(action)) {
    const b = await body(c);
    const reason = typeof b.reason === 'string' && b.reason.trim() ? b.reason.trim().slice(0, 240) : '管理员已下架';
    await c.env.DB.batch([query(c.env, "UPDATE plugins SET blocked=1,status='removed',revision=revision+1,public_reason=?,updated_at=? WHERE id=?", reason, now(), pid), ...purgeRemovedMaterials(c.env, pid)]);
    if (action === 'delete') await deleteUploads(c.env, pid);
}
else {
    if (action === 'restore')
        await query(c.env, "UPDATE plugins SET blocked=0,status='pending',approved_snapshot_id=NULL,revision=revision+1,public_reason='管理员请求恢复，等待重新审核' WHERE id=?", pid).run();
    result = await refresh(c.env, pid, action !== 'sync');
} await audit(c.env, c.get('adminId'), action, pid); return c.json(result as any); });
app.get('/api/studio/tasks', async (c) => c.json({ items: (await query(c.env, 'SELECT id,plugin_id,status,public_reason,internal_reason,attempts,created_at FROM tasks ORDER BY created_at DESC LIMIT 200').all()).results }));
app.get('/api/studio/logs', async (c) => c.json({ items: (await query(c.env, 'SELECT id,action,target,created_at FROM audit ORDER BY created_at DESC LIMIT 100').all()).results }));
app.get('/api/studio/ai', async (c) => c.json(await loadAI(c.env, true)));
app.put('/api/studio/ai', async (c) => { await saveAI(c.env, await body(c)); await audit(c.env, c.get('adminId'), 'ai-settings', 'ai'); return c.json({ ok: true }); });
app.post('/api/studio/ai/test', async (c) => { await limit(c, 'ai-test', 5, 600); await testAI(await loadAI(c.env)); await audit(c.env, c.get('adminId'), 'ai-test', 'ai'); return c.json({ ok: true, message: '接口连通且返回有效审核格式' }); });
const officialSource = OFFICIAL_SOURCE;
app.get('/api/studio/sources', async (c) => c.json({ items: await setting(c.env, 'sources') ?? [officialSource] }));
app.get('/api/studio/sources/candidates', async (c) => c.json(await sourceCandidates(c.env)));
app.put('/api/studio/sources', async (c) => { const b = await body(c); if (!Array.isArray(b.items) || b.items.length < 1 || b.items.length > 8)
    throw new AppError(400, '需要 1–8 个下载源'); const ids = new Set(); for (const s of b.items as DownloadSource[]) {
    validateSource(s);
    if (ids.has(s.id) || s.priority < 0 || s.priority > 100)
        throw new AppError(400, '重复下载源或优先级错误');
    ids.add(s.id);
    if (s.id !== 'github' && s.enabled) {
        if (!s.trusted)
            throw new AppError(400, '第三方源必须明确信任');
        const proof = await setting<string>(c.env, `source-tested:${s.id}`);
        if (proof !== JSON.stringify({ ...s, enabled: false }))
            throw new AppError(400, '请先保存为停用、针对具体附件测试成功，再启用');
    }
} await setSetting(c.env, 'sources', b.items); await audit(c.env, c.get('adminId'), 'download-sources', 'sources'); return c.json({ ok: true }); });
app.post('/api/studio/sources/:id/test', async (c) => { await limit(c, 'source-test', 10, 600); const b = await body(c); const source = (await setting<DownloadSource[]>(c.env, 'sources') ?? [officialSource]).find(s => s.id === c.req.param('id')); if (!source || typeof b.pluginId !== 'string' || !Number.isInteger(Number(b.assetId)))
    throw new AppError(400, '下载源或附件无效'); await testSource(c.env, source, b.pluginId, Number(b.assetId)); await setSetting(c.env, `source-tested:${source.id}`, JSON.stringify({ ...source, enabled: false })); await audit(c.env, c.get('adminId'), 'source-test', source.id); return c.json({ ok: true, message: '指定附件可访问；流式检测不代表整包逐字节预验证' }); });
app.get('/robots.txt', c => c.text('User-agent: *\nDisallow: /studio\nDisallow: /me\nDisallow: /login\nDisallow: /api/\nSitemap: ' + c.env.APP_ORIGIN + '/sitemap.xml'));
app.get('/sitemap.xml', async (c) => { const rows = await query(c.env, "SELECT id FROM plugins WHERE status='published' AND blocked=0 ORDER BY id LIMIT 10000").all<{
    id: string;
}>(); c.header('Content-Type', 'application/xml'); return c.body('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>' + c.env.APP_ORIGIN + '</loc></url>' + rows.results.map(r => '<url><loc>' + c.env.APP_ORIGIN + '/plugins/' + encodeURIComponent(r.id) + '</loc></url>').join('') + '</urlset>'); });
app.all('/api/*', c => c.json({ error: '接口不存在', code: 'not_found' }, 404));
app.all('*', c => c.env.ASSETS.fetch(c.req.raw));
export default { fetch: app.fetch, async queue(batch: MessageBatch<{
        taskId?: string;
        scanCursor?: string;
    }>, env: Env) { for (const message of batch.messages) {
        try {
            if (message.body.taskId)
                await processTask(env, message.body.taskId);
            else if (message.body.scanCursor !== undefined)
                await scan(env, message.body.scanCursor);
            message.ack();
        }
        catch {
            message.retry({ delaySeconds: 30 });
        }
    } }, async scheduled(_event: ScheduledController, env: Env) { await recover(env); await scan(env); await cleanupUploads(env); await env.DB.batch([query(env, 'DELETE FROM sessions WHERE expires_at<?', now()), query(env, 'DELETE FROM limits WHERE expires_at<?', now()), query(env, 'DELETE FROM download_attempts WHERE created_at<?', now() - 86400000), query(env, 'DELETE FROM http_cache WHERE updated_at<?', now() - 604800000)]); } } satisfies ExportedHandler<Env, {
    taskId?: string;
    scanCursor?: string;
}>;
