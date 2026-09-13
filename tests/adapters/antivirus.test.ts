import { describe, expect, it, vi } from 'vitest';
import { scanArchive, scanUploadFiles } from '../../worker/antivirus';
import { parseIPK } from '../../worker/ipk';
import type { Env } from '../../worker/contracts';
import { makeIPK } from './fixtures';

const env = { CLOUDMERSIVE_API_KEY: 'isolated-test-key' } as Env;
const files = [{ path: 'data/program', bytes: new Uint8Array([127, 69, 76, 70, 0, 1]) }];
describe('Cloudmersive 官方协议与失败关闭', () => {
  it('提取所有普通文件，TAR 每个字节完整保留且头部校验和有效', async () => {
    const parsed = await parseIPK(await makeIPK({ dataFiles: [{ name: 'usr/bin/program', bytes: files[0]!.bytes }] }), {}, true);
    expect(parsed.scanFiles!.length).toBe(parsed.files.filter(f => f.kind === 'file').length);
    const tar = new Uint8Array(await scanArchive(parsed.scanFiles!, 3500000).arrayBuffer());
    let offset = 0;
    for (const file of parsed.scanFiles!) {
      const header = tar.subarray(offset, offset + 512);
      const expected = parseInt(new TextDecoder().decode(header.subarray(148, 154)), 8);
      expect(header.reduce((sum, byte, index) => sum + (index >= 148 && index < 156 ? 32 : byte), 0)).toBe(expected);
      expect(tar.subarray(offset + 512, offset + 512 + file.bytes.length)).toEqual(file.bytes);
      offset += 512 + Math.ceil(file.bytes.length / 512) * 512;
    }
    expect(tar.subarray(offset)).toEqual(new Uint8Array(1024));
  });
  it('使用服务端 Apikey 和 multipart inputFile，允许合法程序和脚本，禁止重定向', async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json({ CleanResult: true, FoundViruses: [] }));
    expect(await scanUploadFiles(env, files)).toContain('未检出已知恶意代码');
    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(url).toBe('https://api.cloudmersive.com/virus/scan/file/advanced');
    // Workers 只接受 follow / manual：写成 'error' 会在运行时直接抛错，这里固定回归断言。
    expect(init).toMatchObject({ method: 'POST', redirect: 'manual', headers: { Apikey: env.CLOUDMERSIVE_API_KEY, allowExecutables: 'true', allowScripts: 'true', allowPasswordProtectedFiles: 'false' } });
    expect((init!.body as FormData).get('inputFile')).toBeInstanceOf(File);
  });
  it.each([
    [401, 'antivirus_unconfigured'], [403, 'antivirus_unconfigured'], [413, 'incomplete'], [429, 'antivirus_transient'], [500, 'antivirus_transient'], [302, 'antivirus_transient'],
  ])('HTTP %s 不放行', async (status, code) => {
    vi.mocked(fetch).mockResolvedValue(new Response('private-provider-detail', { status: status as number }));
    await expect(scanUploadFiles(env, files)).rejects.toMatchObject({ code });
  });
  it.each([
    [{ CleanResult: true, FoundViruses: [{ VirusName: 'sentinel' }] }, 'malware_detected'],
    [{ CleanResult: false, FoundViruses: [] }, 'incomplete'],
    [{ CleanResult: true, FoundViruses: [], ContainsInvalidFile: true }, 'incomplete'],
    [{ CleanResult: true, FoundViruses: [], ContainsUnsafeArchive: true }, 'incomplete'],
    [{ CleanResult: true, FoundViruses: [], ContainsPasswordProtectedFile: true }, 'incomplete'],
    [{ CleanResult: 'true' }, 'antivirus_transient'],
    [{}, 'antivirus_transient'],
  ])('不信任错误、含威胁或不完整响应 %#', async (result, code) => {
    vi.mocked(fetch).mockResolvedValue(Response.json(result));
    await expect(scanUploadFiles(env, files)).rejects.toMatchObject({ code });
  });
  it('未配置和超限在外发前阻止，网络错误不会透传敏感文本', async () => {
    await expect(scanUploadFiles({} as Env, files)).rejects.toMatchObject({ code: 'antivirus_unconfigured' });
    await expect(scanUploadFiles({ ...env, CLOUDMERSIVE_MAX_SCAN_BYTES: '1024' }, files)).rejects.toMatchObject({ code: 'incomplete' });
    expect(fetch).not.toHaveBeenCalled();
    vi.mocked(fetch).mockRejectedValue(new Error('private-provider-detail'));
    await expect(scanUploadFiles(env, files)).rejects.not.toThrow('private-provider-detail');
  });
});
