import { AppError, type Asset, type DownloadSource, type Env, type Snapshot } from './contracts';
import { GITHUB_HOSTS, readBounded, safeFetch, validatePublicHttpsUrl } from './network';
import { hash, hmac, rateLimit } from './security';

interface Approved { snapshotId: string; snapshot: Snapshot; asset: Asset }
export const OFFICIAL_SOURCE: DownloadSource = { id: 'github', name: 'GitHub 官方', template: 'https://api.github.com/repos/{owner}/{repo}/releases/assets/{assetId}', allowedHosts: GITHUB_HOSTS, enabled: true, trusted: true, priority: 0, timeoutMs: 60000 };
const githubHeaders = (env: Env) => ({ Accept: 'application/vnd.github+json', 'User-Agent': 'Zhangdao-Plugin-Store', 'X-GitHub-Api-Version': '2022-11-28', ...(env.GITHUB_TOKEN ? { Authorization: `Bearer ${env.GITHUB_TOKEN}` } : {}) });
async function officialJSON(env: Env, path: string): Promise<Record<string, unknown>> {
 const response = await safeFetch('https://api.github.com' + path, { headers: githubHeaders(env) }, { allowedHosts: ['api.github.com'], authHost: 'api.github.com', timeoutMs: 15000 });
 if (!response.ok) { await response.body?.cancel(); throw new AppError(response.status === 404 ? 409 : 503, response.status === 404 ? '已审核的 GitHub 产物暂不可核验，请稍后同步' : 'GitHub 暂时无法核验，请稍后重试', 'source_verification'); }
 try { return JSON.parse(new TextDecoder().decode(await readBounded(response, 2 * 1024 * 1024))) as Record<string, unknown>; }
 catch (error) { if (error instanceof AppError) throw error; throw new AppError(502, 'GitHub 元数据格式错误'); }
}
async function approved(env: Env, pluginId: string, assetId: number): Promise<Approved> {
 if (!Number.isSafeInteger(assetId) || assetId <= 0 || !/^[A-Za-z0-9_-]{1,100}$/.test(pluginId)) throw new AppError(400, '下载标识无效');
 const row = await env.DB.prepare("SELECT p.approved_snapshot_id,s.data AS snapshot_data,a.data AS asset_data FROM plugins p JOIN snapshots s ON s.id=p.approved_snapshot_id JOIN assets a ON a.snapshot_id=s.id AND a.plugin_id=p.id WHERE p.id=? AND p.status='published' AND p.blocked=0 AND a.id=? AND a.disabled=0 AND s.verdict='allow'").bind(pluginId, assetId).first<{ approved_snapshot_id: string; snapshot_data: string; asset_data: string }>();
 if (!row) throw new AppError(404, '该安装包尚未通过审核或已停用', 'unapproved_asset');
 const snapshot = JSON.parse(row.snapshot_data) as Snapshot, asset = JSON.parse(row.asset_data) as Asset;
 if (asset.id !== assetId || !snapshot.assets.some(a => a.id === assetId) || !asset.name.toLowerCase().endsWith('.ipk') || !Number.isSafeInteger(asset.size) || asset.size < 1 || asset.size > (Number(env.MAX_IPK_BYTES) || 32 * 1024 * 1024)) throw new AppError(409, '资产快照不完整');
 return { snapshotId: row.approved_snapshot_id, snapshot, asset };
}
async function verifyOfficial(env: Env, selected: Approved): Promise<string> {
 const { snapshot, asset } = selected;
 const repo = await officialJSON(env, `/repositories/${snapshot.repositoryId}`);
 if (repo.id !== snapshot.repositoryId || repo.private !== false || typeof repo.full_name !== 'string' || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo.full_name)) throw new AppError(409, '仓库身份或公开状态已改变', 'changed_asset');
 const fullName = repo.full_name;
 const release = await officialJSON(env, `/repos/${fullName}/releases/${snapshot.releaseId}`);
 const commit = await officialJSON(env, `/repos/${fullName}/commits/${encodeURIComponent(snapshot.tag)}`);
 const current = Array.isArray(release.assets) ? release.assets.find((item: Record<string, unknown>) => item.id === asset.id) as Record<string, unknown> | undefined : undefined;
 if (release.id !== snapshot.releaseId || release.tag_name !== snapshot.tag || release.draft !== false || release.prerelease !== false || commit.sha !== snapshot.sourceCommit || !current || current.name !== asset.name || current.size !== asset.size || current.updated_at !== asset.updatedAt || current.state !== 'uploaded' || (asset.digest && current.digest !== asset.digest) || (typeof current.digest === 'string' && current.digest.startsWith('sha256:') && asset.sha256 && current.digest !== `sha256:${asset.sha256}`)) {
  await env.DB.prepare('UPDATE assets SET disabled=1 WHERE snapshot_id=? AND id=?').bind(selected.snapshotId, asset.id).run();
  throw new AppError(409, '版本标签或安装包已改变，需要重新审核', 'changed_asset');
 }
 return fullName;
}
export function validateSource(source: DownloadSource): void {
 if (!source || !/^[A-Za-z0-9_-]{1,40}$/.test(source.id) || typeof source.name !== 'string' || source.name.length > 80 || !Array.isArray(source.allowedHosts) || source.allowedHosts.length < 1 || source.allowedHosts.length > 10 || !Number.isInteger(source.priority) || !Number.isInteger(source.timeoutMs) || source.timeoutMs < 1000 || source.timeoutMs > 120000 || typeof source.enabled !== 'boolean' || typeof source.trusted !== 'boolean') throw new AppError(400, '下载源设置格式错误');
 if (typeof source.template !== 'string' || source.template.length > 2048 || !source.template.includes('{assetId}')) throw new AppError(400, '下载源模板必须包含固定 assetId');
 for (const host of source.allowedHosts) {
  if (typeof host !== 'string' || host !== host.toLowerCase() || new URL(`https://${host}`).hostname !== host) throw new AppError(400, '允许主机格式错误');
  validatePublicHttpsUrl(`https://${host}`);
 }
 const expanded = source.template.replace(/\{(owner|repo|assetId|releaseId|tag|filename)\}/g, 'safe');
 if (/[{}]/.test(expanded)) throw new AppError(400, '下载源模板包含未知变量');
 validatePublicHttpsUrl(expanded, source.allowedHosts);
 if (source.id === 'github' && (source.template !== OFFICIAL_SOURCE.template || JSON.stringify([...source.allowedHosts].sort()) !== JSON.stringify([...GITHUB_HOSTS].sort()))) throw new AppError(400, '官方源的地址规则和允许主机不可改变');
}
export async function sourceFingerprint(source: DownloadSource): Promise<string> {
 validateSource(source);
 return hash(JSON.stringify({ id: source.id, template: source.template, allowedHosts: [...source.allowedHosts].sort(), timeoutMs: source.timeoutMs }));
}
function sourceURL(source: DownloadSource, selected: Approved, fullName: string) {
 const [owner, repo] = fullName.split('/');
 const values: Record<string, string> = { owner: owner!, repo: repo!, assetId: String(selected.asset.id), releaseId: String(selected.snapshot.releaseId), tag: selected.snapshot.tag, filename: selected.asset.name };
 return source.template.replace(/\{(owner|repo|assetId|releaseId|tag|filename)\}/g, (_, key: string) => encodeURIComponent(values[key]!));
}
async function sources(env: Env): Promise<DownloadSource[]> {
 const row = await env.DB.prepare("SELECT value FROM settings WHERE key='sources'").first<{ value: string }>();
 const list = row ? JSON.parse(row.value) as DownloadSource[] : [OFFICIAL_SOURCE];
 if (!Array.isArray(list) || list.length > 12) throw new AppError(503, '下载源配置无效');
 const enabled: DownloadSource[] = [];
 for (const source of list) {
  validateSource(source);
  if (!source.enabled) continue;
  if (source.id === 'github') enabled.push(source);
  else if (source.trusted) {
   const proof = await env.DB.prepare('SELECT value FROM settings WHERE key=?').bind('source-tested:' + source.id).first<{value:string}>();
   if (proof && JSON.parse(proof.value) === JSON.stringify({...source,enabled:false})) enabled.push(source);
  }
 }
 return enabled.sort((a, b) => a.priority - b.priority);
}
export function parseRange(value: string | null, size: number): { start: number; end: number } | null {
 if (!value) return null;
 const match = /^bytes=(\d*)-(\d*)$/.exec(value);
 if (!match || (!match[1] && !match[2])) throw new AppError(416, '仅支持一个有效的 bytes Range');
 let start: number, end: number;
 if (!match[1]) { const suffix = Number(match[2]); if (!Number.isSafeInteger(suffix) || suffix <= 0) throw new AppError(416, 'Range 超出范围'); start = Math.max(0, size - suffix); end = size - 1; }
 else { start = Number(match[1]); end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1; }
 if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= size || start < 0 || end < start) throw new AppError(416, 'Range 超出范围');
 return { start, end };
}
function disposition(name: string): string {
 const safe = [...name].map(c => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127 || '/\\";'.includes(c) ? '_' : c).join('');
 const ascii = safe.replace(/[^\x20-\x7e]/g, '_');
 return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(safe).replace(/['()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase())}`;
}
function ipkMagic(value: Uint8Array): boolean {
 return (value[0] === 0x1f && value[1] === 0x8b) || new TextDecoder().decode(value.slice(0,8)) === '!<arch>\n';
}
async function obtain(env: Env, source: DownloadSource, selected: Approved, fullName: string, request: Request, range: {start:number;end:number} | null): Promise<Response> {
 const headers = new Headers({ Accept: 'application/octet-stream', 'User-Agent': 'Zhangdao-Plugin-Store' });
 if (range) headers.set('Range', `bytes=${range.start}-${range.end}`);
 const target = sourceURL(source, selected, fullName);
 if (new URL(target).hostname === 'api.github.com' && source.id === 'github' && env.GITHUB_TOKEN) headers.set('Authorization', `Bearer ${env.GITHUB_TOKEN}`);
 const response = await safeFetch(target, { method: request.method, headers, signal: request.signal }, { allowedHosts: source.allowedHosts, timeoutMs: source.timeoutMs, authHost: 'api.github.com' });
 try {
  if (response.status !== (range ? 206 : 200)) throw new AppError(502, '下载源未返回所需的安装包内容', 'upstream_response');
  const type = (response.headers.get('Content-Type') || '').split(';')[0]!.toLowerCase();
  if (!['application/octet-stream','application/gzip','application/x-gzip','application/x-ipk','application/vnd.debian.binary-package','application/x-archive','binary/octet-stream','application/x-debian-package'].includes(type)) throw new AppError(502, '下载源返回的内容类型不是安装包', 'upstream_response');
  const expected = range ? range.end - range.start + 1 : selected.asset.size;
  const length = response.headers.get('Content-Length');
  if (length !== null && (!/^\d+$/.test(length) || Number(length) !== expected)) throw new AppError(502, '下载源文件大小与审核快照不符', 'changed_asset');
  if (response.headers.get('Content-Encoding') && response.headers.get('Content-Encoding') !== 'identity') throw new AppError(502, '下载源返回了额外内容压缩');
  if (range && response.headers.get('Content-Range') !== `bytes ${range.start}-${range.end}/${selected.asset.size}`) throw new AppError(502, '下载源 Range 与审核快照不符');
  return response;
 } catch (error) { await response.body?.cancel(); throw error; }
}
export async function forwardDownload(request: Request, env: Env, pluginId: string, assetId: number | string): Promise<Response> {
 if (!['GET','HEAD'].includes(request.method)) throw new AppError(405, '下载仅支持 GET/HEAD');
 if ([...new URL(request.url).searchParams.keys()].length > 0) throw new AppError(400, '下载地址不接受目标 URL 或来源参数');
 const selected = await approved(env, pluginId, Number(assetId));
 let range;
 try { range = parseRange(request.headers.get('Range'), selected.asset.size); }
 catch (error) { if (error instanceof AppError && error.status === 416) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${selected.asset.size}`, 'Cache-Control': 'no-store' } }); throw error; }
 const identity = await hmac(env.PHONE_HMAC_KEY, `download:${request.headers.get('CF-Connecting-IP') || 'local'}:${(request.headers.get('User-Agent') || '').slice(0,256)}`);
 await rateLimit(env, 'download:' + identity, 120, 60);
 let upstream: Response | undefined;
 if (selected.snapshot.sourceKind === 'upload') {
  if (!env.UPLOADS || !selected.asset.objectKey || !selected.asset.objectEtag) throw new AppError(503, '直传文件存储不可用');
  const object = request.method === 'HEAD' ? await env.UPLOADS.head(selected.asset.objectKey) : await env.UPLOADS.get(selected.asset.objectKey, { onlyIf: { etagMatches: selected.asset.objectEtag }, ...(range ? { range: { offset: range.start, length: range.end - range.start + 1 } } : {}) });
  if (!object || object.size !== selected.asset.size || object.etag !== selected.asset.objectEtag || (request.method !== 'HEAD' && !('body' in object))) throw new AppError(409, '已审核安装包缺失或发生变化，请重新上传审核', 'changed_asset');
  upstream = new Response('body' in object ? (object as R2ObjectBody).body : null);
 } else {
 const fullName = await verifyOfficial(env, selected);
 const configured = await sources(env);
 for (const source of configured) {
  try { upstream = await obtain(env, source, selected, fullName, request, range); break; }
  catch { if (request.signal.aborted) throw new AppError(499, '下载请求已取消'); }
 }
 }
 if (!upstream) throw new AppError(502, '没有可用下载源，请稍后重试', 'no_download_source');
 const expected = range ? range.end - range.start + 1 : selected.asset.size;
 const headers = new Headers({ 'Content-Type': 'application/octet-stream', 'Content-Disposition': disposition(selected.asset.name), 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, no-store', 'Accept-Ranges': 'bytes', 'Content-Length': String(expected) });
 if (range) headers.set('Content-Range', `bytes ${range.start}-${range.end}/${selected.asset.size}`);
 if (selected.asset.sha256) headers.set('X-Reviewed-SHA256', selected.asset.sha256);
 if (request.method === 'HEAD') { await upstream.body?.cancel(); return new Response(null, { status: range ? 206 : 200, headers }); }
 if (!upstream.body) throw new AppError(502, '下载源没有返回文件');
 const reader = upstream.body.getReader();
 let first: ReadableStreamReadResult<Uint8Array>;
 try { first = await reader.read(); }
 catch { await reader.cancel().catch(() => undefined); throw new AppError(502, '下载源读取失败'); }
 if (first.done || first.value.length > expected) { await reader.cancel(); throw new AppError(502, '下载内容为空或超出审核大小'); }
 // 起始片段需足够识别 ar/gzip；不把 HTML/JSON 错误正文作为安装包送出。
 let prefix = first.value;
 if (!range || range.start === 0) {
  while (prefix.length < Math.min(8,expected)) {
   const next = await reader.read();
   if (next.done) { await reader.cancel(); throw new AppError(502, '安装包被截断'); }
   const joined = new Uint8Array(prefix.length + next.value.length); joined.set(prefix); joined.set(next.value,prefix.length); prefix = joined;
  }
  if ((expected >= 8 && !ipkMagic(prefix)) || prefix.length > expected) { await reader.cancel(); throw new AppError(502, '下载源没有返回支持的 IPK 内容'); }
 }
 const stillApproved = await env.DB.prepare("SELECT 1 AS ok FROM plugins p JOIN assets a ON a.snapshot_id=p.approved_snapshot_id AND a.plugin_id=p.id WHERE p.id=? AND p.approved_snapshot_id=? AND p.status='published' AND p.blocked=0 AND a.id=? AND a.disabled=0").bind(pluginId, selected.snapshotId, selected.asset.id).first();
 if (!stillApproved) { await reader.cancel(); throw new AppError(409, '安装包状态已改变，请刷新页面'); }
 const now = Date.now(), bucket = Math.floor(now / (10 * 60 * 1000));
 try {
  await env.DB.batch([
   env.DB.prepare("INSERT OR IGNORE INTO download_attempts(identity,plugin_id,asset_id,bucket,created_at) SELECT ?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM download_attempts WHERE identity=? AND plugin_id=? AND asset_id=? AND created_at>?) AND EXISTS(SELECT 1 FROM plugins WHERE id=? AND approved_snapshot_id=? AND status='published' AND blocked=0)").bind(identity,pluginId,selected.asset.id,bucket,now,identity,pluginId,selected.asset.id,now-10*60*1000,pluginId,selected.snapshotId),
   env.DB.prepare('UPDATE plugins SET download_count=download_count+1 WHERE id=? AND changes()=1').bind(pluginId),
  ]);
 } catch { await reader.cancel(); throw new AppError(503, '暂时无法记录下载尝试'); }
 let received = prefix.length;
 const body = new ReadableStream<Uint8Array>({
  start(controller) { controller.enqueue(prefix); },
  async pull(controller) {
   try {
    const next = await reader.read();
    if (next.done) { if (received !== expected) throw new Error('下载源提前结束'); controller.close(); return; }
    received += next.value.length;
    if (received > expected) throw new Error('下载源超出审核文件大小');
    controller.enqueue(next.value);
   } catch (error) { await reader.cancel().catch(() => undefined); controller.error(error); }
  },
  async cancel(reason) { await reader.cancel(reason); },
 });
 return new Response(body, { status: range ? 206 : 200, headers });
}
/** 测试仅确认此固定资产可取且前缀匹配；不宣称整包哈希验证。 */
export async function testSource(env: Env, source: DownloadSource, pluginId: string, assetId: number | string) {
 validateSource(source);
 const selected = await approved(env, pluginId, Number(assetId));
 if (selected.snapshot.sourceKind === 'upload') throw new AppError(400, '直传安装包使用商店存储，无需测试 GitHub 下载源');
 const fullName = await verifyOfficial(env, selected);
 const range = { start: 0, end: Math.min(4095, selected.asset.size - 1) };
 const response = await obtain(env, source, selected, fullName, new Request('https://plugin.zdwifi.com/source-test'), range);
 const bytes = await readBounded(response, 4096);
 if (bytes.length !== range.end + 1 || !ipkMagic(bytes)) throw new AppError(502, '下载源样本与 IPK 格式不符');
 return { ok: true as const, configFingerprint: await sourceFingerprint(source), assetId: selected.asset.id, bytesChecked: bytes.length, sha256Verified: false, testedAt: Date.now() };
}
