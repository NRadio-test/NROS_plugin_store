import { AppError, type Env } from './contracts';
import type { ScanFile } from './ipk';
import { readBounded } from './network';

export const SCAN_POLICY = 'cloudmersive-tar-v1:';
const ENDPOINT = 'https://api.cloudmersive.com/virus/scan/file/advanced';

/** 重封装全部普通文件，不执行内容。编号避免路径编码/截断导致漏扫；链接已由 IPK 解析器检查。 */
export function scanArchive(files: ScanFile[], limit: number): Blob {
  const size = files.reduce((sum, file) => sum + 512 + Math.ceil(file.bytes.length / 512) * 512, 1024);
  if (!files.length || size > limit) throw new AppError(422, '包内文件整理后的查毒请求超过扫描额度，请联系管理员调整查毒套餐或限制', 'incomplete');
  const parts: (ArrayBuffer | Uint8Array<ArrayBuffer>)[] = [];
  const encoder = new TextEncoder();
  files.forEach((file, index) => {
    const header = new Uint8Array(512);
    const put = (offset: number, text: string) => header.set(encoder.encode(text), offset);
    const octal = (value: number, width: number) => value.toString(8).padStart(width - 1, '0') + '\0';
    const extension = file.path.match(/\.[a-z0-9]{1,12}$/iu)?.[0] ?? '.bin';
    put(0, `file-${index}${extension}`);
    put(100, octal(0o644, 8)); put(108, octal(0, 8)); put(116, octal(0, 8));
    put(124, octal(file.bytes.length, 12)); put(136, octal(0, 12));
    put(148, '        '); put(156, '0'); put(257, 'ustar\0'); put(263, '00');
    put(148, header.reduce((sum, byte) => sum + byte, 0).toString(8).padStart(6, '0') + '\0 ');
    parts.push(header, file.bytes as Uint8Array<ArrayBuffer>, new Uint8Array((512 - file.bytes.length % 512) % 512));
  });
  parts.push(new Uint8Array(1024));
  return new Blob(parts, { type: 'application/x-tar' });
}

export async function scanUploadFiles(env: Env, files: ScanFile[]): Promise<string> {
  const key = env.CLOUDMERSIVE_API_KEY?.trim();
  if (!key) throw new AppError(503, '等待配置 Cloudmersive 查毒服务', 'antivirus_unconfigured');
  const limit = Number(env.CLOUDMERSIVE_MAX_SCAN_BYTES ?? 3500000);
  if (!Number.isSafeInteger(limit) || limit < 1024 || limit > 64 * 1024 * 1024) throw new AppError(503, 'Cloudmersive 扫描大小配置无效', 'antivirus_unconfigured');
  const body = new FormData();
  body.set('inputFile', scanArchive(files, limit), 'ipk-contents.tar');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);
  try {
    const response = await fetch(ENDPOINT, {
      // Workers 只接受 'follow' 与 'manual'：'error' 会在运行时直接抛错。
      // 用 manual，重定向交给下面的 !response.ok 分支按临时错误处理。
      method: 'POST', redirect: 'manual', signal: controller.signal,
      headers: { Apikey: key, Accept: 'application/json', allowExecutables: 'true', allowScripts: 'true', allowHtml: 'true', allowInvalidFiles: 'false', allowPasswordProtectedFiles: 'false', allowUnsafeArchives: 'false' },
      body,
    });
    if (!response.ok) {
      await response.body?.cancel();
      if ([401, 403].includes(response.status)) throw new AppError(503, 'Cloudmersive 密钥或服务权限无效，请管理员检查配置', 'antivirus_unconfigured');
      if ([400, 413, 415, 422].includes(response.status)) throw new AppError(422, '查毒服务无法扫描该文件或请求超过套餐限制', 'incomplete');
      throw new AppError(503, 'Cloudmersive 暂不可用或调用额度已用完', 'antivirus_transient');
    }
    const bytes = await readBounded(response, 128 * 1024);
    const result = JSON.parse(new TextDecoder().decode(bytes));
    if (!result || typeof result.CleanResult !== 'boolean' || !(result.FoundViruses === null || Array.isArray(result.FoundViruses))) throw new Error('Invalid scan response');
    // 供应商返回内容不写入日志、公开原因或 AI 提示，避免泄露和注入。
    if (result.FoundViruses?.length) throw new AppError(422, '安装包查毒检出已知恶意代码，未通过审核', 'malware_detected');
    if (!result.CleanResult || result.ContainsInvalidFile || result.ContainsPasswordProtectedFile || result.ContainsUnsafeArchive) throw new AppError(422, '查毒服务未确认扫描通过，可能包含无法检查的内容', 'incomplete');
    return `Cloudmersive：已扫描包内全部 ${files.length} 个普通文件，未检出已知恶意代码；不代表绝对安全，未执行动态沙箱。`;
  } catch (error) {
    if (error instanceof AppError && ['antivirus_unconfigured', 'antivirus_transient', 'incomplete', 'malware_detected'].includes(error.code)) throw error;
    throw new AppError(503, 'Cloudmersive 请求超时、连接失败或返回结果无效', 'antivirus_transient');
  } finally { clearTimeout(timer); }
}
