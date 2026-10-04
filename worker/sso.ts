import { AppError, type Env } from './contracts';

export const ssoEnabled = (env: Env) => env.SSO_ENABLED === 'true';
const tokenValid = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
const encode = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
const random = () => encode(crypto.getRandomValues(new Uint8Array(32)));
const challenge = async (value: string) => encode(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))));
export interface SSOUser { id: string; display_name: string }
export function safeNext(value: unknown): string {
 return typeof value === 'string' && value.length <= 2000 && value.startsWith('/') && !value.startsWith('//') && !value.startsWith('/api/') && ![...value].some(c => c === '\\' || c.charCodeAt(0) <= 32 || c.charCodeAt(0) === 127) && !/%(?:2f|5c|0[ad])/i.test(value) ? value : '/me';
}
function issuer(env: Env) {
 try {
  const url = new URL(env.SSO_ORIGIN || '');
  const local = env.SSO_ALLOW_LOCAL === 'true' && env.APP_ENV !== 'production' && ['localhost', '127.0.0.1'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !local) || url.origin !== env.SSO_ORIGIN) throw Error('origin');
  return url.origin;
 } catch { throw new AppError(503, '统一登录入口尚未配置', 'configuration'); }
}
export async function authCall(env: Env, operation: string, body: unknown, allowExpired = false) {
 if (!env.SSO_CLIENT_SECRET || env.SSO_CLIENT_SECRET.length < 32) throw new AppError(503, '统一登录服务端凭据尚未配置', 'configuration');
 try {
  const request = new Request(issuer(env) + '/api/auth/internal/' + operation, { method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(8000), headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + env.SSO_CLIENT_SECRET }, body: JSON.stringify(body) });
  const response = env.AUTH_SERVICE ? await env.AUTH_SERVICE.fetch(request) : await fetch(request);
  if (allowExpired && response.status === 401) return null;
  if (!response.ok) throw new AppError(response.status >= 500 ? 503 : 400, response.status >= 500 ? '统一登录暂不可用，请稍后重试' : '统一登录已过期或请求无效', 'sso');
  const reader = response.body?.getReader(); let size = 0; const chunks: Uint8Array[] = [];
  if (reader) try { while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > 8192) { await reader.cancel(); throw Error('body'); } chunks.push(value); } } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0; for (const value of chunks) { bytes.set(value, offset); offset += value.length; }
  return JSON.parse(new TextDecoder().decode(bytes));
 } catch (error) { if (error instanceof AppError) throw error; throw new AppError(503, '统一登录暂不可用，请稍后重试', 'sso'); }
}
export function ssoCookie(env: Env, kind: 'user' | 'sso_attempt', value: string, age: number) {
 return (env.APP_ENV === 'production' ? '__Host-' : '') + 'plugin_store_' + kind + '=' + value + '; Path=/; HttpOnly; SameSite=Lax; Max-Age=' + age + (env.APP_ENV === 'production' ? '; Secure' : '');
}
function cookie(request: Request, env: Env, kind: 'user' | 'sso_attempt') {
 const name = (env.APP_ENV === 'production' ? '__Host-' : '') + 'plugin_store_' + kind + '=';
 const matches = (request.headers.get('Cookie') || '').split(';').map(v => v.trim()).filter(v => v.startsWith(name));
 return matches.length === 1 ? matches[0]!.slice(name.length) : '';
}
function user(value: any): SSOUser {
 if (!value || typeof value.id !== 'string' || !/^[a-f0-9-]{36}$/.test(value.id) || typeof value.display_name !== 'string' || value.display_name.length > 80) throw new AppError(503, '统一身份响应无效');
 return { id: value.id, display_name: value.display_name };
}
export async function ensureBusinessUser(env: Env, identity: SSOUser) {
 // Only an FK reference, with the central ID. No site account or credential is created.
 await env.DB.prepare("INSERT OR IGNORE INTO users(id,phone_index,phone_mask,created_at,identity_kind) VALUES(?,?,'',?,'sso')").bind(identity.id, 'sso:' + identity.id, Date.now()).run();
 const row = await env.DB.prepare('SELECT identity_kind FROM users WHERE id=?').bind(identity.id).first<{ identity_kind: string }>();
 if (row?.identity_kind !== 'sso') throw new AppError(409, '历史账号 ID 冲突，需要管理员核实');
}
export async function checkSSOSession(request: Request, env: Env) {
 const token = cookie(request, env, 'user'); if (!tokenValid(token)) return null;
 const result = await authCall(env, 'check', { token }, true); if (!result) return null;
 const identity = user(result.user);
 if (!Number.isFinite(result.expiresAt) || result.expiresAt <= Date.now()) return null;
 return { subjectId: identity.id, expiresAt: result.expiresAt, user: identity };
}
export async function startSSO(env: Env, next: unknown, interactive = true) {
 const state = random(), verifier = random();
 const result = await authCall(env, 'start', { state, challenge: await challenge(verifier), next: safeNext(next), interactive });
 const url = new URL(result.authorizationUrl);
 if (url.origin !== issuer(env) || url.pathname !== '/api/auth/authorize') throw new AppError(503, '统一登录地址无效');
 return { authorizationUrl: url.href, cookie: ssoCookie(env, 'sso_attempt', encode(new TextEncoder().encode(JSON.stringify({ state, verifier, next: safeNext(next), expires: Date.now() + 600000 }))), 600) };
}
export async function finishSSO(request: Request, env: Env) {
 if (!ssoEnabled(env)) throw new AppError(409, '统一登录尚未启用');
 const url = new URL(request.url); if (url.origin !== new URL(env.APP_ORIGIN).origin) throw new AppError(403, '登录返回域名无效');
 let attempt: any;
 try { const value = cookie(request, env, 'sso_attempt'); if (value.length > 1024 || !/^[A-Za-z0-9_-]+$/.test(value)) throw Error('cookie'); attempt = JSON.parse(atob(value.replace(/-/g, '+').replace(/_/g, '/'))); } catch { throw new AppError(400, '登录请求不属于当前浏览器'); }
 if (!tokenValid(attempt.state) || !tokenValid(attempt.verifier) || !Number.isFinite(attempt.expires) || attempt.expires <= Date.now() || url.searchParams.getAll('state').length !== 1 || url.searchParams.get('state') !== attempt.state) throw new AppError(400, '登录请求已过期或无效');
 if (url.searchParams.get('error') === 'login_required') return { next: safeNext(attempt.next), cookie: null };
 if (url.searchParams.getAll('code').length !== 1) throw new AppError(400, '登录票据无效');
 const result = await authCall(env, 'exchange', { code: url.searchParams.get('code'), state: attempt.state, verifier: attempt.verifier });
 if (!tokenValid(result.token) || !Number.isFinite(result.expiresAt) || result.expiresAt <= Date.now()) throw new AppError(400, '登录已过期');
 await ensureBusinessUser(env, user(result.user));
 return { next: safeNext(result.next), cookie: ssoCookie(env, 'user', result.token, Math.max(1, Math.floor((result.expiresAt - Date.now()) / 1000))) };
}
export async function logoutSSO(request: Request, env: Env) {
 const token = cookie(request, env, 'user'); if (tokenValid(token)) await authCall(env, 'logout', { token }, true);
 return ssoCookie(env, 'user', '', 0);
}
export async function bindLegacyAccount(env: Env, adminId: string, input: any) {
 if (!ssoEnabled(env)) throw new AppError(409, '请先启用统一账号');
 if (typeof input.legacyUserId !== 'string' || typeof input.globalUserId !== 'string' || !/^[a-f0-9-]{36}$/.test(input.globalUserId) || typeof input.evidence !== 'string' || input.evidence.trim().length < 10 || input.evidence.length > 1000 || input.confirmed !== true) throw new AppError(400, '需要明确确认及已核实的账号归属依据');
 const legacy = await env.DB.prepare("SELECT id FROM users WHERE id=? AND identity_kind='legacy'").bind(input.legacyUserId).first();
 if (!legacy) throw new AppError(404, '历史档案不存在');
 const result = await authCall(env, 'user', { userId: input.globalUserId }); await ensureBusinessUser(env, user(result.user));
 const existing = await env.DB.prepare('SELECT global_user_id FROM legacy_account_links WHERE legacy_user_id=?').bind(input.legacyUserId).first<{ global_user_id: string }>();
 if (existing) { if (existing.global_user_id !== input.globalUserId) throw new AppError(409, '历史档案已绑定其他身份'); return { ok: true, reused: true }; }
 await env.DB.batch([
  env.DB.prepare('INSERT INTO legacy_account_links(legacy_user_id,global_user_id,evidence,admin_id,confirmed_at) VALUES(?,?,?,?,?)').bind(input.legacyUserId, input.globalUserId, input.evidence.trim(), adminId, Date.now()),
  env.DB.prepare('INSERT OR IGNORE INTO favorites(user_id,plugin_id,created_at) SELECT ?,plugin_id,created_at FROM favorites WHERE user_id=?').bind(input.globalUserId, input.legacyUserId),
  env.DB.prepare('DELETE FROM favorites WHERE user_id=?').bind(input.legacyUserId),
  env.DB.prepare('UPDATE plugins SET submitter_id=? WHERE submitter_id=?').bind(input.globalUserId, input.legacyUserId),
  env.DB.prepare('INSERT INTO audit(id,admin_id,action,target,created_at) VALUES(?,?,?,?,?)').bind(crypto.randomUUID(), adminId, 'legacy_account_link', input.legacyUserId, Date.now()),
 ]);
 return { ok: true };
}
