import { AppError } from './contracts';

export type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
export const GITHUB_HOSTS = ['api.github.com', 'github.com', 'release-assets.githubusercontent.com', 'objects.githubusercontent.com', 'github-releases.githubusercontent.com', 'raw.githubusercontent.com'];
const officialHosts = new Set(GITHUB_HOSTS);
export function hasControlCharacters(value: string): boolean { return [...value].some(c => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127); }

export function validatePublicHttpsUrl(value: string, allowedHosts?: string[]): URL {
  if (/[\s\\]/u.test(value) || hasControlCharacters(value)) throw new AppError(400, '地址包含非法字符', 'unsafe_url');
  let url: URL;
  try { url = new URL(value); } catch { throw new AppError(400, '需要完整 HTTPS 地址', 'unsafe_url'); }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== 'https:' || url.username || url.password || url.hash || (url.port && url.port !== '443') || host.endsWith('.') || !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z][a-z0-9-]*$/u.test(host) || /(?:^|\.)(?:localhost|local|internal|test|invalid|example|onion)$/u.test(host)) {
    throw new AppError(400, '仅允许公共 HTTPS 主机，不允许 IP、凭据或本地地址', 'unsafe_url');
  }
  if (allowedHosts && !allowedHosts.map(h => h.toLowerCase()).includes(host)) throw new AppError(400, '目标主机不在允许列表', 'unsafe_url');
  return url;
}

function isPublicAddress(address: string): boolean {
  if (address.includes(':')) {
    const ip = address.toLowerCase();
    return /^[23][0-9a-f]{3}:/u.test(ip) && !ip.startsWith('2001:db8:') && !ip.startsWith('2001:0:') && !ip.startsWith('2002:') && !ip.includes('.') && !ip.startsWith('2001:10:') && !ip.startsWith('2001:20:');
  }
  const p = address.split('.').map(Number);
  if (p.length !== 4 || p.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  const [a, b, c] = p as [number, number, number, number];
  return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0 || (b === 88 && c === 99))) || (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) || (a === 203 && b === 0 && c === 113));
}

/** 只向固定 DoH 服务查询，拒绝混合公共/私有回答；实际 fetch 仍由 Workers 网络层解析。 */
export async function assertPublicDns(host: string, fetcher: FetchLike = fetch): Promise<void> {
  if (officialHosts.has(host)) return;
  let found = false;
  for (const type of ['A', 'AAAA']) {
    let response: Response;
    try { response = await fetcher(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(host)}&type=${type}`, { headers: { accept: 'application/dns-json' }, redirect: 'manual', signal: AbortSignal.timeout(5000) }); }
    catch { throw new AppError(502, '无法验证目标主机 DNS', 'unsafe_dns'); }
    if (!response.ok) throw new AppError(502, '无法验证目标主机 DNS', 'unsafe_dns');
    const data = JSON.parse(new TextDecoder().decode(await readBounded(response, 32768))) as { Status?: number; Answer?: { type: number; data: string }[] };
    if (data.Status !== 0) throw new AppError(400, '目标主机 DNS 无效', 'unsafe_dns');
    for (const answer of data.Answer ?? []) {
      if (answer.type === 1 || answer.type === 28) {
        found = true;
        if (!isPublicAddress(answer.data)) throw new AppError(400, '目标主机解析到非公共地址', 'unsafe_dns');
      }
    }
  }
  if (!found) throw new AppError(400, '目标主机无公共地址', 'unsafe_dns');
}

export interface SafeFetchOptions { allowedHosts?: string[]; timeoutMs?: number; maxRedirects?: number; fetcher?: FetchLike; authHost?: string }

export async function safeFetch(value: string, init: RequestInit = {}, options: SafeFetchOptions = {}): Promise<Response> {
  const fetcher = options.fetcher ?? fetch;
  let url = validatePublicHttpsUrl(value, options.allowedHosts);
  const authHost = options.authHost ?? url.hostname;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort('timeout'), options.timeoutMs ?? 20000);
  const onAbort = () => controller.abort(init.signal?.reason);
  init.signal?.addEventListener('abort', onAbort, { once: true });
  if (init.signal?.aborted) onAbort();
  const cleanup = () => { clearTimeout(timeout); init.signal?.removeEventListener('abort', onAbort); };
  const headers = new Headers(init.headers);
  headers.delete('cookie');
  headers.delete('proxy-authorization');
  try {
    for (let redirects = 0; ; redirects++) {
      await assertPublicDns(url.hostname, fetcher);
      if (url.hostname !== authHost) headers.delete('authorization');
      const response = await fetcher(url.toString(), { ...init, headers, redirect: 'manual', signal: controller.signal });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        await response.body?.cancel();
        if (redirects >= (options.maxRedirects ?? 4) || (init.method && !['GET', 'HEAD'].includes(init.method))) throw new AppError(502, '上游重定向不受支持', 'unsafe_redirect');
        const location = response.headers.get('location');
        if (!location) throw new AppError(502, '上游重定向缺少地址', 'unsafe_redirect');
        url = validatePublicHttpsUrl(new URL(location, url).toString(), options.allowedHosts);
        continue;
      }
      if (!response.body) { cleanup(); return response; }
      const reader = response.body.getReader();
      const body = new ReadableStream<Uint8Array>({
        async pull(streamController) {
          try {
            const next = await reader.read();
            if (next.done) { cleanup(); streamController.close(); }
            else streamController.enqueue(next.value);
          } catch (error) { cleanup(); streamController.error(error); }
        },
        async cancel(reason) { controller.abort(reason); cleanup(); await reader.cancel(reason); },
      });
      return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
    }
  } catch (error) {
    cleanup();
    if (error instanceof AppError) throw error;
    throw new AppError(502, '上游网络错误或超时', 'network_error');
  }
}

export async function readBounded(response: Response, maxBytes: number): Promise<Uint8Array> {
  const announced = response.headers.get('content-length');
  if (announced && Number(announced) > maxBytes) { await response.body?.cancel(); throw new AppError(422, '内容超过读取预算', 'incomplete'); }
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  // 已知长度的 IPK 不再额外保留一份 chunk 集合，避免触及 Workers 内存限制。
  if (announced && /^\d+$/u.test(announced)) {
    const bytes = new Uint8Array(Number(announced));
    let offset = 0;
    try {
      for (;;) {
        const next = await reader.read();
        if (next.done) break;
        if (offset + next.value.length > bytes.length) throw new AppError(422, '内容与声明长度不符', 'incomplete');
        bytes.set(next.value, offset); offset += next.value.length;
      }
      if (offset !== bytes.length) throw new AppError(422, '内容被截断', 'incomplete');
      return bytes;
    } catch (error) { await reader.cancel().catch(() => undefined); throw error; }
  }
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maxBytes) throw new AppError(422, '内容超过读取预算', 'incomplete');
      chunks.push(value);
    }
  } catch (error) { await reader.cancel().catch(() => undefined); throw error; }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}

export async function sha256(bytes: Uint8Array | string): Promise<string> {
  const input = typeof bytes === 'string' ? new TextEncoder().encode(bytes) : bytes;
  const result = await crypto.subtle.digest('SHA-256', input as BufferSource);
  return Array.from(new Uint8Array(result), n => n.toString(16).padStart(2, '0')).join('');
}
