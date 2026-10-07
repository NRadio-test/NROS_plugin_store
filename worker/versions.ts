import { AppError, type Asset, type Env, type Snapshot } from './contracts';
import { publicationFilter } from './review-mode';

/** Both the selected release and the plugin's current release must be public. */
export function publishedSnapshotFilter(env: Env) {
  return "p.status='published' AND p.blocked=0 AND s.verdict='allow'" + publicationFilter(env)
    + " AND EXISTS(SELECT 1 FROM snapshots latest WHERE latest.id=p.approved_snapshot_id AND latest.plugin_id=p.id AND latest.verdict='allow'" + publicationFilter(env, 'latest') + ')';
}

export async function listVersions(env: Env, pluginId: string, page: number) {
  const from = ' FROM plugins p JOIN snapshots s ON s.plugin_id=p.id WHERE p.id=? AND ' + publishedSnapshotFilter(env);
  if (!await env.DB.prepare('SELECT 1' + from + ' AND s.id=p.approved_snapshot_id').bind(pluginId).first()) throw new AppError(404, '插件未上架或已下架');
  const history = from + ' AND s.id<>p.approved_snapshot_id';
  const pageSize = 20;
  const total = await env.DB.prepare('SELECT COUNT(*) total' + history).bind(pluginId).first<{total:number}>();
  const rows = await env.DB.prepare('SELECT s.id,s.data,s.created_at' + history + ' ORDER BY s.created_at DESC,s.revision DESC,s.id DESC LIMIT ? OFFSET ?').bind(pluginId, pageSize, (page - 1) * pageSize).all<{id:string;data:string;created_at:number}>();
  const items = await Promise.all(rows.results.map(async row => {
    const snapshot = JSON.parse(row.data) as Snapshot;
    // Old uploads may have been removed by the previous retention policy.
    const stored = snapshot.sourceKind !== 'upload' || !!await env.DB.prepare('SELECT 1 FROM uploads WHERE id=? AND plugin_id=?').bind(snapshot.uploadId ?? '', pluginId).first();
    const assets = await env.DB.prepare('SELECT data,disabled FROM assets WHERE snapshot_id=? AND plugin_id=? ORDER BY id').bind(row.id, pluginId).all<{data:string;disabled:number}>();
    return { id: row.id, version: snapshot.tag, publishedAt: row.created_at, assets: assets.results.map(record => {
      const asset = JSON.parse(record.data) as Asset;
      return { id: asset.id, name: asset.name, size: asset.size, sha256: asset.sha256 ?? '', packageName: asset.packageName, architecture: asset.architecture, available: stored && record.disabled === 0 };
    }) };
  }));
  return { items, total: total?.total ?? 0, page, pageSize };
}
