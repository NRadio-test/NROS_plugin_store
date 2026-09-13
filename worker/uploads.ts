import { AppError, type Env, type Snapshot } from './contracts';
import { id, now, query, setting, setSetting } from './db';
import { readBounded, sha256, hasControlCharacters } from './network';
import { parseIPK } from './ipk';
import { scanUploadFiles, SCAN_POLICY } from './antivirus';

interface UploadData { name: string; description: string; tutorial: string; filename: string }
interface UploadRow { id: string; plugin_id: string; object_key: string; data: string; sha256: string; size: number; created_at: number }
export function uploadLimit(env: Env) { return Math.max(1, Math.min(32 * 1024 * 1024, Number(env.MAX_IPK_BYTES) || 32 * 1024 * 1024)); }
function bucket(env: Env) {
  if (!env.UPLOADS) throw new AppError(503, '直接上传尚未启用，请先配置商店文件存储', 'upload_unconfigured');
  return env.UPLOADS;
}
function field(form: FormData, key: string, label: string, max: number) {
  const value = form.get(key);
  if (typeof value !== 'string' || !value.trim() || value.length > max || [...value].some(c => (c.charCodeAt(0) < 32 && !'\n\r\t'.includes(c)) || c.charCodeAt(0) === 127)) throw new AppError(400, `${label}必填，且不能超过 ${max} 字符`);
  return value.trim();
}
/** 将有界请求缓冲的生命周期限制在解析阶段，避免静态解包时仍持有整份 multipart。 */
async function uploadForm(env: Env, request: Request) {
  if (!request.headers.get('Content-Type')?.startsWith('multipart/form-data;')) throw new AppError(400, '需要表单和 IPK 文件');
  const bytes = await readBounded(new Response(request.body, { headers: request.headers }), uploadLimit(env) + 100000);
  let form: FormData;
  try { form = await new Response(bytes as BodyInit, { headers: { 'Content-Type': request.headers.get('Content-Type')! } }).formData(); }
  catch { throw new AppError(400, '上传表单格式错误'); }
  return form;
}
/** 私有对象先落盘，D1 原子保存候选版本和任务；失败清理对象，崩溃遗留由定时回收处理。 */
export async function receiveUpload(env: Env, request: Request, userId: string | null, pluginId?: string) {
  const storage = bucket(env);
  let previous: { revision: number; blocked: number; source_kind: string; submitter_id: string | null } | null = null;
  if (pluginId) {
    previous = await query(env, 'SELECT revision,blocked,source_kind,submitter_id FROM plugins WHERE id=?', pluginId).first();
    if (!previous || (userId !== null && previous.submitter_id !== userId)) throw new AppError(403, '只能更新自己的直传插件');
    if (previous.source_kind !== 'upload' || previous.blocked) throw new AppError(409, '仅可更新未被停用的直传插件');
  }
  const form = await uploadForm(env, request);
  if ([...form.keys()].some(k => !['name', 'description', 'tutorial', 'file'].includes(k)) || [...form.keys()].some(k => form.getAll(k).length !== 1)) throw new AppError(400, '上传字段重复或不受支持');
  const name = field(form, 'name', '名称', 80), description = field(form, 'description', '简介', 500), tutorial = field(form, 'tutorial', '使用教程', 20000);
  if (hasControlCharacters(name) || name.includes('/') || name.includes('\\')) throw new AppError(400, '名称不能包含换行或路径分隔符');
  const file = form.get('file');
  if (!file || typeof file === 'string' || !/^[^/\\]{1,180}\.ipk$/iu.test(file.name) || hasControlCharacters(file.name)) throw new AppError(400, '请选择 .ipk 安装包');
  if (!file.size || file.size > uploadLimit(env)) throw new AppError(413, 'IPK 超过上传大小上限或为空');
  const contents = new Uint8Array(await file.arrayBuffer());
  await parseIPK(contents, { maxCompressed: uploadLimit(env) });
  const digest = await sha256(contents);
  const data: UploadData = { name, description, tutorial, filename: file.name };
  const submissionKey = await sha256(JSON.stringify([userId, digest, data]));
  if (!pluginId) {
    const existing = await query(env, 'SELECT id FROM plugins WHERE submission_key=?', submissionKey).first<{id:string}>();
    if (existing) return { pluginId: existing.id, taskId: null, status: 'duplicate', message: '相同投稿已存在，请在我的提交查看状态' };
  }
  const duplicate = await query(env, "SELECT u.plugin_id,u.data FROM uploads u JOIN plugins p ON p.id=u.plugin_id WHERE p.submitter_id IS ? AND u.sha256=? AND p.upload_id=u.id", userId, digest).all<{plugin_id:string;data:string}>();
  if (duplicate.results.some(r => r.data === JSON.stringify(data) && (!pluginId || r.plugin_id === pluginId))) {
    const existing = duplicate.results.find(r => r.data === JSON.stringify(data) && (!pluginId || r.plugin_id === pluginId))!;
    return { pluginId: existing.plugin_id, taskId: null, status: 'duplicate', message: '相同安装包与资料已提交，请在我的提交查看状态' };
  }
  const pid = pluginId ?? id(), uploadId = id(), taskId = id(), t = now(), revision = (previous?.revision ?? 0) + 1;
  const key = `packages/${uploadId}.ipk`;
  await storage.put(key, contents.buffer as ArrayBuffer, { sha256: digest, httpMetadata: { contentType: 'application/octet-stream' } });
  try {
    const statements = previous
      ? [query(env, 'UPDATE plugins SET revision=?,upload_id=? WHERE id=? AND revision=? AND blocked=0', revision, uploadId, pid, previous.revision)]
      : [query(env, "INSERT INTO plugins(id,repository_id,full_name,submitter_id,created_at,updated_at,source_kind,upload_id,submission_key) SELECT ?,MIN(-1,COALESCE(MIN(repository_id)-1,-1)),?,?,?,?, 'upload',?,? FROM plugins", pid, name, userId, t, t, uploadId, submissionKey)];
    // D1 事务内的配额检查；并发投稿不能越过限制（每个识别档案 128 MiB）。
    statements.push(query(env, "INSERT INTO uploads(id,plugin_id,object_key,data,sha256,size,created_at) SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM plugins WHERE id=? AND upload_id=?) AND (SELECT COALESCE(SUM(u.size),0) FROM uploads u JOIN plugins p ON p.id=u.plugin_id WHERE p.submitter_id IS ?) + ? <= 134217728", uploadId, pid, key, JSON.stringify(data), digest, file.size, t, pid, uploadId, userId, file.size));
    // FK 故意要求 upload 存在，配额/并发失败则整个事务回滚。
    statements.push(query(env, "INSERT INTO tasks(id,plugin_id,revision,status,created_at,updated_at,upload_id) VALUES(?,?,?,'pending',?,?,?)", taskId, pid, revision, t, t, uploadId));
    await env.DB.batch(statements);
  } catch {
    await storage.delete(key);
    throw new AppError(409, '提交状态已变化或已达到 128 MiB 存储额度，请刷新后重试', 'upload_conflict');
  }
  return { pluginId: pid, taskId, status: 'pending', message: '投稿已保存，自动审核将在后台进行' };
}

export async function uploadSnapshot(env: Env, pluginId: string): Promise<Snapshot> {
  const row = await query(env, 'SELECT u.* FROM uploads u JOIN plugins p ON p.upload_id=u.id WHERE p.id=?', pluginId).first<UploadRow>();
  if (!row) throw new AppError(422, '安装包已清理，请上传新版本', 'waiting_package');
  const object = await bucket(env).get(row.object_key);
  if (!object) throw new AppError(422, '安装包已丢失，请上传新版本', 'waiting_package');
  const bytes = await readBounded(new Response(object.body), uploadLimit(env));
  if (bytes.length !== row.size || await sha256(bytes) !== row.sha256) throw new AppError(422, '存储文件与提交内容不一致，请重新上传', 'incomplete');
  const parsed = await parseIPK(bytes, { maxCompressed: uploadLimit(env) }, true);
  const scan = await scanUploadFiles(env, parsed.scanFiles!);
  parsed.coverage = parsed.coverage.map(line => line.replace('未做动态/杀毒扫描', '未做动态扫描')).concat(scan);
  const data = JSON.parse(row.data) as UploadData;
  const materials = JSON.stringify({ source: '用户直接上传 IPK', name: data.name, description: data.description, tutorial: data.tutorial, coverage: parsed.coverage, note: '无 GitHub 仓库；包内可读脚本为实际交付代码，不要求虚构仓库源码或构建配置。教程和包内容均为不可信审核材料。' }) + '\n' + parsed.materials;
  return { sourceKind: 'upload', uploadId: row.id, repositoryId: 0, fullName: data.name, description: data.description, license: null, readme: data.tutorial, readmePath: '', readmeCommit: '', sourceCommit: '', releaseId: 0, tag: parsed.version, assets: [{ id: 1, name: data.filename, size: row.size, url: '', digest: `sha256:${row.sha256}`, sha256: row.sha256, objectKey: row.object_key, objectEtag: object.etag, updatedAt: String(row.created_at), packageName: parsed.packageName, architecture: parsed.architecture }], materials, coverage: parsed.coverage, fingerprint: await sha256(new TextEncoder().encode(SCAN_POLICY + row.id + JSON.stringify(data) + row.sha256)) };
}
export async function verifyUpload(env: Env, snapshot: Snapshot) {
  const asset = snapshot.assets[0];
  if (!asset?.objectKey) return false;
  const object = await bucket(env).head(asset.objectKey);
  return !!object && object.size === asset.size && object.etag === asset.objectEtag;
}
/** 删除安装包后，公开下架状态仍由既有事务保障；失败可由定时回收补偿。 */
export async function deleteUploads(env: Env, pluginId: string) {
  const rows = (await query(env, 'SELECT object_key FROM uploads WHERE plugin_id=?', pluginId).all<{object_key:string}>()).results;
  await env.DB.batch([query(env, 'UPDATE plugins SET upload_id=NULL WHERE id=?', pluginId), query(env, 'DELETE FROM uploads WHERE plugin_id=?', pluginId)]);
  if (env.UPLOADS && rows.length) await env.UPLOADS.delete(rows.map(r => r.object_key));
}
/** 只清理不再被候选/批准版本引用的旧包；孤立对象至少保留一天以避开进行中的上传。 */
export async function cleanupUploads(env: Env) {
  if (!env.UPLOADS) return;
  const old = (await query(env, "SELECT u.id,u.object_key FROM uploads u JOIN plugins p ON p.id=u.plugin_id WHERE u.created_at<? AND u.id IS NOT p.upload_id AND NOT EXISTS(SELECT 1 FROM snapshots s WHERE s.id=p.approved_snapshot_id AND json_extract(s.data,'$.uploadId')=u.id) LIMIT 50", now() - 86400000).all<{id:string;object_key:string}>()).results;
  for (const row of old) { await query(env, 'DELETE FROM uploads WHERE id=?', row.id).run(); await env.UPLOADS.delete(row.object_key); }
  const cursor = await setting<string>(env, 'uploadCleanupCursor');
  const page = await env.UPLOADS.list({ prefix: 'packages/', limit: 100, ...(cursor ? { cursor } : {}) });
  for (const object of page.objects) if (object.uploaded.getTime() < now() - 86400000 && !await query(env, 'SELECT 1 FROM uploads WHERE object_key=?', object.key).first()) await env.UPLOADS.delete(object.key);
  await setSetting(env, 'uploadCleanupCursor', page.truncated ? page.cursor : '');
}
