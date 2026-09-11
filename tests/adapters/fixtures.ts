import { sha256, type FetchLike } from '../../worker/network';

export interface TarFile { name: string; text?: string; bytes?: Uint8Array; type?: string; link?: string }
const encoder = new TextEncoder();
function join(chunks: Uint8Array[]): Uint8Array { const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0)); let i = 0; for (const chunk of chunks) { out.set(chunk, i); i += chunk.length; } return out; }
export function makeTar(files: TarFile[]): Uint8Array {
  const chunks: Uint8Array[] = [];
  for (const file of files) {
    const data = file.bytes ?? encoder.encode(file.text ?? '');
    const h = new Uint8Array(512);
    const put = (at: number, text: string) => h.set(encoder.encode(text), at);
    put(0, file.name); put(100, '0000755\0'); put(108, '0000000\0'); put(116, '0000000\0'); put(124, data.length.toString(8).padStart(11, '0') + '\0'); put(136, '00000000000\0'); put(148, '        '); put(156, file.type ?? '0'); put(257, 'ustar\0'); put(263, '00');
    if (file.link) put(157, file.link);
    const sum = h.reduce((a, b) => a + b, 0);
    put(148, sum.toString(8).padStart(6, '0') + '\0 ');
    chunks.push(h, data, new Uint8Array((512 - data.length % 512) % 512));
  }
  chunks.push(new Uint8Array(1024));
  return join(chunks);
}
export async function gzip(bytes: Uint8Array): Promise<Uint8Array> { return new Uint8Array(await new Response(new Response(bytes as BodyInit).body!.pipeThrough(new CompressionStream('gzip'))).arrayBuffer()); }
export function makeAr(files: { name: string; bytes: Uint8Array }[]): Uint8Array {
  const chunks = [encoder.encode('!<arch>\n')];
  for (const file of files) {
    const header = file.name.padEnd(16) + '0'.padEnd(12) + '0'.padEnd(6) + '0'.padEnd(6) + '100644'.padEnd(8) + String(file.bytes.length).padEnd(10) + '`\n';
    chunks.push(encoder.encode(header), file.bytes);
    if (file.bytes.length % 2) chunks.push(encoder.encode('\n'));
  }
  return join(chunks);
}
export async function makeIPK(options: { outer?: 'ar' | 'tar.gz'; controlFiles?: TarFile[]; dataFiles?: TarFile[] } = {}): Promise<Uint8Array> {
  const files = [{ name: 'debian-binary', bytes: encoder.encode('2.0\n') }, { name: 'control.tar.gz', bytes: await gzip(makeTar(options.controlFiles ?? [{ name: './control', text: 'Package: harmless-demo\nVersion: 1.0.0\nArchitecture: all\nDescription: A harmless test fixture\n' }, { name: './postinst', text: '#!/bin/sh\n# harmless fixture; never execute\nexit 0\n' }])) }, { name: 'data.tar.gz', bytes: await gzip(makeTar(options.dataFiles ?? [{ name: './usr/bin/harmless-demo', text: '#!/bin/sh\nprintf "hello\\n"\n' }])) }];
  return options.outer === 'tar.gz' ? gzip(makeTar(files.map(f => ({ name: `./${f.name}`, bytes: f.bytes })))) : makeAr(files);
}

export async function makeGitHubFixture() {
  const ipk = await makeIPK();
  const readmeCommit = 'a'.repeat(40), sourceCommit = 'b'.repeat(40), blobCommit = 'c'.repeat(40);
  const repository = { id: 1001, full_name: 'fixture/harmless', private: false, default_branch: 'main', description: '无害测试插件', license: { spdx_id: 'MIT' } };
  const asset = { id: 2001, name: 'harmless_all.ipk', size: ipk.length, browser_download_url: 'https://github.com/fixture/harmless/releases/download/v1.0.0/harmless_all.ipk', digest: `sha256:${await sha256(ipk)}`, updated_at: '2026-09-10T01:00:00Z', state: 'uploaded' };
  const release = { id: 3001, tag_name: 'v1.0.0', draft: false, prerelease: false, assets: [asset] };
  const readme = '# GitHub 仓库真实 README\n\n![图片](images/icon.png)\n\n这是作者上传的原文。';
  const source = '#!/bin/sh\nprintf "hello\\n"\n';
  const b64 = (s: string) => btoa(String.fromCharCode(...encoder.encode(s)));
  const prefix = '/repos/fixture/harmless';
  const paths = new Map<string, unknown>([
    ['/repositories/1001', repository], [prefix, repository], [`${prefix}/releases/latest`, release], [`${prefix}/releases/3001`, release],
    [`${prefix}/git/ref/tags/v1.0.0`, { object: { type: 'commit', sha: sourceCommit } }], [`${prefix}/commits/main`, { sha: readmeCommit }],
    [`${prefix}/readme?ref=${readmeCommit}`, { encoding: 'base64', content: b64(readme), size: encoder.encode(readme).length, path: 'README.md' }],
    [`${prefix}/git/trees/${sourceCommit}?recursive=1`, { truncated: false, tree: [{ path: 'src/harmless.sh', type: 'blob', mode: '100755', sha: blobCommit, size: encoder.encode(source).length }] }],
    [`${prefix}/git/blobs/${blobCommit}`, { encoding: 'base64', content: b64(source), size: encoder.encode(source).length }],
    [`${prefix}/releases/3001/assets?per_page=100&page=1`, [asset]],
  ]);
  const calls: { url: string; headers: Headers; method: string }[] = [];
  const fetcher: FetchLike = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input.toString() : input.url);
    calls.push({ url: url.toString(), headers: new Headers(init.headers), method: init.method ?? 'GET' });
    if (url.hostname === 'cloudflare-dns.com') return Response.json({ Status: 0, Answer: url.searchParams.get('type') === 'A' ? [{ type: 1, data: '104.16.132.229' }] : [] });
    if (url.hostname === 'api.github.com' && url.pathname === `${prefix}/releases/assets/2001`) return new Response(ipk as BodyInit, { headers: { 'content-type': 'application/octet-stream', 'content-length': String(ipk.length) } });
    const data = paths.get(url.pathname + url.search);
    if (data instanceof Response) return data.clone();
    if (data !== undefined && url.hostname === 'api.github.com') return Response.json(data, { headers: { etag: `"${await sha256(JSON.stringify(data))}"` } });
    return new Response('fixture: not found', { status: 404 });
  };
  return { ipk, readme, sourceCommit, readmeCommit, blobCommit, repository, asset, release, paths, calls, fetcher };
}
