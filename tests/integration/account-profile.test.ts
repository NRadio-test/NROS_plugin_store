import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadSession, session, syncAccountProfile, type Session } from '../../src/lib/api';

const cached = { id: '11223344-5566-4778-8990-aabbccddeeff', display_name: '原昵称', avatar_url: 'https://img.yzcdn.cn/old.png' };
const updated = { ...cached, display_name: '新昵称', avatar_url: 'https://img.yzcdn.cn/new.png' };
const sessionReply = (user: Session['user'], ssoEnabled = true) => Response.json({ user, admin: null, ssoEnabled });
function deferred() {
 let resolve!: (value: Response) => void;
 const promise = new Promise<Response>(done => { resolve = done; });
 return { promise, resolve };
}
beforeEach(async () => {
 vi.stubGlobal('sessionStorage', { removeItem: vi.fn() });
 vi.mocked(fetch).mockImplementation(async () => sessionReply(null));
 await loadSession();
});
afterEach(() => vi.unstubAllGlobals());

describe('自动同步账号显示资料', () => {
 it('确认登录后自动同步，不阻塞会话展示；合并重复请求，一分钟后继续更新', async () => {
  const response = deferred(); let calls = 0;
  vi.mocked(fetch).mockImplementation(async path => path === '/api/session' ? sessionReply(cached) : (calls++, response.promise));
  await loadSession();
  expect(session.loaded).toBe(true); expect(session.user).toEqual(cached); expect(calls).toBe(1);
  const first = syncAccountProfile(); expect(syncAccountProfile()).toBe(first);
  response.resolve(Response.json({ user: updated })); await first;
  expect(session.user).toEqual(updated);
  vi.mocked(fetch).mockImplementation(async path => path === '/api/session' ? sessionReply(updated) : (calls++, Response.json({ user: updated })));
  await loadSession(); await syncAccountProfile(); expect(calls).toBe(1);
  vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 60001);
  await loadSession(); await syncAccountProfile(); expect(calls).toBe(2);
 });
 it('资料失败保留账号与已有头像昵称，后续自动恢复，无需点击按钮', async () => {
  let available = false, calls = 0;
  vi.mocked(fetch).mockImplementation(async path => {
   if (path === '/api/session') return sessionReply(cached);
   calls++;
   return available ? Response.json({ user: updated }) : Response.json({ error: '资料读取失败', code: 'profile_unavailable' }, { status: 503 });
  });
  await loadSession(); await syncAccountProfile();
  expect(session.user).toEqual(cached); expect(session.error).toBe('');
  await syncAccountProfile(); expect(calls).toBe(1);
  available = true; vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 60001);
  await loadSession(); await syncAccountProfile(); expect(session.user).toEqual(updated);
 });
 it.each([null, { id: '99887766-5544-4321-9876-aabbccddeeff', display_name: '另一个账号' }])('退出或换号后丢弃旧账号的迟到响应：%j', async next => {
  const response = deferred(); let current: Session['user'] = cached;
  vi.mocked(fetch).mockImplementation(async path => path === '/api/session' ? sessionReply(current) : current === cached ? response.promise : Response.json({ user: current }));
  await loadSession(); const pending = syncAccountProfile();
  current = next; await loadSession(); await syncAccountProfile();
  response.resolve(Response.json({ user: updated })); await pending;
  expect(session.user).toEqual(next);
 });
 it('资料接口明确报告过期时重新检查会话并退出显示', async () => {
  let expired = false;
  vi.mocked(fetch).mockImplementation(async path => {
   if (path === '/api/session') return sessionReply(expired ? null : cached);
   expired = true; return Response.json({ error: '登录过期', code: 'session_expired' }, { status: 401 });
  });
  await loadSession(); await syncAccountProfile();
  expect(session.user).toBeNull(); expect(session.error).toBe('');
 });
 it('匿名和旧手机号账号不发起有赞资料请求', async () => {
  for (const user of [null, { id: 'legacy', phone_mask: '138****0000' }]) {
   vi.mocked(fetch).mockClear().mockImplementation(async path => { expect(path).toBe('/api/session'); return sessionReply(user, false); });
   await loadSession(); await syncAccountProfile(); expect(fetch).toHaveBeenCalledTimes(1);
  }
 });
 it('不同用户的资料响应不能替换已验证的身份', async () => {
  vi.mocked(fetch).mockImplementation(async path => path === '/api/session' ? sessionReply(cached) : Response.json({ user: { ...updated, id: 'other' } }));
  await loadSession(); await syncAccountProfile(); expect(session.user).toEqual(cached);
 });
 it('较早的会话查询不能覆盖更新的退出结果', async () => {
  const response = deferred();
  vi.mocked(fetch).mockImplementationOnce(() => response.promise).mockImplementation(async () => sessionReply(null));
  const old = loadSession(); await loadSession();
  response.resolve(sessionReply(cached)); await old;
  expect(session.user).toBeNull();
 });
});
