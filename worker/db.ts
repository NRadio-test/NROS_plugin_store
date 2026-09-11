import type { Env } from './contracts';
export const now = () => Date.now();
export const id = () => crypto.randomUUID();
export function query(env: Env, sql: string, ...args: unknown[]) { return env.DB.prepare(sql).bind(...args); }
/** 转义 LIKE 关键词中的 % _ \\；调用方必须配合 ESCAPE '\\' 使用，不得拼接原始输入。 */
export function likeTerm(term: string) { return '%' + term.replace(/[\\%_]/g, '\\$&') + '%'; }
export async function audit(env: Env, adminId: string, action: string, target: string) { await query(env, 'INSERT INTO audit VALUES(?,?,?,?,?)', id(), adminId, action, target, now()).run(); }
export async function setting<T>(env: Env, key: string): Promise<T | null> { const row = await query(env, 'SELECT value FROM settings WHERE key=?', key).first<{
    value: string;
}>(); return row ? JSON.parse(row.value) as T : null; }
export async function setSetting(env: Env, key: string, value: unknown) { await query(env, 'INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', key, JSON.stringify(value)).run(); }

/** 调用方在同一事务中先把插件标记 removed；保留最小身份、提交状态与审计。 */
export function purgeRemovedMaterials(env: Env, pluginId: string) {
    return [
        query(env, "DELETE FROM http_cache WHERE EXISTS(SELECT 1 FROM plugins p WHERE p.id=? AND p.status='removed' AND (key='github:/repositories/'||p.repository_id OR key='github:/repos/'||p.full_name COLLATE NOCASE OR substr(key,1,length('github:/repos/'||p.full_name||'/'))='github:/repos/'||p.full_name||'/' COLLATE NOCASE))", pluginId),
        query(env, "DELETE FROM assets WHERE plugin_id=? AND EXISTS(SELECT 1 FROM plugins WHERE id=? AND status='removed')", pluginId, pluginId),
        query(env, "DELETE FROM snapshots WHERE plugin_id=? AND EXISTS(SELECT 1 FROM plugins WHERE id=? AND status='removed')", pluginId, pluginId),
        query(env, "DELETE FROM favorites WHERE plugin_id=? AND EXISTS(SELECT 1 FROM plugins WHERE id=? AND status='removed')", pluginId, pluginId),
        query(env, "DELETE FROM download_attempts WHERE plugin_id=? AND EXISTS(SELECT 1 FROM plugins WHERE id=? AND status='removed')", pluginId, pluginId),
        query(env, "UPDATE tasks SET internal_reason='',lock_token=NULL,lock_until=NULL,status=CASE WHEN status IN ('pending','running','retry') THEN CASE WHEN (SELECT blocked FROM plugins WHERE id=tasks.plugin_id)=1 THEN 'superseded' ELSE 'removed' END ELSE status END,public_reason=(SELECT public_reason FROM plugins WHERE id=tasks.plugin_id) WHERE plugin_id=? AND EXISTS(SELECT 1 FROM plugins WHERE id=? AND status='removed')", pluginId, pluginId),
        query(env, "UPDATE plugins SET approved_snapshot_id=NULL,description='',download_count=0 WHERE id=? AND status='removed'", pluginId),
    ];
}
