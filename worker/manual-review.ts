import { AppError, type Env, type Snapshot } from './contracts';
import { id, now, query } from './db';
import { verifySnapshot } from './github';
import { verifyUpload } from './uploads';

/** Persist exactly the material the reviewer will see. Preparing a candidate never publishes it. */
export async function prepareReview(env: Env, plugin: { id: string; revision: number; approved_snapshot_id: string | null }, taskId: string, token: string, snapshot: Snapshot) {
  const approved = plugin.approved_snapshot_id ? await query(env, 'SELECT fingerprint,data FROM snapshots WHERE id=?', plugin.approved_snapshot_id).first<{fingerprint:string;data:string}>() : null;
  if (approved?.fingerprint === snapshot.fingerprint && (JSON.parse(approved.data) as Snapshot).publicationMode === 'human-reviewed') {
    await query(env, "UPDATE tasks SET status='done',public_reason='与已人工批准版本一致，无需重复审核',lock_until=NULL,updated_at=? WHERE id=? AND lock_token=?", now(), taskId, token).run();
    return;
  }
  const sid = id(), rid = id(), t = now();
  snapshot.materials = '';
  snapshot.coverage = [];
  const valid = "EXISTS(SELECT 1 FROM plugins WHERE id=? AND revision=? AND blocked=0) AND EXISTS(SELECT 1 FROM tasks WHERE id=? AND lock_token=? AND lock_until>?)";
  const args = [plugin.id, plugin.revision, taskId, token, t];
  const statements = [query(env, `INSERT INTO snapshots(id,plugin_id,revision,fingerprint,data,verdict,public_reason,internal_reason,review_version,created_at) SELECT ?,?,?,?,?,'uncertain','','',?,? WHERE ${valid}`, sid, plugin.id, plugin.revision, snapshot.fingerprint, JSON.stringify(snapshot), 'manual-candidate:' + taskId, t, ...args)];
  for (const asset of snapshot.assets) statements.push(query(env, 'INSERT INTO assets(id,snapshot_id,plugin_id,name,size,sha256,data) SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM snapshots WHERE id=?)', asset.id, sid, plugin.id, asset.name, asset.size, asset.sha256 ?? '', JSON.stringify(asset), sid));
  statements.push(query(env, "INSERT INTO manual_reviews(id,plugin_id,revision,snapshot_id,public_reason,created_at) SELECT ?,?,?,?,'',? WHERE EXISTS(SELECT 1 FROM snapshots WHERE id=?)", rid, plugin.id, plugin.revision, sid, t, sid));
  statements.push(query(env, `UPDATE plugins SET public_reason='',checked_at=NULL,status=CASE WHEN approved_snapshot_id IS NULL THEN 'awaiting_review' ELSE status END WHERE id=? AND revision=? AND blocked=0 AND EXISTS(SELECT 1 FROM manual_reviews WHERE id=?)`, plugin.id, plugin.revision, rid));
  statements.push(query(env, "UPDATE tasks SET status=CASE WHEN EXISTS(SELECT 1 FROM manual_reviews WHERE id=?) THEN 'awaiting_review' ELSE 'superseded' END,public_reason='',lock_until=NULL,updated_at=? WHERE id=? AND lock_token=?", rid, t, taskId, token));
  await env.DB.batch(statements);
}

export interface ManualCandidate {
  id: string; plugin_id: string; revision: number; snapshot_id: string; decision: string;
  public_reason: string; internal_reason: string; created_at: number; reviewed_at: number | null;
  data: string;
}
export async function currentReview(env: Env, pluginId: string) {
  return query(env, 'SELECT r.*,s.data FROM manual_reviews r JOIN plugins p ON p.id=r.plugin_id AND p.revision=r.revision JOIN snapshots s ON s.id=r.snapshot_id WHERE r.plugin_id=?', pluginId).first<ManualCandidate>();
}
export function reviewSummary(row: ManualCandidate | null) {
  if (!row) return null;
  const snapshot = JSON.parse(row.data) as Snapshot;
  return { id: row.id, revision: row.revision, decision: row.decision, publicReason: row.public_reason, internalReason: row.internal_reason, createdAt: row.created_at, reviewedAt: row.reviewed_at, name: snapshot.fullName, description: snapshot.description, version: snapshot.tag, readme: snapshot.readme, readmeCommit: snapshot.readmeCommit, readmePath: snapshot.readmePath, uploaded: snapshot.sourceKind === 'upload', assets: snapshot.assets.map(a => ({ id: a.id, name: a.name, size: a.size, packageName: a.packageName, architecture: a.architecture })) };
}

/** Optimistic concurrency + a transaction token prevents two reviewers from deciding the same version. */
export async function decideReview(env: Env, pluginId: string, input: { revision?:unknown; decision?:unknown; reason?:unknown; internalReason?:unknown }, authorize: () => Promise<string>) {
  if (!Number.isSafeInteger(input.revision) || typeof input.decision !== 'string' || !['approve','reject'].includes(input.decision)) throw new AppError(400, '请指定当前版本和审核结论');
  if (input.reason !== undefined && (typeof input.reason !== 'string' || input.reason.length > 240)) throw new AppError(400, '公开原因最多 240 字');
  if (input.internalReason !== undefined && (typeof input.internalReason !== 'string' || input.internalReason.length > 6000)) throw new AppError(400, '内部备注最多 6000 字');
  const reason = typeof input.reason === 'string' ? input.reason.trim() : '';
  if (input.decision === 'reject' && reason.length < 5) throw new AppError(400, '请填写至少 5 字的退回原因，方便作者修改');
  const row = await currentReview(env, pluginId);
  const plugin = await query(env, 'SELECT blocked FROM plugins WHERE id=?', pluginId).first<{blocked:number}>();
  if (!row || row.revision !== input.revision || row.decision !== 'pending' || plugin?.blocked) throw new AppError(409, '待审版本已变化、已处理或已停用，请刷新列表');
  const snapshot = JSON.parse(row.data) as Snapshot;
  const approve = input.decision === 'approve';
  if (approve && !await (snapshot.sourceKind === 'upload' ? verifyUpload(env, snapshot) : verifySnapshot(env, snapshot))) throw new AppError(409, '安装包或展示资料已变化，请重新整理后审核', 'changed_candidate');
  const adminId = await authorize(), t = now(), decisionToken = id();
  const decision = approve ? 'approved' : 'rejected';
  const owned = 'EXISTS(SELECT 1 FROM manual_reviews WHERE id=? AND decision_token=?)';
  const statements = [query(env, "UPDATE manual_reviews SET decision=?,public_reason=?,internal_reason=?,reviewed_by=?,reviewed_at=?,decision_token=? WHERE id=? AND decision='pending' AND EXISTS(SELECT 1 FROM plugins WHERE id=? AND revision=? AND blocked=0)", decision, reason, input.internalReason ?? '', adminId, t, decisionToken, row.id, pluginId, row.revision)];
  if (approve) {
    snapshot.publicationMode = 'human-reviewed';
    snapshot.coverage = [];
    statements.push(query(env, `UPDATE snapshots SET data=?,verdict='allow',public_reason=?,internal_reason=?,review_version='human-reviewed',created_at=? WHERE id=? AND ${owned}`, JSON.stringify(snapshot), reason, input.internalReason ?? '', t, row.snapshot_id, row.id, decisionToken));
    statements.push(query(env, `UPDATE plugins SET approved_snapshot_id=?,status='published',description=?,full_name=?,public_reason=?,updated_at=?,checked_at=? WHERE id=? AND revision=? AND blocked=0 AND ${owned}`, row.snapshot_id, snapshot.description, snapshot.fullName, reason, t, t, pluginId, row.revision, row.id, decisionToken));
  } else {
    statements.push(query(env, `UPDATE plugins SET status=CASE WHEN approved_snapshot_id IS NULL THEN 'rejected' ELSE status END,public_reason=? WHERE id=? AND revision=? AND ${owned}`, reason, pluginId, row.revision, row.id, decisionToken));
  }
  statements.push(query(env, `UPDATE tasks SET status=?,public_reason=?,internal_reason=?,lock_token=NULL,lock_until=NULL,updated_at=? WHERE plugin_id=? AND revision=? AND ${owned}`, approve ? 'done' : 'rejected', reason, input.internalReason ?? '', t, pluginId, row.revision, row.id, decisionToken));
  statements.push(query(env, `INSERT INTO audit(id,admin_id,action,target,created_at) SELECT ?,?,?,?,? WHERE ${owned}`, id(), adminId, approve ? 'manual-approve' : 'manual-reject', pluginId, t, row.id, decisionToken));
  await env.DB.batch(statements);
  const committed = await query(env, 'SELECT 1 FROM manual_reviews WHERE id=? AND decision_token=?', row.id, decisionToken).first();
  if (!committed) throw new AppError(409, '此版本已被其他操作处理，请刷新列表');
  return { ok: true, decision, message: approve ? '人工审核通过，已上架' : '已退回，作者可查看原因并重新提交' };
}
