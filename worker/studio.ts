import { AppError, type AIConfig, type DownloadSource, type Env } from './contracts';
import { likeTerm, query, setting } from './db';
import { OFFICIAL_SOURCE } from './download';
import { defaultAI } from './settings';

/** 列表与详情共用列：版本取已批准快照 tag，任务信息取 revision 最新的一条。 */
const PLUGIN_COLUMNS = "p.id,p.source_kind,p.full_name,p.repository_id,p.description,p.status,p.blocked,p.revision,json_extract(s.data,'$.tag') version,(SELECT COUNT(*) FROM favorites f WHERE f.plugin_id=p.id) favorite_count,p.download_count,p.public_reason,p.created_at,p.updated_at,p.checked_at,p.approved_snapshot_id,p.submitter_id,t.status task_status,t.attempts task_attempts,t.created_at last_task_at";
const PLUGIN_SOURCE = ' FROM plugins p LEFT JOIN snapshots s ON s.id=p.approved_snapshot_id LEFT JOIN tasks t ON t.id=(SELECT x.id FROM tasks x WHERE x.plugin_id=p.id ORDER BY x.revision DESC LIMIT 1)';
/** 只允许白名单筛选片段，用户输入一律走绑定参数。 */
const STATUS_FILTERS: Record<string, string> = { all: '', published: " AND p.status='published'", in_review: " AND EXISTS(SELECT 1 FROM tasks a WHERE a.plugin_id=p.id AND a.status IN ('pending','running','retry'))", waiting: " AND p.status IN ('waiting_package','waiting_config','incomplete')", rejected: " AND p.status='rejected'", removed: " AND p.status='removed'", blocked: ' AND p.blocked=1' };
const SEARCH_FILTER = " WHERE (p.full_name LIKE ? ESCAPE '\\' OR p.description LIKE ? ESCAPE '\\')";
const OVERVIEW_COUNTS = `SELECT (SELECT COUNT(*) FROM plugins) plugins,(SELECT COUNT(*) FROM plugins WHERE status='published') published,(SELECT COUNT(*) FROM plugins WHERE EXISTS(SELECT 1 FROM tasks t WHERE t.plugin_id=plugins.id AND t.status IN ('pending','running','retry'))) inReview,(SELECT COUNT(*) FROM plugins WHERE status IN ('waiting_package','waiting_config','incomplete')) waiting,(SELECT COUNT(*) FROM plugins WHERE status='rejected') rejected,(SELECT COUNT(*) FROM plugins WHERE status='removed') removed,(SELECT COUNT(*) FROM plugins WHERE blocked=1) blocked,(SELECT COUNT(*) FROM favorites) favorites,(SELECT COALESCE(SUM(download_count),0) FROM plugins) downloads,(SELECT COUNT(*) FROM users) users,(SELECT COUNT(*) FROM tasks WHERE status IN ('pending','running','retry')) tasksActive,(SELECT COUNT(*) FROM tasks WHERE status='failed') tasksFailed`;
const RECENT_TASKS = "SELECT t.id,t.plugin_id,COALESCE(p.full_name,'') full_name,t.status,t.public_reason,t.attempts,t.created_at FROM tasks t LEFT JOIN plugins p ON p.id=t.plugin_id ORDER BY t.created_at DESC LIMIT 8";
const CANDIDATES = "SELECT p.id pluginId,p.full_name fullName,json_extract(s.data,'$.tag') version,a.id assetId,a.name,a.size,a.disabled,a.data FROM (SELECT id,full_name,approved_snapshot_id,updated_at FROM plugins WHERE source_kind='github' AND status='published' AND blocked=0 AND approved_snapshot_id IS NOT NULL ORDER BY updated_at DESC,id LIMIT 50) p JOIN snapshots s ON s.id=p.approved_snapshot_id LEFT JOIN assets a ON a.snapshot_id=s.id ORDER BY p.updated_at DESC,p.id,a.id";

export type StudioPlugin = Record<string, unknown>;

/** 附件 data 里的可选字段；解析失败或缺失一律为 null，不外抛。 */
function assetField(data: string | null, key: string): string | null {
 if (!data) return null;
 try { const value = (JSON.parse(data) as Record<string, unknown>)[key]; return typeof value === 'string' && value ? value : null; }
 catch { return null; }
}

/** Studio 插件列表：真正的服务端分页、状态筛选与转义后的关键词搜索。 */
export async function listPlugins(env: Env, input: { q?: string; status?: string; page?: string; pageSize?: string }) {
 const term = likeTerm((input.q ?? '').slice(0, 200));
 const status = input.status && Object.hasOwn(STATUS_FILTERS, input.status) ? input.status : 'all';
 const page = Math.max(1, Math.min(10000, Math.floor(Number(input.page)) || 1));
 const requested = Number(input.pageSize);
 const pageSize = Number.isFinite(requested) ? Math.max(10, Math.min(100, Math.floor(requested))) : 20;
 const where = SEARCH_FILTER + STATUS_FILTERS[status];
 const items = await query(env, `SELECT ${PLUGIN_COLUMNS}${PLUGIN_SOURCE}${where} ORDER BY p.created_at DESC,p.id LIMIT ? OFFSET ?`, term, term, pageSize, (page - 1) * pageSize).all<StudioPlugin>();
 const total = await query(env, 'SELECT COUNT(*) total FROM plugins p' + where, term, term).first<{ total: number }>();
 return { items: items.results, total: total?.total ?? 0, page, pageSize };
}

/** Studio 单插件详情：含内部依据，仅允许管理员会话访问。 */
export async function pluginDetail(env: Env, pluginId: string) {
 const plugin = await query(env, `SELECT ${PLUGIN_COLUMNS}${PLUGIN_SOURCE} WHERE p.id=?`, pluginId).first<StudioPlugin>();
 if (!plugin) throw new AppError(404, '插件不存在');
 const approvedId = typeof plugin.approved_snapshot_id === 'string' ? plugin.approved_snapshot_id : null;
 const snapshot = approvedId ? await query(env, 'SELECT id,revision,verdict,public_reason,internal_reason,review_version,created_at FROM snapshots WHERE id=?', approvedId).first<{ id: string }>() : null;
 const assets = snapshot ? (await query(env, 'SELECT id,name,size,sha256,disabled,data FROM assets WHERE snapshot_id=? ORDER BY id', snapshot.id).all<{ id: number; name: string; size: number; sha256: string; disabled: number; data: string }>()).results : [];
 const tasks = (await query(env, 'SELECT id,revision,status,attempts,public_reason,internal_reason,created_at,updated_at,queued_at,lock_until FROM tasks WHERE plugin_id=? ORDER BY revision DESC LIMIT 20', pluginId).all()).results;
 const audits = (await query(env, 'SELECT id,action,target,created_at,admin_id FROM audit WHERE target=? ORDER BY created_at DESC LIMIT 20', pluginId).all()).results;
 // 直传插件的名称、简介与教程存在 uploads.data 里，更新版本时用于回填表单。
 const upload = plugin.source_kind === 'upload' ? await query(env, "SELECT json_extract(u.data,'$.name') name,json_extract(u.data,'$.description') description,json_extract(u.data,'$.tutorial') tutorial FROM uploads u JOIN plugins p ON p.upload_id=u.id WHERE p.id=?", pluginId).first() : null;
 return { plugin, snapshot, assets: assets.map(a => ({ id: a.id, name: a.name, size: a.size, sha256: a.sha256, disabled: a.disabled, package_name: assetField(a.data, 'packageName'), architecture: assetField(a.data, 'architecture') })), tasks, audits, upload };
}

/** Studio 总览：只返回计数与公开配置摘要，绝不返回 API Key 明文、密文或 tasks.internal_reason。 */
export async function overview(env: Env) {
 const row = await query(env, OVERVIEW_COUNTS).first<Record<string, number>>();
 const count = (key: string) => Number(row?.[key] ?? 0);
 const stored = await setting<AIConfig>(env, 'ai');
 const config = { ...defaultAI, ...(stored ?? {}) };
 const configured = !!stored && typeof stored.model === 'string' && stored.model.trim() !== '' && typeof stored.apiKey === 'string' && stored.apiKey !== '';
 const list = await setting<DownloadSource[]>(env, 'sources');
 const sources = Array.isArray(list) && list.length ? list : [OFFICIAL_SOURCE];
 const recentTasks = (await query(env, RECENT_TASKS).all()).results;
 return {
  counts: { plugins: count('plugins'), published: count('published'), inReview: count('inReview'), waiting: count('waiting'), rejected: count('rejected'), removed: count('removed'), blocked: count('blocked'), favorites: count('favorites'), downloads: count('downloads'), users: count('users'), tasksActive: count('tasksActive'), tasksFailed: count('tasksFailed') },
  ai: { configured, model: typeof config.model === 'string' ? config.model : '', baseUrl: typeof config.baseUrl === 'string' ? config.baseUrl : '' },
  sources: { total: sources.length, enabled: sources.filter(s => s?.enabled === true).length },
  recentTasks,
 };
}

/** 下载源测试候选：只列已上架的插件及其已批准快照下的附件。 */
export async function sourceCandidates(env: Env) {
 const rows = (await query(env, CANDIDATES).all<{ pluginId: string; fullName: string; version: string | null; assetId: number | null; name: string | null; size: number | null; disabled: number | null; data: string | null }>()).results;
 const items: { pluginId: string; fullName: string; version: string | null; assets: { id: number; name: string; size: number; architecture: string | null; disabled: number }[] }[] = [];
 for (const row of rows) {
  let item = items.at(-1);
  if (!item || item.pluginId !== row.pluginId) { item = { pluginId: row.pluginId, fullName: row.fullName, version: row.version, assets: [] }; items.push(item); }
  if (row.assetId !== null && item.assets.length < 10) item.assets.push({ id: row.assetId, name: row.name ?? '', size: row.size ?? 0, architecture: assetField(row.data, 'architecture'), disabled: row.disabled ?? 0 });
 }
 return { items };
}
