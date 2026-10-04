import { describe, expect, it } from 'vitest';
import { createSession } from '../../worker/security';
import { ensureBusinessUser, safeNext } from '../../worker/sso';
import { origin, request, seedAdmin, seedPlugin, testEnv } from '../integration/harness';

const canonicalId = '11223344-5566-4778-8990-aabbccddeeff';
const childToken = 'S'.repeat(43);
const identity = { id: canonicalId, display_name: '有赞用户' };
function fixture() {
 const e = { ...testEnv(), SSO_ENABLED: 'true', SSO_ORIGIN: 'https://uv.example.test', SSO_CLIENT_SECRET: 'isolated-site-backchannel-credential-32-characters' };
 let active = true, attempt: any, consumed = false;
 const operations: string[] = [];
 e.AUTH_SERVICE = { async fetch(input: Request) {
  const url = new URL(input.url), op = url.pathname.split('/').at(-1)!;
  const body = await input.json() as any; operations.push(op);
  if (op === 'start') { attempt = body; consumed = false; return Response.json({ authorizationUrl: e.SSO_ORIGIN + '/api/auth/authorize?request=fixture' }); }
  if (op === 'exchange') {
   const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body.verifier)));
   const challenge = btoa(String.fromCharCode(...hash)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
   if (!active || consumed || body.state !== attempt.state || challenge !== attempt.challenge || body.code !== 'C'.repeat(43)) return Response.json({}, { status: 400 });
   consumed = true; return Response.json({ token: childToken, user: identity, expiresAt: Date.now() + 60000, next: attempt.next });
  }
  if (op === 'user') return body.userId === canonicalId ? Response.json({ user: identity }) : Response.json({}, { status: 404 });
  if (body.token !== childToken || !active) return Response.json({}, { status: 401 });
  if (op === 'logout') { active = false; return Response.json({ ok: true }); }
  return Response.json({ user: identity, sessionId: 'central-root-session', expiresAt: Date.now() + 60000 });
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
  expect((await request(f.e, '/api/studio/legacy-link', 'POST', input, adminCookie)).status).toBe(200);
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
  for (const next of ['//attacker.example', '/\\attacker', '/api/logout', '/%2fattacker', '/bad\npath']) expect(safeNext(next)).toBe('/me');
 });
});
