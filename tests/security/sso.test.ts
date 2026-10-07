import { describe, expect, it, vi } from 'vitest';
import { createSession } from '../../worker/security';
import { checkSSOSession, ensureBusinessUser, safeNext } from '../../worker/sso';
import { origin, request, seedAdmin, seedPlugin, testEnv } from '../integration/harness';

const canonicalId = '11223344-5566-4778-8990-aabbccddeeff';
const childToken = 'S'.repeat(43);
const identity = { id: canonicalId, display_name: '有赞用户' };
function fixture(profile: typeof identity & { avatar_url?: string; profile_updated_at?: number } = identity) {
 const e = { ...testEnv(), SSO_ENABLED: 'true', SSO_ORIGIN: 'https://auth.example.test', SSO_CLIENT_SECRET: 'isolated-site-backchannel-credential-32-characters' };
 let active = true, attempt: any, consumed = false;
 const operations: string[] = [];
 e.AUTH_SERVICE = { async fetch(input: Request) {
  const url = new URL(input.url), op = url.pathname.split('/').at(-1)!;
  const body = await input.json() as any; operations.push(op);
  expect(input.method).toBe('POST'); expect(input.redirect).toBe('manual');
  expect(input.headers.get('Authorization')).toBe('Bearer ' + e.SSO_CLIENT_SECRET);
  expect(input.headers.get('Cookie')).toBeNull();
  expect(input.headers.get('Content-Type')).toBe('application/json');
  if (op === 'start') { attempt = body; consumed = false; return Response.json({ authorizationUrl: e.SSO_ORIGIN + '/api/auth/authorize?request=' + 'R'.repeat(43) }); }
  if (op === 'exchange') {
   const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body.verifier)));
   const challenge = btoa(String.fromCharCode(...hash)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
   if (!active || consumed || body.state !== attempt.state || challenge !== attempt.challenge || body.code !== 'C'.repeat(43)) return Response.json({ code: 'invalid_ticket' }, { status: 400 });
   consumed = true; return Response.json({ token: childToken, user: profile, expiresAt: Date.now() + 60000, next: attempt.next });
  }
  if (!['check', 'profile', 'logout'].includes(op)) return Response.json({ code: 'not_found' }, { status: 404 });
  if (body.token !== childToken || !active) return Response.json({ code: 'session_expired', user: null }, { status: 401 });
  if (op === 'logout') { active = false; return Response.json({ ok: true }); }
  return Response.json({ user: profile, sessionId: 'central-root-session', expiresAt: Date.now() + 60000 });
 } } as Fetcher;
 return { e, operations, revoke: () => { active = false; }, get attempt() { return attempt; } };
}
function cookies(response: Response) { return response.headers.getSetCookie().map(v => v.split(';')[0]).filter(v => !v.endsWith('=')).join('; '); }
async function login(f: ReturnType<typeof fixture>) {
 const start = await request(f.e, '/api/login', 'POST', { next: '/me', phone: '13800138000' });
 expect(start.status, JSON.stringify(await start.clone().json()) + ' operations=' + f.operations.join(',')).toBe(200);
 const callback = '/api/auth/callback?state=' + f.attempt.state + '&code=' + 'C'.repeat(43);
 const response = await request(f.e, callback, 'GET', undefined, cookies(start));
 expect(response.status).toBe(303); expect(response.headers.get('Location')).toBe(origin + '/me');
 return { cookie: cookies(response), callback, attemptCookie: cookies(start) };
}

describe('统一用户和站点会话', () => {
 it.each([[401, 'invalid_client'], [503, 'configuration_error'], [503, 'auth_unavailable'], [404, 'not_found'], [401, undefined]] as const)('中央 %s %s 不伪装成退出或过期，不清除本站 Cookie', async (status, code) => {
  const f = fixture(), { cookie } = await login(f), service = f.e.AUTH_SERVICE;
  f.e.AUTH_SERVICE = { async fetch() { return Response.json({ code, error: 'private upstream detail' }, { status }); } } as Fetcher;
  for (const [path, method] of [['/api/session', 'GET'], ['/api/me', 'GET'], ['/api/logout', 'POST']]) {
   const response = await request(f.e, path!, method!, method === 'POST' ? {} : undefined, cookie);
   expect(response.status).toBe(503); expect(response.headers.get('Set-Cookie')).toBeNull();
   expect(await response.text()).not.toMatch(/private upstream detail|已过期/);
  }
  f.e.AUTH_SERVICE = service;
  expect((await (await request(f.e, '/api/session', 'GET', undefined, cookie)).json() as any).user.id).toBe(canonicalId);
 });
 it('只有确认 session_expired 才清 Cookie；公共页面保持匿名可用，受保护操作拒绝', async () => {
  const f = fixture(), { cookie } = await login(f); f.revoke();
  for (const [path, method, status] of [['/api/session', 'GET', 200], ['/api/me', 'GET', 401], ['/api/logout', 'POST', 200]] as const) {
   const response = await request(f.e, path, method, method === 'POST' ? {} : undefined, cookie);
   expect(response.status).toBe(status);
   expect(response.headers.get('Set-Cookie')).toContain('plugin_store_user=;');
   expect(response.headers.get('Set-Cookie')).toContain('Max-Age=0');
  }
 });
 it('同步资料暂不可用保留登录，中央在资料请求时撤销会话则清 Cookie', async () => {
  const f = fixture(), { cookie } = await login(f), service = f.e.AUTH_SERVICE!;
  let expired = false;
  f.e.AUTH_SERVICE = { async fetch(input: Request) {
   return new URL(input.url).pathname.endsWith('/profile') ? Response.json({ code: expired ? 'session_expired' : 'profile_unavailable' }, { status: expired ? 401 : 503 }) : service.fetch(input);
  } } as Fetcher;
  const unavailable = await request(f.e, '/api/account/profile/sync', 'POST', {}, cookie);
  expect(unavailable.status).toBe(503); expect(unavailable.headers.get('Set-Cookie')).toBeNull();
  expect((await (await request(f.e, '/api/session', 'GET', undefined, cookie)).json() as any).user.id).toBe(canonicalId);
  expired = true;
  const revoked = await request(f.e, '/api/account/profile/sync', 'POST', {}, cookie);
  expect(revoked.status).toBe(401); expect(revoked.headers.get('Set-Cookie')).toContain('Max-Age=0');
 });
 it('HTTPS 后备与 Service Binding 使用相同凭据和完整接口 URL，浏览器只拿授权地址及公开资料', async () => {
  const f = fixture(), service = f.e.AUTH_SERVICE!;
  f.e.AUTH_SERVICE = undefined;
  vi.mocked(fetch).mockImplementation(async input => {
   expect(input).toBeInstanceOf(Request); expect((input as Request).url).toMatch(/^https:\/\/auth\.example\.test\/api\/auth\/internal\//);
   return service.fetch(input as Request);
  });
  const flow = await login(f);
  const response = await request(f.e, '/api/session', 'GET', undefined, flow.cookie);
  expect((await response.json() as any).user.id).toBe(canonicalId);
  expect(f.attempt).toMatchObject({ interactive: true });
  expect(f.attempt.state).toMatch(/^[A-Za-z0-9_-]{43}$/); expect(f.attempt.challenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(f.attempt).not.toHaveProperty('verifier'); expect(f.attempt).not.toHaveProperty('siteId');
 });
 it('新版协议禁止错误授权地址、重定向响应和虚假退出成功', async () => {
  const f = fixture(), { cookie } = await login(f);
  for (const authorizationUrl of ['not-a-url', 'https://other.example.test/api/auth/authorize?request=' + 'R'.repeat(43), f.e.SSO_ORIGIN + '/api/auth/authorize?request=short']) {
   f.e.AUTH_SERVICE = { async fetch() { return Response.json({ authorizationUrl }); } } as Fetcher;
   expect((await request(f.e, '/api/login', 'POST', {})).status).toBe(503);
  }
  for (const response of [Response.redirect('https://other.example.test', 302), Response.json({ ok: false }), Response.json({ ok: true, padding: 'x'.repeat(8200) })]) {
   f.e.AUTH_SERVICE = { async fetch() { return response; } } as Fetcher;
   const result = await request(f.e, '/api/logout', 'POST', {}, cookie);
   expect(result.status).toBe(503); expect(result.headers.get('Set-Cookie')).toBeNull();
  }
 });
 it('短期绑定支持中文返回路径，拒绝重复错误、错误与票据混用及格式错误的票据', async () => {
  const f = fixture();
  const start = await request(f.e, '/api/login', 'POST', { silent: true, next: '/me?tab=收藏' });
  const path = '/api/auth/callback?state=' + f.attempt.state;
  const silent = await request(f.e, path + '&error=login_required', 'GET', undefined, cookies(start));
  expect(new URL(silent.headers.get('Location')!).searchParams.get('tab')).toBe('收藏');
  for (const suffix of ['&error=login_required&error=login_required', '&error=login_required&code=' + 'C'.repeat(43), '&code=short']) {
   const result = await request(f.e, path + suffix, 'GET', undefined, cookies(start));
   expect(result.headers.get('Location')).toContain('login_error=1');
  }
  expect(f.operations).not.toContain('exchange');
 });
 it('Cookie 保持 host-only，毫秒截止时间转换为秒；不把站点 token 或密钥返回前端', async () => {
  const f = fixture(); f.e.APP_ENV = 'production';
  const start = await request(f.e, '/api/login', 'POST', {});
  expect(start.headers.get('Set-Cookie')).toContain('__Host-plugin_store_sso_attempt=');
  expect(start.headers.get('Set-Cookie')).toContain('Secure');
  const finish = await request(f.e, '/api/auth/callback?state=' + f.attempt.state + '&code=' + 'C'.repeat(43), 'GET', undefined, cookies(start));
  const issued = finish.headers.getSetCookie().find(v => v.startsWith('__Host-plugin_store_user='))!;
  expect(issued).toMatch(/HttpOnly; SameSite=Lax; Max-Age=(59|60); Secure/); expect(issued).not.toContain('Domain=');
  const response = await request(f.e, '/api/session', 'GET', undefined, cookies(finish));
  const json = await response.text(); expect(json).toContain(canonicalId); expect(json).not.toContain(childToken); expect(json).not.toContain(f.e.SSO_CLIENT_SECRET);
 });
 it('真实昵称、头像与同步资料沿用同一全局身份，不向商店业务库保存账号资料', async () => {
  const profile = { ...identity, display_name: 'Dawn', avatar_url: 'https://img.yzcdn.cn/account/avatar.jpg', profile_updated_at: Date.now() };
  const f = fixture(profile), { cookie } = await login(f);
  expect((await (await request(f.e, '/api/session', 'GET', undefined, cookie)).json() as any).user).toEqual(profile);
  profile.display_name = 'Dawn 更新';
  expect((await (await request(f.e, '/api/account/profile/sync', 'POST', {}, cookie)).json() as any).user.display_name).toBe('Dawn 更新');
  expect((await f.e.DB.prepare('SELECT COUNT(*) n FROM users').first<any>()).n).toBe(1);
  expect((await f.e.DB.prepare('SELECT id,phone_mask FROM users').first<any>())).toEqual({ id: canonicalId, phone_mask: '' });
  expect((await request(f.e, '/api/studio/overview', 'GET', undefined, cookie)).status).toBe(401);
  f.revoke();
  expect((await request(f.e, '/api/account/profile/sync', 'POST', {}, cookie)).status).toBe(401);
 });
 it.each(['javascript:alert(1)', 'https://127.0.0.1/avatar', 'https://img.yzcdn.cn.evil.test/avatar'])('无效头像 %s 不影响登录且不会传给前端', async avatar_url => {
  const f = fixture({ ...identity, avatar_url }), { cookie } = await login(f);
  expect((await (await request(f.e, '/api/session', 'GET', undefined, cookie)).json() as any).user).toEqual(identity);
 });
 it('仅显式本地测试配置允许预览头像，生产环境拒绝 loopback 图片', async () => {
  const avatar_url = 'http://127.0.0.1:8789/assets/preview-avatar.svg';
  const f = fixture({ ...identity, avatar_url }); f.e.SSO_ALLOW_LOCAL = 'true'; f.e.APP_ORIGIN = 'http://127.0.0.1:8789';
  const req = new Request(f.e.APP_ORIGIN, { headers: { Cookie: 'plugin_store_user=' + childToken } });
  expect((await checkSSOSession(req, f.e))!.user.avatar_url).toBe(avatar_url);
  f.e.APP_ENV = 'production';
  const prodReq = new Request('https://store.example.com', { headers: { Cookie: '__Host-plugin_store_user=' + childToken } });
  expect((await checkSSOSession(prodReq, f.e))!.user.avatar_url).toBeUndefined();
 });
 it('资料同步拒绝匿名、失效账号、站外调用和不同用户资料', async () => {
  const f = fixture(), { cookie } = await login(f);
  expect((await request(f.e, '/api/account/profile/sync', 'POST', {})).status).toBe(401);
  expect((await request(f.e, '/api/account/profile/sync', 'POST', {}, cookie, { Origin: 'https://other.example.test' })).status).toBe(403);
  const service = f.e.AUTH_SERVICE!;
  f.e.AUTH_SERVICE = { async fetch(input: Request) { if (new URL(input.url).pathname.endsWith('/profile')) return Response.json({ user: { ...identity, id: '99887766-5544-4321-9876-aabbccddeeff' } }); return service.fetch(input); } } as Fetcher;
  expect((await request(f.e, '/api/account/profile/sync', 'POST', {}, cookie)).status).toBe(503);
  f.revoke();expect((await request(f.e, '/api/account/profile/sync', 'POST', {}, cookie)).status).toBe(401);
 });
 it('关闭开关时兼容尚未应用统一账号迁移的业务库', async () => {
  const e = { ...testEnv(), SSO_ENABLED: 'false' };
  await e.DB.prepare('ALTER TABLE users DROP COLUMN identity_kind').run();
  await seedPlugin(e, { id: 'before-migration', fullName: 'fixture/before-migration' });
  expect((await request(e, '/api/plugins')).status).toBe(200);
  expect((await request(e, '/api/plugins/before-migration')).status).toBe(200);
  const login = await request(e, '/api/login', 'POST', { phone: '13800138000' }); expect(login.status).toBe(200);
  expect((await request(e, '/api/me', 'GET', undefined, cookies(login))).status).toBe(200);
 });
 it('用全局 ID 作为业务外键，忽略未验证手机号，不在商店签发普通用户会话', async () => {
  const f = fixture(), { cookie } = await login(f);
  const result = await (await request(f.e, '/api/session', 'GET', undefined, cookie)).json() as any;
  expect(result.user).toEqual(identity); expect(result.admin).toBeNull(); expect(result.ssoEnabled).toBe(true);
  expect(await f.e.DB.prepare('SELECT id,identity_kind,phone_mask FROM users').first()).toEqual({ id: canonicalId, identity_kind: 'sso', phone_mask: '' });
  expect((await f.e.DB.prepare("SELECT COUNT(*) n FROM sessions WHERE kind='user'").first<any>()).n).toBe(0);
  await expect(createSession(f.e, 'user', canonicalId)).rejects.toThrow('统一登录服务');
 });
 it('回调拒绝其他浏览器、重复参数、过期与重放，静默检查保留原页面', async () => {
  const f = fixture(), flow = await login(f);
  for (const [path, cookie] of [[flow.callback, undefined], [flow.callback + '&state=' + f.attempt.state, flow.attemptCookie], [flow.callback, flow.attemptCookie]]) {
   const r = await request(f.e, path!, 'GET', undefined, cookie);
   expect(r.headers.get('Location')).toBe(origin + '/login?login_error=1');
   expect(r.headers.getSetCookie().some(v => v.startsWith('plugin_store_user='))).toBe(false);
  }
  const start = await request(f.e, '/api/login', 'POST', { next: '/?sort=downloads', silent: true });
  expect(f.attempt.interactive).toBe(false);
  const silent = await request(f.e, '/api/auth/callback?state=' + f.attempt.state + '&error=login_required', 'GET', undefined, cookies(start));
  expect(silent.headers.get('Location')).toBe(origin + '/?sort=downloads');
  const attempt = JSON.parse(atob(cookies(start).split('=')[1]!.replace(/-/g, '+').replace(/_/g, '/'))); attempt.expires = 0;
  const expired = btoa(JSON.stringify(attempt)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  expect((await request(f.e, '/api/auth/callback?state=' + attempt.state + '&code=' + 'C'.repeat(43), 'GET', undefined, 'plugin_store_sso_attempt=' + expired)).headers.get('Location')).toContain('login_error=1');
 });
 it('统一退出和中心撤销立即拒绝收藏、投稿与个人资料，独立管理员权限不传播', async () => {
  const f = fixture(), { cookie } = await login(f); await seedPlugin(f.e, { id: 'favorite-plugin', fullName: 'fixture/plugin' });
  expect((await request(f.e, '/api/plugins/favorite-plugin/favorite', 'PUT', { active: true }, cookie)).status).toBe(200);
  expect((await request(f.e, '/api/studio/overview', 'GET', undefined, cookie)).status).toBe(401);
  const adminCookie = await seedAdmin(f.e);
  expect((await request(f.e, '/api/logout', 'POST', {}, cookie)).status).toBe(200);
  expect((await request(f.e, '/api/me', 'GET', undefined, cookie)).status).toBe(401);
  expect((await request(f.e, '/api/plugins/favorite-plugin/favorite', 'PUT', { active: false }, cookie)).status).toBe(401);
  expect((await request(f.e, '/api/submit', 'POST', { url: 'https://github.com/fixture/plugin' }, cookie)).status).toBe(401);
  expect((await request(f.e, '/api/studio/overview', 'GET', undefined, adminCookie)).status).toBe(200);
  expect((await f.e.DB.prepare('SELECT COUNT(*) n FROM favorites WHERE user_id=?').bind(canonicalId).first<any>()).n).toBe(1);
 });
 it('中心不可用时不使用旧手机号会话或缓存身份', async () => {
  const f = fixture();
  const old = { ...f.e, SSO_ENABLED: 'false' };
  const oldCookie = cookies(await request(old, '/api/login', 'POST', { phone: '13800138000' }));
  expect((await (await request(f.e, '/api/session', 'GET', undefined, oldCookie)).json() as any).user).toBeNull();
  const { cookie } = await login(f);
  f.e.AUTH_SERVICE = { async fetch() { throw Error('isolated outage'); } } as unknown as Fetcher;
  expect((await request(f.e, '/api/me', 'GET', undefined, cookie)).status).toBe(503);
 });
 it('历史归属需要管理员明确核实，事务迁移收藏与投稿并保留审计', async () => {
  const f = fixture(); await f.e.DB.prepare("INSERT INTO users(id,phone_index,phone_mask,created_at) VALUES('legacy','old-phone-index','old-mask',1)").run();
  await seedPlugin(f.e, { id: 'old-plugin', fullName: 'fixture/old-plugin' });
  await f.e.DB.prepare("UPDATE plugins SET submitter_id='legacy' WHERE id='old-plugin'").run();
  await f.e.DB.prepare("INSERT INTO favorites VALUES('legacy','old-plugin',1)").run();
  const { cookie } = await login(f);
  expect((await (await request(f.e, '/api/me', 'GET', undefined, cookie)).json() as any).submissions).toHaveLength(0);
  const input = { legacyUserId: 'legacy', globalUserId: canonicalId, evidence: 'isolated verified ownership evidence', confirmed: true };
  expect((await request(f.e, '/api/studio/legacy-link', 'POST', input, cookie)).status).toBe(401);
  const adminCookie = await seedAdmin(f.e);
  expect((await request(f.e, '/api/studio/legacy-link', 'POST', { ...input, confirmed: false }, adminCookie)).status).toBe(400);
  expect((await request(f.e, '/api/studio/legacy-link', 'POST', { ...input, globalUserId: '99887766-5544-4321-9876-aabbccddeeff' }, adminCookie)).status).toBe(409);
  expect((await f.e.DB.prepare('SELECT COUNT(*) n FROM legacy_account_links').first<any>()).n).toBe(0);
  expect((await request(f.e, '/api/studio/legacy-link', 'POST', input, adminCookie)).status).toBe(200);
  expect(f.operations).not.toContain('user');
  expect((await request(f.e, '/api/studio/legacy-link', 'POST', input, adminCookie)).status).toBe(200);
  const me = await (await request(f.e, '/api/me', 'GET', undefined, cookie)).json() as any;
  expect(me.submissions).toHaveLength(1); expect(me.favorites).toHaveLength(1);
  expect((await f.e.DB.prepare('SELECT COUNT(*) n FROM legacy_account_links').first<any>()).n).toBe(1);
  expect((await f.e.DB.prepare("SELECT COUNT(*) n FROM audit WHERE action='legacy_account_link'").first<any>()).n).toBe(1);
  expect((await f.e.DB.prepare("SELECT COUNT(*) n FROM users WHERE id='legacy'").first<any>()).n).toBe(1);
 });
 it('迁移失败回滚旧业务归属，全局 UUID 冲突不覆盖旧档案', async () => {
  const f = fixture(); await ensureBusinessUser(f.e, identity);
  await f.e.DB.prepare("INSERT INTO users(id,phone_index,phone_mask,created_at) VALUES('legacy','old-index','mask',1)").run();
  await seedPlugin(f.e, { id: 'rollback-plugin', fullName: 'fixture/rollback' });
  await f.e.DB.prepare("UPDATE plugins SET submitter_id='legacy' WHERE id='rollback-plugin'").run();
  await f.e.DB.prepare("INSERT INTO favorites VALUES('legacy','rollback-plugin',1)").run();
  const adminCookie = await seedAdmin(f.e), db = f.e.DB;
  f.e.DB = new Proxy(db, { get(target, key) { if (key === 'batch') return (statements: D1PreparedStatement[]) => target.batch([...statements, target.prepare('INSERT INTO missing_table VALUES(1)')]); const value = Reflect.get(target, key); return typeof value === 'function' ? value.bind(target) : value; } });
  expect((await request(f.e, '/api/studio/legacy-link', 'POST', { legacyUserId: 'legacy', globalUserId: canonicalId, evidence: 'isolated verified ownership evidence', confirmed: true }, adminCookie)).status).toBe(500);
  expect(await db.prepare('SELECT submitter_id FROM plugins WHERE id=?').bind('rollback-plugin').first()).toEqual({ submitter_id: 'legacy' });
  expect((await db.prepare('SELECT COUNT(*) n FROM legacy_account_links').first<any>()).n).toBe(0);
  await db.prepare("UPDATE users SET identity_kind='legacy' WHERE id=?").bind(canonicalId).run();
  await expect(ensureBusinessUser(f.e, identity)).rejects.toThrow('冲突');
 });
 it('不允许站外、API 或编码分隔符返回地址', () => {
  for (const next of ['//attacker.example', '/\\attacker', '/api/logout', '/%2fattacker', '/bad\npath', '/me/../api/logout', '/%61pi/logout', '/%252fattacker', '/bad%00path']) expect(safeNext(next)).toBe('/me');
 });
});
