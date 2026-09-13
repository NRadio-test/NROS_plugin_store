import { AppError, type Asset, type Env, type Snapshot } from './contracts';
import { parseIPK } from './ipk';
import { GITHUB_HOSTS, hasControlCharacters, readBounded, safeFetch, sha256, type FetchLike } from './network';

interface Repository { id: number; full_name: string; private: boolean; default_branch: string; description?: string | null; license?: { spdx_id?: string | null } | null }
interface GitAsset { id: number; name: string; size: number; browser_download_url: string; digest?: string | null; updated_at: string; state?: string }
interface Release { id: number; tag_name: string; draft: boolean; prerelease: boolean; assets?: GitAsset[] }
type GitEnv = Pick<Env, 'DB' | 'GITHUB_TOKEN' | 'MAX_IPK_BYTES'>;
const SOURCE_LIMITS = { files: 128, bytes: 1024 * 1024, perFile: 256 * 1024, treeEntries: 2000 };
const textDecoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false });
const sourcePattern = /(?:\.(?:[cm]?[jt]sx?|vue|svelte|py|lua|sh|bash|c|h|cc|cpp|cxx|hpp|rs|go|java|kt|swift|pl|rb|php|awk|conf|cfg|ini|toml|yaml|yml|json|xml|mk|cmake)|(?:^|\/)(?:Makefile|Dockerfile|configure|CMakeLists\.txt))$/iu;
const inertPattern = /\.(?:png|jpe?g|gif|webp|ico|avif|woff2?|ttf|otf|pdf|mp[34]|wav|ogg|zip|tar|gz|xz|bz2|7z|ipk|deb)$/iu;
function validId(value: unknown): value is number { return typeof value === 'number' && Number.isSafeInteger(value) && value > 0; }
function commit(value: unknown): string { if (typeof value !== 'string' || !/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u.test(value)) throw new AppError(422, 'GitHub 未提供有效 commit', 'incomplete'); return value; }
function canonicalName(value: unknown): string { if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9_.-]{1,100}$/u.test(value) || value.split('/')[1] === '.' || value.split('/')[1] === '..') throw new AppError(400, 'GitHub 仓库名称非法', 'invalid_repository'); return value; }

export function normalizeRepoUrl(value: string): string {
  if (typeof value !== 'string') throw new AppError(400, '请提供 GitHub 公开仓库链接', 'invalid_repository');
  const input = value.trim();
  if (input.includes('\\') || hasControlCharacters(input)) throw new AppError(400, 'GitHub 仓库地址非法', 'invalid_repository');
  let url: URL;
  try { url = new URL(input); } catch { throw new AppError(400, '请提供完整 GitHub HTTPS 仓库链接', 'invalid_repository'); }
  if (url.protocol !== 'https:' || url.hostname !== 'github.com' || url.port || url.username || url.password || url.search || url.hash || /%/u.test(url.pathname)) throw new AppError(400, '仅支持 github.com 的 HTTPS 公开仓库链接', 'invalid_repository');
  return canonicalName(url.pathname.replace(/^\//u, '').replace(/\/$/u, '').replace(/\.git$/iu, ''));
}

function githubHeaders(env: GitEnv, accept = 'application/vnd.github+json'): Headers {
  const headers = new Headers({ accept, 'user-agent': 'Zhangdao-Plugin-Store/1.0', 'X-GitHub-Api-Version': '2022-11-28' });
  if (env.GITHUB_TOKEN) headers.set('authorization', `Bearer ${env.GITHUB_TOKEN}`);
  return headers;
}

/** 缓存只保存公开 JSON 材料和 ETag，不保存 IPK。每次仍向 GitHub 发起条件校验。 */
async function api<T>(env: GitEnv, path: string, fetcher: FetchLike, useCache = true): Promise<T> {
  const key = `github:${path}`;
  const cached = useCache ? await env.DB.prepare('SELECT etag,value FROM http_cache WHERE key=?').bind(key).first<{ etag: string | null; value: string }>() : null;
  const headers = githubHeaders(env);
  if (cached?.etag) headers.set('if-none-match', cached.etag);
  let response: Response;
  try { response = await safeFetch(`https://api.github.com${path}`, { headers }, { allowedHosts: ['api.github.com'], authHost: 'api.github.com', fetcher }); }
  catch (error) { if (error instanceof AppError && error.code === 'unsafe_url') throw error; throw new AppError(502, 'GitHub 暂时无法访问', 'github_transient'); }
  if (response.status === 304 && cached) { await response.body?.cancel(); return JSON.parse(cached.value) as T; }
  if (!response.ok) {
    await response.body?.cancel();
    if (response.status === 404) throw new AppError(404, 'GitHub 官方 API 暂未找到该资源（单次结果不代表删库）', 'github_missing');
    if ([401, 403, 429].includes(response.status) || response.status >= 500) throw new AppError(502, `GitHub 临时错误或凭据/配额异常 (${response.status})`, 'github_transient');
    throw new AppError(422, `GitHub 资源读取失败 (${response.status})`, 'incomplete');
  }
  const bytes = await readBounded(response, 2 * 1024 * 1024);
  let value: string;
  let data: T;
  try { value = textDecoder.decode(bytes); data = JSON.parse(value) as T; } catch { throw new AppError(502, 'GitHub 返回无效 JSON', 'github_transient'); }
  if (useCache && value.length < 512 * 1024) await env.DB.prepare("INSERT INTO http_cache(key,etag,value,updated_at) SELECT ?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM plugins p WHERE p.blocked=1 AND (?='github:/repositories/'||p.repository_id OR ?='github:/repos/'||p.full_name COLLATE NOCASE OR substr(?,1,length('github:/repos/'||p.full_name||'/'))='github:/repos/'||p.full_name||'/' COLLATE NOCASE)) ON CONFLICT(key) DO UPDATE SET etag=excluded.etag,value=excluded.value,updated_at=excluded.updated_at").bind(key, response.headers.get('etag'), value, Date.now(), key, key, key).run();
  return data;
}

function validateRepository(repo: Repository, expectedId?: number): Repository {
  if (!repo || !validId(repo.id) || (expectedId !== undefined && repo.id !== expectedId)) throw new AppError(422, 'GitHub repository ID 不一致', 'incomplete');
  canonicalName(repo.full_name);
  if (repo.private !== false) throw new AppError(404, '仓库当前不是公开仓库', 'github_missing');
  if (typeof repo.default_branch !== 'string' || !repo.default_branch) throw new AppError(422, '仓库缺少默认分支', 'incomplete');
  return repo;
}
export async function getRepository(env: GitEnv, fullName: string, fetcher: FetchLike = fetch): Promise<Repository> {
  return validateRepository(await api<Repository>(env, `/repos/${canonicalName(fullName)}`, fetcher));
}
async function byId(env: GitEnv, id: number, fetcher: FetchLike, useCache = true): Promise<Repository> {
  if (!validId(id)) throw new AppError(400, 'repository ID 非法', 'invalid_repository');
  try { return validateRepository(await api<Repository>(env, `/repositories/${id}`, fetcher, useCache), id); }
  catch (error) {
    if (!(error instanceof AppError) || error.code !== 'github_missing') throw error;
    // 按不可变 ID 匿名访问官方源排除 token 权限、重命名与转移影响。
    return validateRepository(await api<Repository>({ ...env, GITHUB_TOKEN: undefined }, `/repositories/${id}`, fetcher, false), id);
  }
}
async function resolveTag(env: GitEnv, repo: Repository, tag: string, fetcher: FetchLike, useCache = true): Promise<string> {
  if (typeof tag !== 'string' || !tag || tag.length > 256 || hasControlCharacters(tag)) throw new AppError(422, 'Release tag 非法', 'incomplete');
  let ref = await api<{ object: { type: string; sha: string } }>(env, `/repos/${repo.full_name}/git/ref/tags/${encodeURIComponent(tag)}`, fetcher, useCache);
  for (let depth = 0; depth < 6; depth++) {
    if (!ref?.object) throw new AppError(422, 'Release tag 目标不明', 'incomplete');
    if (ref.object.type === 'commit') return commit(ref.object.sha);
    if (ref.object.type !== 'tag') throw new AppError(422, 'Release tag 未指向源码 commit', 'incomplete');
    ref = await api<typeof ref>(env, `/repos/${repo.full_name}/git/tags/${commit(ref.object.sha)}`, fetcher, useCache);
  }
  throw new AppError(422, '嵌套 tag 解析深度超限', 'incomplete');
}
function decodeBase64(content: unknown, maxBytes: number): Uint8Array {
  if (typeof content !== 'string' || content.length > Math.ceil(maxBytes * 4 / 3) + 20000) throw new AppError(422, 'GitHub 文件超出读取预算', 'incomplete');
  try { const raw = atob(content.replace(/\s/gu, '')); if (raw.length > maxBytes) throw new Error('budget'); return Uint8Array.from(raw, c => c.charCodeAt(0)); }
  catch { throw new AppError(422, 'GitHub 文件内容缺失、损坏或超限', 'incomplete'); }
}
async function readReadme(env: GitEnv, repo: Repository, fetcher: FetchLike, useCache = true, allowMissing = false): Promise<{ readme: string; readmeCommit: string; readmePath: string }> {
  const branch = await api<{ sha: string }>(env, `/repos/${repo.full_name}/commits/${encodeURIComponent(repo.default_branch)}`, fetcher, useCache);
  const readmeCommit = commit(branch.sha);
  let result: { content: string; encoding: string; path: string; size: number };
  try { result = await api<typeof result>(env, `/repos/${repo.full_name}/readme?ref=${readmeCommit}`, fetcher, useCache); }
  catch (error) { if (error instanceof AppError && error.code === 'github_missing') { if (allowMissing) return { readme: '', readmeCommit, readmePath: '' }; throw new AppError(422, '仓库缺少真实 README，请作者补充', 'incomplete'); } throw error; }
  if (result.encoding !== 'base64' || !result.path || result.size > 128 * 1024 || result.path.startsWith('/') || result.path.split('/').includes('..')) throw new AppError(422, 'README 超限或路径不受支持', 'incomplete');
  let readme: string;
  try { readme = textDecoder.decode(decodeBase64(result.content, 128 * 1024)); } catch { throw new AppError(422, 'README 不是可读取 UTF-8 文本', 'incomplete'); }
  if (!allowMissing && !readme.trim()) throw new AppError(422, '仓库 README 为空，请作者补充', 'incomplete');
  return { readme, readmeCommit, readmePath: result.path };
}
async function releaseAssets(env: GitEnv, repo: Repository, releaseId: number, fetcher: FetchLike, useCache = true): Promise<GitAsset[]> {
  const assets = await api<GitAsset[]>(env, `/repos/${repo.full_name}/releases/${releaseId}/assets?per_page=100&page=1`, fetcher, useCache);
  if (!Array.isArray(assets) || assets.length >= 100) throw new AppError(422, 'Release 附件清单超限或不完整', 'incomplete');
  const ipks = assets.filter(a => typeof a.name === 'string' && /\.ipk$/iu.test(a.name));
  if (!ipks.length) throw new AppError(422, '等待作者在正式 Release 上传 IPK 安装包', 'waiting_package');
  if (ipks.length > 8 || new Set(ipks.map(a => a.id)).size !== ipks.length || new Set(ipks.map(a => a.name)).size !== ipks.length) throw new AppError(422, 'IPK 附件数量超限（最多 8 个）或身份重复', 'incomplete');
  return ipks.map(a => {
    if (!validId(a.id) || !Number.isSafeInteger(a.size) || a.size <= 0 || typeof a.updated_at !== 'string' || !a.updated_at || (a.state && a.state !== 'uploaded') || /[/\\]/u.test(a.name) || hasControlCharacters(a.name) || a.name.length > 200) throw new AppError(422, 'IPK 附件身份或元数据非法', 'incomplete');
    let url: URL;
    try { url = new URL(a.browser_download_url); } catch { throw new AppError(422, 'IPK 官方下载 URL 非法', 'incomplete'); }
    if (url.protocol !== 'https:' || url.hostname !== 'github.com' || url.username || url.password || url.port || url.hash || url.search || !url.pathname.startsWith(`/${repo.full_name}/releases/download/`)) throw new AppError(422, 'IPK 附件来源与仓库不符', 'incomplete');
    if (a.digest != null && !/^sha256:[a-f0-9]{64}$/iu.test(a.digest)) throw new AppError(422, 'GitHub 资产摘要格式不支持', 'incomplete');
    return a;
  });
}
export async function readOfficialAsset(env: GitEnv, fullName: string, assetId: number, maxBytes: number, fetcher: FetchLike = fetch): Promise<Uint8Array> {
  const response = await safeFetch(`https://api.github.com/repos/${canonicalName(fullName)}/releases/assets/${assetId}`, { headers: githubHeaders(env, 'application/octet-stream') }, { allowedHosts: GITHUB_HOSTS, authHost: 'api.github.com', fetcher, timeoutMs: 60000 });
  if (!response.ok || /(?:text\/html|application\/json)/iu.test(response.headers.get('content-type') ?? '')) { await response.body?.cancel(); throw new AppError(response.status === 404 ? 404 : 502, 'GitHub IPK 下载失败或返回错误页', response.status === 404 ? 'asset_missing' : 'github_transient'); }
  return readBounded(response, maxBytes);
}

export async function getSnapshot(env: GitEnv, repoId: number, fetcher: FetchLike = fetch, manual = false): Promise<Snapshot> {
  const repo = await byId(env, repoId, fetcher);
  try {
  let release: Release;
  try { release = await api<Release>(env, `/repos/${repo.full_name}/releases/latest`, fetcher); }
  catch (error) { if (error instanceof AppError && error.code === 'github_missing') throw new AppError(422, '等待作者发布正式 Release 和 IPK', 'waiting_package'); throw error; }
  if (!validId(release.id) || release.draft !== false || release.prerelease !== false) throw new AppError(422, '等待作者发布正式 Release', 'waiting_package');
  const sourceCommit = await resolveTag(env, repo, release.tag_name, fetcher);
  const display = await readReadme(env, repo, fetcher, true, manual);
  if (!manual && !repo.description?.trim()) throw new AppError(422, '仓库缺少 GitHub description，请作者补充', 'incomplete');
  const tree = manual ? { truncated: false, tree: [] } : await api<{ truncated: boolean; tree: { path: string; type: string; mode: string; sha: string; size?: number }[] }>(env, `/repos/${repo.full_name}/git/trees/${sourceCommit}?recursive=1`, fetcher);
  if (tree.truncated !== false || !Array.isArray(tree.tree) || tree.tree.length > SOURCE_LIMITS.treeEntries) throw new AppError(422, 'Release 源码清单不完整或超过预算', 'incomplete');
  const coverage: string[] = [];
  const source: { path: string; sha: string; text: string }[] = [];
  let bytesRead = 0;
  let blobsRead = 0;
  let realSourceCount = 0;
  for (const entry of tree.tree) {
    if (entry.type === 'tree') continue;
    if (entry.type !== 'blob' || entry.mode === '160000') throw new AppError(422, '仓库包含外部子模块，关键源码未覆盖', 'incomplete');
    if (typeof entry.path !== 'string' || entry.path.length > 512 || entry.path.split('/').includes('..') || entry.path.startsWith('/')) throw new AppError(422, '源码路径异常', 'incomplete');
    if (inertPattern.test(entry.path)) { coverage.push(`未作为可读源码扫描：${entry.path}（图片/媒体/归档，Git blob ${entry.sha}）`); continue; }
    if (++blobsRead > SOURCE_LIMITS.files || !Number.isSafeInteger(entry.size) || (entry.size ?? 0) > SOURCE_LIMITS.perFile || bytesRead + (entry.size ?? 0) > SOURCE_LIMITS.bytes) throw new AppError(422, `关键源码读取预算不足：${entry.path}`, 'incomplete');
    const blob = await api<{ encoding: string; content: string; size: number }>(env, `/repos/${repo.full_name}/git/blobs/${commit(entry.sha)}`, fetcher);
    if (blob.encoding !== 'base64') throw new AppError(422, `源码内容不受支持：${entry.path}`, 'incomplete');
    const bytes = decodeBase64(blob.content, SOURCE_LIMITS.perFile);
    bytesRead += bytes.length;
    if (bytes.length !== entry.size || bytesRead > SOURCE_LIMITS.bytes) throw new AppError(422, '源码读取大小与清单不符或超限', 'incomplete');
    let content: string;
    try { if (bytes.includes(0)) throw new Error('binary'); content = textDecoder.decode(bytes); }
    catch { if (sourcePattern.test(entry.path) || entry.mode === '120000') throw new AppError(422, `关键源码不能作为 UTF-8 检查：${entry.path}`, 'incomplete'); coverage.push(`仓库二进制未作可读源码扫描：${entry.path}（Git blob ${entry.sha}）`); continue; }
    if (content.startsWith('version https://git-lfs.github.com/spec/v1')) throw new AppError(422, '仓库源码含未读取的 Git LFS 内容', 'incomplete');
    source.push({ path: entry.path, sha: entry.sha, text: content });
    if (sourcePattern.test(entry.path) || content.startsWith('#!')) realSourceCount++;
  }
  if (!manual && !realSourceCount) throw new AppError(422, '未取得 Release 对应的可读源码或构建材料', 'incomplete');
  coverage.unshift(`Release 源码 commit ${sourceCommit}；读取 ${source.length} 个文本文件、${bytesRead} 字节，未执行源码/构建命令`);
  const rawAssets = await releaseAssets(env, repo, release.id, fetcher);
  const maxBytes = Number(env.MAX_IPK_BYTES || 32 * 1024 * 1024);
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 64 * 1024 * 1024) throw new AppError(503, 'IPK 大小配置非法（1–64 MiB 范围）', 'incomplete');
  const assets: Asset[] = [];
  const packages: { name: string; materials: string }[] = [];
  for (const asset of rawAssets) {
    if (asset.size > maxBytes) throw new AppError(422, `IPK 超过大小上限：${asset.name}`, 'incomplete');
    const bytes = await readOfficialAsset(env, repo.full_name, asset.id, maxBytes, fetcher);
    if (bytes.length !== asset.size) throw new AppError(422, 'IPK 实际大小与审核清单不符', 'incomplete');
    const digest = await sha256(bytes);
    if (asset.digest && asset.digest.toLowerCase() !== `sha256:${digest}`) throw new AppError(422, 'IPK SHA-256 与 GitHub 官方摘要不符', 'incomplete');
    const parsed = await parseIPK(bytes, { maxCompressed: maxBytes }, false, manual);
    if (!manual && parsed.binaryFiles.length && !source.some(file => /(?:^|\/)(?:Makefile|CMakeLists\.txt|Cargo\.toml|go\.mod|package\.json|meson\.build|build\.gradle|configure|.*\.mk|.*\.cmake)$/iu.test(file.path))) throw new AppError(422, 'IPK 含二进制，但 Release 缺少对应构建配置，无法建立必要源码关联', 'incomplete');
    assets.push({ id: asset.id, name: asset.name, size: asset.size, url: asset.browser_download_url, digest: asset.digest?.toLowerCase() ?? null, updatedAt: asset.updated_at, sha256: digest, packageName: parsed.packageName, architecture: parsed.architecture });
    coverage.push(...parsed.coverage.map(c => `${asset.name}: ${c}`));
    packages.push({ name: asset.name, materials: parsed.materials });
  }
  const license = repo.license?.spdx_id && repo.license.spdx_id !== 'NOASSERTION' ? repo.license.spdx_id : null;
  const identity = { repositoryId: repo.id, fullName: repo.full_name, description: repo.description ?? '', license, ...display, releaseId: release.id, tag: release.tag_name, sourceCommit, assets };
  const materials = JSON.stringify({ ...identity, source, packages, coverage, licenseNote: license ?? 'GitHub 未识别许可证；public 不等于自动授予开源授权，需结合仓库许可文件判断。' });
  if (materials.length > 2 * 1024 * 1024) throw new AppError(422, '累计审核材料超出持久化预算', 'incomplete');
  return { ...identity, materials, coverage, fingerprint: await sha256(JSON.stringify(identity)) };
  } catch (error) {
    if (error instanceof AppError && error.code === 'github_missing') throw new AppError(422, 'Release tag、源码或其他审核材料缺失，仓库本身仍可访问', 'incomplete');
    throw error;
  }
}

/** 发布前再次访问官方源；没有官方摘要时重新读取并哈希，不信任可变 URL。 */
export async function verifySnapshot(env: GitEnv, snapshot: Snapshot, fetcher: FetchLike = fetch): Promise<boolean> {
  try {
    const repo = await byId(env, snapshot.repositoryId, fetcher, false);
    if (repo.full_name !== snapshot.fullName || (repo.description ?? '') !== snapshot.description || (repo.license?.spdx_id && repo.license.spdx_id !== 'NOASSERTION' ? repo.license.spdx_id : null) !== snapshot.license) return false;
    const release = await api<Release>(env, `/repos/${repo.full_name}/releases/${snapshot.releaseId}`, fetcher, false);
    if (release.id !== snapshot.releaseId || release.draft !== false || release.prerelease !== false || release.tag_name !== snapshot.tag || await resolveTag(env, repo, snapshot.tag, fetcher, false) !== snapshot.sourceCommit) return false;
    const display = await readReadme(env, repo, fetcher, false, snapshot.publicationMode === 'manual');
    if (display.readmeCommit !== snapshot.readmeCommit || display.readmePath !== snapshot.readmePath || display.readme !== snapshot.readme) return false;
    const assets = await releaseAssets(env, repo, release.id, fetcher, false);
    if (assets.length !== snapshot.assets.length) return false;
    for (const original of snapshot.assets) {
      const current = assets.find(a => a.id === original.id);
      if (!current || current.name !== original.name || current.size !== original.size || current.updated_at !== original.updatedAt || current.browser_download_url !== original.url || (current.digest?.toLowerCase() ?? null) !== original.digest) return false;
      if (current.digest) { if (current.digest.toLowerCase() !== `sha256:${original.sha256}`) return false; }
      else if (await sha256(await readOfficialAsset(env, repo.full_name, current.id, original.size, fetcher)) !== original.sha256) return false;
    }
    return true;
  } catch (error) {
    if (error instanceof AppError && ['github_missing', 'asset_missing', 'incomplete', 'waiting_package'].includes(error.code)) return false;
    throw error;
  }
}
