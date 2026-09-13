import { AppError } from './contracts';
import { hasControlCharacters, readBounded, sha256 } from './network';

export interface ArchiveLimits { maxCompressed: number; maxExpanded: number; maxFiles: number; maxDepth: number; maxText: number; maxTextFile: number }
export const DEFAULT_ARCHIVE_LIMITS: ArchiveLimits = { maxCompressed: 32 * 1024 * 1024, maxExpanded: 32 * 1024 * 1024, maxFiles: 2000, maxDepth: 16, maxText: 512 * 1024, maxTextFile: 128 * 1024 };
interface Entry { path: string; bytes: Uint8Array; kind: 'file' | 'directory' | 'symlink' | 'hardlink'; link?: string }
interface Budget { expanded: number; files: number; text: number; limits: ArchiveLimits }
export interface ScanFile { path: string; bytes: Uint8Array }
export interface ParsedIPK { scanFiles?: ScanFile[]; packageName: string; architecture: string; version: string; materials: string; coverage: string[]; binaryFiles: string[]; files: { path: string; size: number; kind: string }[] }
const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false });
const ascii = new TextDecoder();
function incomplete(reason: string): never { throw new AppError(422, reason, 'incomplete'); }
function field(bytes: Uint8Array): string { return ascii.decode(bytes).replace(/\0.*$/su, '').trim(); }
function octal(bytes: Uint8Array): number {
  const value = field(bytes);
  if (!/^[0-7]+$/u.test(value)) incomplete('tar 数值字段不受支持或损坏');
  const number = Number.parseInt(value, 8);
  if (!Number.isSafeInteger(number)) incomplete('tar 数值越界');
  return number;
}
function cleanPath(raw: string, maxDepth: number, rootAllowed = false): string {
  if (raw.includes('\\') || hasControlCharacters(raw) || raw.startsWith('/') || /^[a-z]:/iu.test(raw)) incomplete('归档路径非法');
  const parts = raw.split('/').filter(p => p !== '.' && p !== '');
  if (parts.includes('..') || parts.length > maxDepth || raw.length > 512 || (!parts.length && !rootAllowed)) incomplete('归档路径穿越或深度超限');
  return parts.join('/');
}
function checkLink(path: string, target: string, maxDepth: number): void {
  if (!target || target.startsWith('/') || target.includes('\\') || hasControlCharacters(target)) incomplete('归档链接目标不受支持');
  const parts = path.split('/').slice(0, -1);
  for (const part of target.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') { if (!parts.length) incomplete('归档链接越过包根目录'); parts.pop(); }
    else parts.push(part);
  }
  if (parts.length > maxDepth) incomplete('归档链接深度超限');
}
function parseTar(bytes: Uint8Array, budget: Budget): Entry[] {
  if (bytes.length < 1024 || bytes.length % 512 !== 0) incomplete('tar 长度或终止块损坏');
  const entries: Entry[] = [];
  const seen = new Set<string>();
  let offset = 0;
  let terminated = false;
  while (offset + 512 <= bytes.length) {
    const header = bytes.subarray(offset, offset + 512);
    if (header.every(n => n === 0)) {
      if (offset + 1024 > bytes.length || !bytes.subarray(offset).every(n => n === 0)) incomplete('tar 终止块后存在隐藏内容');
      terminated = true;
      break;
    }
    const expected = octal(header.subarray(148, 156));
    const actual = header.reduce((sum, n, i) => sum + (i >= 148 && i < 156 ? 32 : n), 0);
    if (expected !== actual) incomplete('tar 校验和错误');
    const magic = field(header.subarray(257, 263));
    if (magic && magic !== 'ustar') incomplete('不支持的 tar 变体');
    const prefix = magic === 'ustar' ? field(header.subarray(345, 500)) : '';
    const rawPath = (prefix ? `${prefix}/` : '') + field(header.subarray(0, 100));
    const type = header[156];
    const kind = type === 0 || type === 48 ? 'file' : type === 53 ? 'directory' : type === 50 ? 'symlink' : type === 49 ? 'hardlink' : null;
    if (!kind) incomplete('归档含未支持的特殊条目（PAX/GNU 扩展、设备等）');
    const path = cleanPath(rawPath, budget.limits.maxDepth, kind === 'directory');
    const size = octal(header.subarray(124, 136));
    if (kind !== 'file' && size !== 0) incomplete('非文件归档条目携带内容');
    const end = offset + 512 + size;
    if (end > bytes.length || size > budget.limits.maxExpanded) incomplete('归档条目大小越界');
    budget.files++;
    if (budget.files > budget.limits.maxFiles) incomplete('归档文件数量超限');
    if (path) {
      if (seen.has(path)) incomplete('归档含重复路径');
      seen.add(path);
      const link = kind === 'symlink' || kind === 'hardlink' ? field(header.subarray(157, 257)) : undefined;
      if (link !== undefined) checkLink(kind === 'hardlink' ? 'root' : path, link, budget.limits.maxDepth);
      entries.push({ path, kind, bytes: bytes.subarray(offset + 512, end), ...(link !== undefined ? { link } : {}) });
    }
    offset = Math.ceil(end / 512) * 512;
  }
  if (!terminated) incomplete('tar 缺少终止块');
  return entries;
}
function parseAr(bytes: Uint8Array, budget: Budget): Entry[] {
  if (ascii.decode(bytes.subarray(0, 8)) !== '!<arch>\n') incomplete('不是受支持的 IPK 封装');
  let offset = 8;
  const entries: Entry[] = [];
  const seen = new Set<string>();
  while (offset < bytes.length) {
    if (offset + 60 > bytes.length) incomplete('ar 头部截断');
    const header = ascii.decode(bytes.subarray(offset, offset + 60));
    if (header.slice(58) !== '`\n') incomplete('ar 头部损坏');
    const path = cleanPath(header.slice(0, 16).trim().replace(/\/$/u, ''), 1);
    if (seen.has(path) || path.startsWith('#1/')) incomplete('ar 长文件名或重复条目不受支持');
    seen.add(path);
    const rawSize = header.slice(48, 58).trim();
    if (!/^\d+$/u.test(rawSize)) incomplete('ar 大小字段损坏');
    const size = Number(rawSize);
    if (!Number.isSafeInteger(size) || size > budget.limits.maxCompressed || offset + 60 + size > bytes.length) incomplete('ar 内容截断或超限');
    entries.push({ path, kind: 'file', bytes: bytes.subarray(offset + 60, offset + 60 + size) });
    if (++budget.files > budget.limits.maxFiles) incomplete('ar 条目数量超限');
    offset += 60 + size;
    if (size % 2) { if (bytes[offset] !== 10) incomplete('ar 对齐字节损坏'); offset++; }
  }
  return entries;
}
async function expand(bytes: Uint8Array, gzip: boolean, budget: Budget): Promise<Uint8Array> {
  let result = bytes;
  if (gzip) {
    if (bytes[0] !== 31 || bytes[1] !== 139) incomplete('gzip 标识与内容不符');
    try {
      const body = new Response(bytes as BodyInit).body!.pipeThrough(new DecompressionStream('gzip'));
      result = await readBounded(new Response(body), budget.limits.maxExpanded - budget.expanded);
    } catch (error) {
      if (error instanceof AppError) throw error;
      incomplete('gzip 解压失败');
    }
  }
  budget.expanded += result.length;
  if (budget.expanded > budget.limits.maxExpanded) incomplete('归档累计解包大小超限');
  return result;
}

export async function parseIPK(bytes: Uint8Array, overrides: Partial<ArchiveLimits> = {}, includeScanFiles = false, metadataOnly = false): Promise<ParsedIPK> {
  const limits = { ...DEFAULT_ARCHIVE_LIMITS, ...overrides };
  if (bytes.length > limits.maxCompressed) incomplete('IPK 超过安装包大小上限');
  const budget: Budget = { limits, files: 0, text: 0, expanded: 0 };
  const outer = bytes[0] === 31 && bytes[1] === 139 ? parseTar(await expand(bytes, true, budget), budget) : parseAr(bytes, budget);
  const members = outer.filter(e => e.kind === 'file');
  const debian = members.find(e => e.path === 'debian-binary');
  if (!debian || ascii.decode(debian.bytes).trim() !== '2.0') incomplete('缺少 debian-binary 2.0');
  if (members.some(e => !['debian-binary', 'control.tar', 'control.tar.gz', 'data.tar', 'data.tar.gz'].includes(e.path))) incomplete('IPK 含未支持的压缩成员或额外条目');
  const controls = members.filter(e => /^control\.tar(?:\.gz)?$/u.test(e.path));
  const payloads = members.filter(e => /^data\.tar(?:\.gz)?$/u.test(e.path));
  if (controls.length !== 1 || payloads.length !== 1 || outer.some(e => e.kind !== 'file' && e.kind !== 'directory')) incomplete('IPK control/data 成员缺失或重复');
  const control = controls[0]!;
  const payload = payloads[0]!;
  const controlEntries = parseTar(await expand(control.bytes, control.path.endsWith('.gz'), budget), budget);
  const dataEntries = parseTar(await expand(payload.bytes, payload.path.endsWith('.gz'), budget), budget);
  const controlFile = controlEntries.find(e => e.path === 'control' && e.kind === 'file');
  if (!controlFile) incomplete('IPK 缺少 control 信息');
  if (controlFile.bytes.length > limits.maxTextFile) incomplete('IPK control 信息超过文本预算');
  let controlText: string;
  try { controlText = decoder.decode(controlFile.bytes); } catch { incomplete('IPK control 信息不是 UTF-8 文本'); }
  const values = Object.fromEntries(controlText.split(/\r?\n/u).filter(l => /^[A-Za-z][A-Za-z0-9-]*:/u.test(l)).map(l => [l.slice(0, l.indexOf(':')).toLowerCase(), l.slice(l.indexOf(':') + 1).trim()]));
  if (!values.package || !values.architecture || !values.version || !/^[a-z0-9][a-z0-9+.-]*$/u.test(values.package) || values.architecture.length > 80 || values.version.length > 120) incomplete('IPK 包名、版本或架构缺失/非法');
  const scanFiles: ScanFile[] = [];
  const material: string[] = [];
  const binaryFiles: string[] = [];
  const files: ParsedIPK['files'] = [];
  for (const [section, entries] of [['control', controlEntries], ['data', dataEntries]] as const) {
    for (const entry of entries) {
      const path = `${section}/${entry.path}`;
      files.push({ path, size: entry.bytes.length, kind: entry.kind });
      if (metadataOnly) continue;
      material.push(JSON.stringify({ path, kind: entry.kind, size: entry.bytes.length, link: entry.link }));
      if (entry.kind !== 'file') continue;
      if (includeScanFiles) scanFiles.push({ path, bytes: entry.bytes });
      if (/\.(?:gz|xz|bz2|zst|zip|tar|ipk|deb|7z)$/iu.test(entry.path) || (entry.bytes[0] === 31 && entry.bytes[1] === 139) || (entry.bytes[0] === 80 && entry.bytes[1] === 75)) incomplete(`包内嵌套归档未扫描：${path}`);
      let text: string | null = null;
      if (!entry.bytes.includes(0) && entry.bytes.length > limits.maxTextFile) incomplete(`包内文本或无法识别的二进制超过单文件扫描预算：${path}`);
      try { if (!entry.bytes.includes(0)) text = decoder.decode(entry.bytes); } catch { /* 二进制只记录摘要和边界，不发送 Base64。 */ }
      if (text !== null) {
        budget.text += entry.bytes.length;
        if (entry.bytes.length > limits.maxTextFile || budget.text > limits.maxText) incomplete(`包内文本扫描预算不足：${path}`);
        material.push(JSON.stringify({ path, text }));
      } else {
        if (section === 'control' || /\.(?:sh|bash|py|js|mjs|lua|pl|rb|php)$/iu.test(entry.path) || (entry.bytes[0] === 35 && entry.bytes[1] === 33)) incomplete(`关键脚本无法按 UTF-8 扫描：${path}`);
        binaryFiles.push(path);
        material.push(JSON.stringify({ path, binary: true, sha256: await sha256(entry.bytes), note: '静态清单与摘要，不等于二进制病毒扫描。GitHub 投稿需结合 Release 源码；直传包由独立查毒服务检查。' }));
      }
    }
  }
  return { ...(includeScanFiles ? { scanFiles } : {}), packageName: values.package, architecture: values.architecture, version: values.version, materials: material.join('\n'), binaryFiles, files, coverage: metadataOnly ? ['仅解析 IPK 结构和包信息，未执行内容审核或查毒'] : [`IPK 封装：${bytes[0] === 31 ? 'tar.gz' : 'ar'}；control/data 支持 tar 或 tar.gz`, `全部 ${files.length} 个条目；累计解包 ${budget.expanded} 字节；文本 ${budget.text} 字节；二进制 ${binaryFiles.length} 个（未做动态/杀毒扫描）`, 'PAX/GNU 长名称、xz/zstd、包内嵌套归档和危险链接进入未完成，不静默跳过'] };
}
