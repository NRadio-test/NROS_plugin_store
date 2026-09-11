import { describe, expect, it } from 'vitest';
import type { Env } from '../../worker/contracts';
import { hash, hashPassword, LEGACY_DEFAULT_FINGERPRINTS } from '../../worker/security';
import { request, seedAdmin, testEnv } from './harness';

const password = 'isolated-shared-account-42';
async function fixture() {
 const e = testEnv();
 await seedAdmin(e, await hashPassword(password, 100000));
 await e.DB.prepare("DELETE FROM sessions").run();
 return e;
}
const login = (e: Env, value = password) => request(e, '/api/studio/login', 'POST', { username: 'FIXTURE-ADMIN', password: value });
const cookieOf = (r: Response) => r.headers.get('set-cookie')!.split(';')[0]!;

describe('留言箱共享管理员，只读认证与商店会话隔离', () => {
 it('只读共享库完成登录、账号查询、业务访问与退出；会话和审计仅存在商店', async () => {
  const e = await fixture();
  const auth = e.ADMIN_AUTH_DB;
  const statements: string[] = [];
  e.ADMIN_AUTH_DB = new Proxy(auth, { get(target, prop) {
   if (prop === 'prepare') return (sql: string) => {
    statements.push(sql);
    if (!/^SELECT /i.test(sql)) throw new Error('Shared auth write prohibited');
    return target.prepare(sql);
   };
   const value = Reflect.get(target, prop);
   return typeof value === 'function' ? () => { throw new Error('Shared auth operation prohibited'); } : value;
  } });
  const response = await login(e);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ admin: { id: 'admin', username: 'fixture-admin' } });
  const cookie = cookieOf(response);
  expect(response.headers.get('set-cookie')).toContain('HttpOnly');
  expect(response.headers.get('set-cookie')).not.toContain('Domain=');
  expect(await (await request(e, '/api/session', 'GET', undefined, cookie)).json()).toEqual({ user: null, admin: { id: 'admin', username: 'fixture-admin' } });
  expect((await request(e, '/api/studio/overview', 'GET', undefined, cookie)).status).toBe(200);
  expect((await request(e, '/api/studio/password', 'POST', { currentPassword: password, newPassword: 'unused' }, cookie)).status).toBe(403);
  expect((await e.DB.prepare('SELECT COUNT(*) n FROM admins').first<{ n: number }>())!.n).toBe(0);
  expect((await e.DB.prepare('SELECT COUNT(*) n FROM sessions').first<{ n: number }>())!.n).toBe(1);
  expect((await e.DB.prepare('SELECT COUNT(*) n FROM audit').first<{ n: number }>())!.n).toBe(1);
  expect((await request(e, '/api/studio/logout', 'POST', {}, cookie)).status).toBe(200);
  expect((await request(e, '/api/studio/overview', 'GET', undefined, cookie)).status).toBe(401);
  expect(statements.length).toBeGreaterThan(3);
 });

 it('不回退到商店本地账号，旧本地会话即使 ID 相同也无权限', async () => {
  const e = await fixture();
  await e.DB.prepare("INSERT INTO admins VALUES('admin','fixture-admin',?,?,?)").bind(await hashPassword('local-only-password', 100000), Date.now(), Date.now()).run();
  expect((await login(e, 'local-only-password')).status).toBe(401);
  const token = 'a'.repeat(43);
  await e.DB.prepare("INSERT INTO sessions VALUES(?,'admin','admin',?)").bind(await hash(token), Date.now() + 60000).run();
  expect((await request(e, '/api/studio/overview', 'GET', undefined, `plugin_store_admin=${token}`)).status).toBe(401);
  await e.ADMIN_AUTH_DB.prepare('DELETE FROM admins').run();
  expect((await login(e)).status).toBe(401);
 });

 it.each(['must-change', 'deleted', 'password-changed'])('共享账号 %s 后，已有会话与账号查询立即失效', async mode => {
  const e = await fixture();
  const cookie = cookieOf(await login(e));
  if (mode === 'must-change') await e.ADMIN_AUTH_DB.prepare('UPDATE admins SET must_change_password=1').run();
  if (mode === 'deleted') await e.ADMIN_AUTH_DB.prepare('DELETE FROM admins').run();
  if (mode === 'password-changed') await e.ADMIN_AUTH_DB.prepare('UPDATE admins SET password_hash=?').bind(await hashPassword('changed-shared-password', 100000)).run();
  expect((await request(e, '/api/studio/overview', 'GET', undefined, cookie)).status).toBe(401);
  expect((await (await request(e, '/api/session', 'GET', undefined, cookie)).json() as { admin: unknown }).admin).toBeNull();
  const response = await login(e);
  expect(response.status).toBe(mode === 'must-change' ? 403 : 401);
  expect(response.headers.get('set-cookie')).toBeNull();
  if (mode === 'password-changed') expect((await login(e, 'changed-shared-password')).status).toBe(200);
 });

 it('已知默认验证记录仍拒绝，且不会签发会话', async () => {
  const e = await fixture();
  const record = await e.ADMIN_AUTH_DB.prepare('SELECT password_hash FROM admins').first<{ password_hash: string }>();
  const fingerprint = await hash(record!.password_hash);
  LEGACY_DEFAULT_FINGERPRINTS.add(fingerprint);
  try { expect((await login(e)).status).toBe(401); }
  finally { LEGACY_DEFAULT_FINGERPRINTS.delete(fingerprint); }
  expect((await e.DB.prepare('SELECT COUNT(*) n FROM sessions').first<{ n: number }>())!.n).toBe(0);
 });

 it('共享库缺失或失败时关闭管理员登录，普通用户仍独立使用', async () => {
  const e = await fixture();
  e.ADMIN_AUTH_DB = undefined as unknown as D1Database;
  expect((await login(e)).status).toBe(503);
  expect((await request(e, '/api/login', 'POST', { phone: '13800138000' })).status).toBe(200);
  e.ADMIN_AUTH_DB = { prepare() { throw new Error('Unavailable'); } } as unknown as D1Database;
  expect((await login(e)).status).toBe(500);
  expect((await e.DB.prepare("SELECT COUNT(*) n FROM sessions WHERE kind='admin'").first<{ n: number }>())!.n).toBe(0);
 });
});
