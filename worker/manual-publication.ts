import { AppError, type Env } from './contracts';
import { id, now, query } from './db';
import { getSnapshot, verifySnapshot } from './github';
import { uploadSnapshot, verifyUpload } from './uploads';

/** 只由已鉴权的 Studio 入口调用；人工决定仅绑定本次候选，不授予后续版本免审权限。 */
export async function manualPublish(env: Env, pluginId: string, revision: number, authorize: () => Promise<string>) {
  const plugin = await query(env, 'SELECT revision,source_kind,repository_id FROM plugins WHERE id=?', pluginId).first<{ revision: number; source_kind: string; repository_id: number }>();
  if (!plugin) throw new AppError(404, '插件不存在');
  if (!Number.isSafeInteger(revision) || revision !== plugin.revision) throw new AppError(409, '插件版本已变化，请刷新后再手动上架');
  const snapshot = plugin.source_kind === 'upload' ? await uploadSnapshot(env, pluginId, true) : await getSnapshot(env, plugin.repository_id, fetch, true);
  snapshot.publicationMode = 'manual';
  snapshot.materials = '';
  snapshot.coverage = ['管理员手动上架，未经过自动审核或查毒'];
  if (!await (snapshot.sourceKind === 'upload' ? verifyUpload(env, snapshot) : verifySnapshot(env, snapshot))) throw new AppError(409, '安装包或展示内容已变化，请重新操作');
  // 外部读取后重新校验会话，防止改密、退出或账号撤销后的迟到请求发布。
  const adminId = await authorize();
  const sid = id(), taskId = id(), timestamp = now();
  const reason = '管理员手动上架，未经过自动审核或查毒';
  const statements = [query(env, "INSERT INTO snapshots(id,plugin_id,revision,fingerprint,data,verdict,public_reason,internal_reason,review_version,created_at) SELECT ?,id,revision+1,?,?,'allow',?,?,?,? FROM plugins WHERE id=? AND revision=?", sid, snapshot.fingerprint, JSON.stringify(snapshot), reason, reason, `manual:${sid}`, timestamp, pluginId, revision)];
  for (const asset of snapshot.assets) statements.push(query(env, 'INSERT INTO assets(id,snapshot_id,plugin_id,name,size,sha256,data) SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM snapshots WHERE id=?)', asset.id, sid, pluginId, asset.name, asset.size, asset.sha256 ?? '', JSON.stringify(asset), sid));
  statements.push(query(env, "UPDATE plugins SET approved_snapshot_id=?,revision=revision+1,blocked=0,status='published',description=?,full_name=?,public_reason=?,updated_at=?,checked_at=NULL,missing_count=0,missing_since=NULL WHERE id=? AND revision=? AND EXISTS(SELECT 1 FROM snapshots WHERE id=?)", sid, snapshot.description, snapshot.fullName, reason, timestamp, pluginId, revision, sid));
  statements.push(query(env, "UPDATE tasks SET status='superseded',lock_token=NULL,lock_until=NULL,updated_at=?,public_reason='已由管理员手动上架替代' WHERE plugin_id=? AND status IN ('pending','running','retry') AND EXISTS(SELECT 1 FROM plugins WHERE id=? AND approved_snapshot_id=?)", timestamp, pluginId, pluginId, sid));
  statements.push(query(env, "INSERT INTO tasks(id,plugin_id,revision,status,public_reason,internal_reason,created_at,updated_at) SELECT ?,id,revision,'done',?,?,?,? FROM plugins WHERE id=? AND approved_snapshot_id=?", taskId, reason, reason, timestamp, timestamp, pluginId, sid));
  statements.push(query(env, "INSERT INTO audit(id,admin_id,action,target,created_at) SELECT ?,?,'manual-publish',?,? WHERE EXISTS(SELECT 1 FROM plugins WHERE id=? AND approved_snapshot_id=?)", id(), adminId, pluginId, timestamp, pluginId, sid));
  await env.DB.batch(statements);
  if (!await query(env, 'SELECT 1 FROM plugins WHERE id=? AND approved_snapshot_id=?', pluginId, sid).first()) throw new AppError(409, '插件已被其他操作更新，请刷新后重试');
  return { ok: true, status: 'published', message: reason };
}
