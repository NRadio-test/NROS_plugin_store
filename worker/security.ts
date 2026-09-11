import { AppError, type Env } from './contracts';

const utf8 = (value: string) => new TextEncoder().encode(value);
const base64url = (value: Uint8Array) => btoa(String.fromCharCode(...value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
function unbase64(value: string): Uint8Array<ArrayBuffer> {
 if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Invalid encoding');
 return Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
}
export async function hash(value: string): Promise<string> {
 return [...new Uint8Array(await crypto.subtle.digest('SHA-256', utf8(value)))].map(b => b.toString(16).padStart(2, '0')).join('');
}
function requireKey(key: string) { if (!key || key.length < 32) throw new AppError(503, '服务端密钥尚未正确配置', 'configuration'); }
export async function hmac(key: string, value: string): Promise<string> {
 requireKey(key);
 const material = await crypto.subtle.importKey('raw', utf8(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
 return base64url(new Uint8Array(await crypto.subtle.sign('HMAC', material, utf8(value))));
}
async function encryptionKey(master: string) {
 requireKey(master);
 return crypto.subtle.importKey('raw', await crypto.subtle.digest('SHA-256', utf8(master)), 'AES-GCM', false, ['encrypt', 'decrypt']);
}
export async function encrypt(master: string, value: string): Promise<string> {
 const iv = crypto.getRandomValues(new Uint8Array(12));
 const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: utf8('plugin-store:v1') }, await encryptionKey(master), utf8(value));
 return `v1.${base64url(iv)}.${base64url(new Uint8Array(encrypted))}`;
}
export async function decrypt(master: string, value: string): Promise<string> {
 const [version, iv, payload, extra] = value.split('.');
 if (version !== 'v1' || !iv || !payload || extra) throw new AppError(503, '加密设置无法读取');
 try { return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unbase64(iv), additionalData: utf8('plugin-store:v1') }, await encryptionKey(master), unbase64(payload))); }
 catch { throw new AppError(503, '加密设置无法读取'); }
}
/** 内地 11 位号码自动补 +86；其他地区必须明确输入国际区号。 */
export function normalizePhone(phone: string): string {
 if (typeof phone !== 'string' || phone.length > 40) throw new AppError(400, '请输入有效手机号');
 let normalized = phone.trim().replace(/[ ()-]/g, '');
 if (/^1[3-9]\d{9}$/.test(normalized)) normalized = '+86' + normalized;
 if (normalized.startsWith('00')) normalized = '+' + normalized.slice(2);
 if (!/^\+[1-9]\d{7,14}$/.test(normalized)) throw new AppError(400, '请输入内地 11 位手机号，其他地区请加国际区号');
 if (normalized.startsWith('+86') && !/^\+861[3-9]\d{9}$/.test(normalized)) throw new AppError(400, '内地手机号格式不正确');
 return normalized;
}
/** 生成与旧站导入一致的 pbkdf2-sha256 验证记录；只返回可持久化的散列，不返回明文。 */
export async function hashPassword(password: string, iterations = 600_000): Promise<string> {
 if (typeof password !== 'string' || !password || password.length > 1024) throw new AppError(400, '密码格式错误');
 const salt = crypto.getRandomValues(new Uint8Array(16));
 const material = await crypto.subtle.importKey('raw', utf8(password), 'PBKDF2', false, ['deriveBits']);
 const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, material, 256));
 return `pbkdf2-sha256$${iterations}$${base64url(salt)}$${base64url(bits)}`;
}
export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
 try {
  if (typeof password !== 'string' || password.length > 1024 || LEGACY_DEFAULT_FINGERPRINTS.has(await hash(encoded))) return false;
  const [name, iterationText, saltText, expectedText, extra] = encoded.split('$');
  const iterations = Number(iterationText);
  if (name !== 'pbkdf2-sha256' || extra !== undefined || !Number.isInteger(iterations) || iterations < 100_000 || iterations > 2_000_000 || !saltText || !expectedText) return false;
  const salt = unbase64(saltText), expected = unbase64(expectedText);
  if (salt.byteLength < 16 || salt.byteLength > 128 || expected.byteLength !== 32) return false;
  const material = await crypto.subtle.importKey('raw', utf8(password), 'PBKDF2', false, ['deriveBits']);
  const actual = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, material, 256));
  let difference = 0;
  for (let i = 0; i < actual.length; i++) difference |= actual[i]! ^ expected[i]!;
  return difference === 0;
 } catch { return false; }
}
export type SessionKind = 'user' | 'admin';
export interface Session { subjectId: string; expiresAt: number }
function cookieName(env: Env, kind: SessionKind) { return `${env.APP_ENV === 'production' ? '__Host-' : ''}plugin_store_${kind}`; }
function sessionCookie(env: Env, kind: SessionKind, token: string, seconds: number) {
 return `${cookieName(env, kind)}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${seconds}${env.APP_ENV === 'production' ? '; Secure' : ''}`;
}
function cookieToken(request: Request, env: Env, kind: SessionKind) {
 const matches = (request.headers.get('Cookie') || '').split(';').map(x => x.trim().split('=')).filter(([name]) => name === cookieName(env, kind));
 const token = matches.length === 1 ? matches[0]?.[1] : undefined;
 return token && /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
}
export async function createSession(env: Env, kind: SessionKind, id: string) {
 const token = base64url(crypto.getRandomValues(new Uint8Array(32)));
 const seconds = kind === 'admin' ? 12 * 3600 : 30 * 86400;
 const now = Date.now(), expiresAt = now + seconds * 1000;
 await env.DB.prepare('INSERT INTO sessions(token_hash,kind,subject_id,expires_at) VALUES(?,?,?,?)').bind(await hash(token), kind, id, expiresAt).run();
 return { token, cookie: sessionCookie(env, kind, token, seconds), expiresAt };
}
export async function getSession(request: Request, env: Env, kind: SessionKind): Promise<Session | null> {
 const token = cookieToken(request, env, kind);
 if (!token) return null;
 const row = await env.DB.prepare('SELECT subject_id,expires_at FROM sessions WHERE token_hash=? AND kind=? AND expires_at>?').bind(await hash(token), kind, Date.now()).first<{ subject_id: string; expires_at: number }>();
 return row ? { subjectId: row.subject_id, expiresAt: row.expires_at } : null;
}
export async function logoutSession(request: Request, env: Env, kind: SessionKind): Promise<string> {
 const token = cookieToken(request, env, kind);
 if (token) await env.DB.prepare('DELETE FROM sessions WHERE token_hash=? AND kind=?').bind(await hash(token), kind).run();
 return sessionCookie(env, kind, '', 0);
}
export function assertOrigin(request: Request, env: Env): void {
 const origin = request.headers.get('Origin');
 let configured: string;
 try { configured = new URL(env.APP_ORIGIN).origin; } catch { throw new AppError(503, '站点来源尚未配置'); }
 if (!origin || origin !== configured || request.headers.get('Sec-Fetch-Site') === 'cross-site') throw new AppError(403, '请求来源不允许', 'origin');
}
/** 固定时间窗原子限流；调用方使用 HMAC 标识，不存原始手机号/IP。 */
export async function rateLimit(env: Env, key: string, limit: number, windowSeconds: number): Promise<void> {
 const now = Date.now(), expires = now + windowSeconds * 1000;
 const result = await env.DB.prepare('INSERT INTO limits(key,count,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN expires_at<=? THEN 1 ELSE count+1 END,expires_at=CASE WHEN expires_at<=? THEN excluded.expires_at ELSE expires_at END RETURNING count').bind(key, expires, now, now).first<{ count: number }>();
 if (!result || result.count > limit) throw new AppError(429, '操作过于频繁，请稍后再试', 'rate_limited');
}

/** 仅保存历史公开默认验证值的单向指纹，不能用作登录凭据。 */
export const LEGACY_DEFAULT_FINGERPRINTS = new Set([
 '2547d75a715e92ca38fb9d0cdf2fb9a8b3ede8f37b514909d82fcd34dfdc8a4a',
 'c70e8c9cac000915426c6abc7637202a0805aea22637e69c4cff295bcc9ffa35',
 '9b0d22c5e7f3e09d8df4e99079c7707df8f1e39cd408c6bd4d8e5733cd846cd3',
 '871b641bc79b248fe91d4303eede84a82c960a5bf23486a494f672e27514e9bc',
 'e2b1a3ffe3f3e2a95ebf60a665abb36d347ca66fcc585c03bed39a018bdbd01e',
 '060ecdcbea9b724898f266dd73771832e562d0ec1b38780b4d19f8f9f31351dc',
 '6c483503cb612edd25f43cfd9ea4a2e1b2e6b4bd0299e4d618d96271c19a30af',
 'bc143f16ab1b1fac50e11f000060ce699f5a70ce27976e0276d5cddf99ef9741',
]);
