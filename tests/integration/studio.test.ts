import { describe, expect, it } from 'vitest';
import type { Env } from '../../worker/contracts';
import { hashPassword, verifyPassword } from '../../worker/security';
import { validateNewPassword } from '../../worker/studio';
import { INTERNAL_SENTINEL, publish, request, seedAdmin, seedPlugin, seedTask, testEnv } from './harness';

const STUDIO_FIELDS = ['id', 'full_name', 'repository_id', 'description', 'status', 'blocked', 'revision', 'version', 'favorite_count', 'download_count', 'public_reason', 'created_at', 'updated_at', 'checked_at', 'approved_snapshot_id', 'submitter_id', 'task_status', 'task_attempts', 'last_task_at'].sort();
const DEFAULT_AI_BASE_URL = 'https://api.openai.com/v1';

interface ListBody { items: Record<string, any>[]; total: number; page: number; pageSize: number }

async function list(e: Env, query: string, cookie: string): Promise<ListBody> {
 const response = await request(e, '/api/studio/plugins' + query, 'GET', undefined, cookie);
 expect(response.status).toBe(200);
 return await response.json() as ListBody;
}

describe('Studio 管理、总览与改密接口', () => {
 it('Studio 读写接口都要求管理员会话，内部依据只在 Studio 详情出现', async () => {
  const x = await publish();
  const anonymous: [string, string][] = [['/api/studio/overview', 'GET'], ['/api/studio/plugins', 'GET'], [`/api/studio/plugins/${x.pluginId}`, 'GET'], ['/api/studio/sources/candidates', 'GET'], ['/api/studio/password', 'POST']];
  for (const [path, method] of anonymous) {
   const response = await request(x.e, path, method, method === 'POST' ? { currentPassword: 'not-a-password', newPassword: 'not-a-password' } : undefined);
   expect(response.status, path).toBe(401);
  }
  const cookie = await seedAdmin(x.e);
  const detail = await (await request(x.e, `/api/studio/plugins/${x.pluginId}`, 'GET', undefined, cookie)).json() as Record<string, any>;
  expect(detail.snapshot.internal_reason).toBe(INTERNAL_SENTINEL);
  expect(detail.tasks[0].internal_reason).toBe(INTERNAL_SENTINEL);
  const publicBody = await (await request(x.e, `/api/plugins/${x.pluginId}`)).json() as Record<string, unknown>;
  expect(JSON.stringify(publicBody)).not.toContain('内部依据');
  expect(JSON.stringify(publicBody)).not.toContain('internal_reason');
  expect((await request(x.e, '/api/studio/plugins/no-such-plugin', 'GET', undefined, cookie)).status).toBe(404);
  expect((await request(x.e, '/api/studio/overview', 'GET', undefined, cookie)).status).toBe(200);
 });

 it('总览计数来自真实数据，只回显模型与地址，不含 API Key 密文或内部依据', async () => {
  const x = await publish();
  await seedPlugin(x.e, { id: 'p-wait', fullName: 'owner/wait', status: 'waiting_package', createdAt: 1100 });
  await seedTask(x.e, 'p-wait', 'pending', { createdAt: 1100 });
  await seedPlugin(x.e, { id: 'p-reject', fullName: 'owner/reject', status: 'rejected', createdAt: 1200 });
  await seedTask(x.e, 'p-reject', 'failed', { createdAt: 2000 });
  await seedPlugin(x.e, { id: 'p-removed', fullName: 'owner/removed', status: 'removed', approved: false, createdAt: 1300 });
  await seedPlugin(x.e, { id: 'p-blocked', fullName: 'owner/blocked', status: 'published', blocked: 1, createdAt: 1400, downloads: 3, favorites: 2 });
  const cookie = await seedAdmin(x.e);
  const body = await (await request(x.e, '/api/studio/overview', 'GET', undefined, cookie)).json() as Record<string, any>;
  expect(body.counts).toEqual({ plugins: 5, published: 2, inReview: 1, waiting: 1, rejected: 1, removed: 1, blocked: 1, favorites: 2, downloads: 3, users: 2, tasksActive: 1, tasksFailed: 1 });
  expect(body.ai).toEqual({ configured: true, model: 'fixture-model', baseUrl: 'https://ai.vendor.com/v1' });
  const serialized = JSON.stringify(body);
  expect(serialized).not.toContain('isolated-key');
  expect(serialized).not.toContain('v1.');
  expect(serialized).not.toContain('内部依据');
  expect(body.sources).toEqual({ total: 1, enabled: 1 });
  expect(body.recentTasks).toHaveLength(3);
  expect(body.recentTasks[0].plugin_id).toBe(x.pluginId);
  expect(body.recentTasks.map((task: Record<string, unknown>) => task.full_name)).toContain('owner/reject');
  for (const task of body.recentTasks) expect(Object.keys(task).sort()).toEqual(['attempts', 'created_at', 'full_name', 'id', 'plugin_id', 'public_reason', 'status']);
 });

 it('没有保存 AI 配置时 configured 为 false，也不回显任何密钥字段', async () => {
  const e = testEnv();
  const cookie = await seedAdmin(e);
  const body = await (await request(e, '/api/studio/overview', 'GET', undefined, cookie)).json() as Record<string, any>;
  expect(body.ai.configured).toBe(false);
  expect(body.ai.baseUrl).toBe(DEFAULT_AI_BASE_URL);
  expect(body.counts).toEqual({ plugins: 0, published: 0, inReview: 0, waiting: 0, rejected: 0, removed: 0, blocked: 0, favorites: 0, downloads: 0, users: 0, tasksActive: 0, tasksFailed: 0 });
  expect(body.recentTasks).toEqual([]);
  expect(JSON.stringify(body)).not.toContain('apiKey');
 });

 it('Studio 列表服务端分页与转义搜索，total 为满足条件的总数', async () => {
  const e = testEnv();
  for (let index = 1; index <= 25; index++) await seedPlugin(e, { id: `s-${String(index).padStart(2, '0')}`, fullName: `owner/item-${String(index).padStart(2, '0')}`, createdAt: 1000 + index });
  await seedPlugin(e, { id: 's-under', fullName: 'owner/repo_05', createdAt: 9000 });
  await seedPlugin(e, { id: 's-wild', fullName: 'owner/repoX05', createdAt: 9001 });
  await seedPlugin(e, { id: 's-percent', fullName: 'owner/percent%name', createdAt: 9002 });
  await seedPlugin(e, { id: 's-percentish', fullName: 'owner/percentXYZname', createdAt: 9003 });
  await seedPlugin(e, { id: 's-blocked', fullName: 'owner/blocked-01', status: 'published', blocked: 1, createdAt: 9004 });
  const cookie = await seedAdmin(e);
  const first = await list(e, '?page=1&pageSize=10', cookie);
  expect(first.total).toBe(30);
  expect(first.items).toHaveLength(10);
  expect(first.page).toBe(1);
  expect(first.pageSize).toBe(10);
  expect(first.items[0].id).toBe('s-blocked');
  const second = await list(e, '?page=2&pageSize=10', cookie);
  expect(second.items).toHaveLength(10);
  const firstIds = first.items.map(item => item.id) as string[];
  expect(second.items.map(item => item.id).some(id => firstIds.includes(id as string))).toBe(false);
  const beyond = await list(e, '?page=4&pageSize=10', cookie);
  expect(beyond.items).toHaveLength(0);
  expect(beyond.total).toBe(30);
  expect((await list(e, '?page=0&pageSize=5', cookie)).pageSize).toBe(10);
  expect((await list(e, '?page=1&pageSize=500', cookie)).pageSize).toBe(100);
  expect((await list(e, '?page=abc&pageSize=xyz', cookie)).page).toBe(1);
  // LIKE 转义：下划线与百分号必须按字面匹配，不能变成通配符。
  expect((await list(e, '?q=repo_05', cookie)).items.map(item => item.id)).toEqual(['s-under']);
  expect((await list(e, '?q=percent%25name', cookie)).items.map(item => item.id)).toEqual(['s-percent']);
  expect((await list(e, '?q=percentX', cookie)).items.map(item => item.id)).toEqual(['s-percentish']);
  expect((await list(e, '?q=owner%2Fitem', cookie)).total).toBe(25);
 });

 it('Studio 列表状态筛选与字段集合，任务信息取 revision 最新一条', async () => {
  const e = testEnv();
  await seedPlugin(e, { id: 'f-pub', fullName: 'owner/pub', createdAt: 1000 });
  await seedPlugin(e, { id: 'f-review', fullName: 'owner/review', status: 'pending', createdAt: 1001 });
  await seedTask(e, 'f-review', 'superseded', { revision: 0, createdAt: 3000 });
  await seedTask(e, 'f-review', 'running', { attempts: 2, createdAt: 4000 });
  await seedPlugin(e, { id: 'f-wait', fullName: 'owner/wait', status: 'waiting_config', createdAt: 1002 });
  await seedPlugin(e, { id: 'f-reject', fullName: 'owner/reject', status: 'rejected', createdAt: 1003 });
  await seedPlugin(e, { id: 'f-removed', fullName: 'owner/removed', status: 'removed', approved: false, createdAt: 1004 });
  await seedPlugin(e, { id: 'f-blocked', fullName: 'owner/blocked', status: 'published', blocked: 1, createdAt: 1005 });
  const cookie = await seedAdmin(e);
  const ids = async (status: string) => (await list(e, '?status=' + status + '&pageSize=100', cookie)).items.map(item => item.id) as string[];
  expect((await list(e, '?status=all&pageSize=100', cookie)).total).toBe(6);
  expect(await ids('published')).toEqual(['f-blocked', 'f-pub']);
  expect(await ids('in_review')).toEqual(['f-review']);
  expect(await ids('waiting')).toEqual(['f-wait']);
  expect(await ids('rejected')).toEqual(['f-reject']);
  expect(await ids('removed')).toEqual(['f-removed']);
  expect(await ids('blocked')).toEqual(['f-blocked']);
  expect(await ids('not-a-status')).toEqual(['f-blocked', 'f-removed', 'f-reject', 'f-wait', 'f-review', 'f-pub']);
  const review = (await list(e, '?status=in_review', cookie)).items[0]!;
  expect(Object.keys(review).sort()).toEqual(STUDIO_FIELDS);
  expect(review.task_status).toBe('running');
  expect(review.task_attempts).toBe(2);
  expect(review.last_task_at).toBe(4000);
  expect(review.version).toBe('v1.0.0');
  expect(review.favorite_count).toBe(0);
  const idle = (await list(e, '?status=blocked', cookie)).items[0]!;
  expect(idle.task_status).toBeNull();
  expect(idle.task_attempts).toBeNull();
  expect(idle.last_task_at).toBeNull();
  expect(idle.blocked).toBe(1);
  expect(idle.approved_snapshot_id).toBeTypeOf('string');
  expect(idle.submitter_id).toBeNull();
 });

 it('Studio 详情返回快照、附件、任务与审计记录', async () => {
  const x = await publish();
  const cookie = await seedAdmin(x.e);
  const detail = await (await request(x.e, `/api/studio/plugins/${x.pluginId}`, 'GET', undefined, cookie)).json() as Record<string, any>;
  expect(Object.keys(detail.plugin).sort()).toEqual(STUDIO_FIELDS);
  expect(detail.plugin.version).toBe('v1.0.0');
  expect(detail.plugin.status).toBe('published');
  expect(detail.plugin.task_status).toBe('done');
  expect(detail.plugin.task_attempts).toBe(1);
  expect(detail.snapshot.verdict).toBe('allow');
  expect(detail.snapshot.public_reason).toBe('隔离测试：静态材料符合预期');
  expect(detail.snapshot.internal_reason).toBe(INTERNAL_SENTINEL);
  expect(detail.snapshot.review_version).toBeTruthy();
  expect(detail.assets).toEqual([{ id: 2001, name: 'harmless_all.ipk', size: x.fixture.ipk.length, sha256: x.fixture.asset.digest.slice(7), disabled: 0, package_name: 'harmless-demo', architecture: 'all' }]);
  expect(detail.tasks.map((task: Record<string, unknown>) => task.revision)).toEqual([1]);
  expect(detail.tasks[0].status).toBe('done');
  expect(detail.audits).toEqual([]);
  expect((await request(x.e, `/api/studio/plugins/${x.pluginId}/retry`, 'POST', {}, cookie)).status).toBe(200);
  const after = await (await request(x.e, `/api/studio/plugins/${x.pluginId}`, 'GET', undefined, cookie)).json() as Record<string, any>;
  expect(after.tasks.map((task: Record<string, unknown>) => task.revision)).toEqual([2, 1]);
  expect(after.plugin.task_status).toBe('pending');
  expect(after.audits).toHaveLength(1);
  expect(after.audits[0].action).toBe('retry');
  expect(after.audits[0].target).toBe(x.pluginId);
  expect(after.audits[0].admin_id).toBe('admin');
 });

 it('未批准插件的 Studio 详情返回空快照与空附件', async () => {
  const e = testEnv();
  await seedPlugin(e, { id: 'p-pending', fullName: 'owner/pending', status: 'waiting_config', approved: false, publicReason: '等待配置 AI 审核服务' });
  await seedTask(e, 'p-pending', 'waiting_config');
  const cookie = await seedAdmin(e);
  const detail = await (await request(e, '/api/studio/plugins/p-pending', 'GET', undefined, cookie)).json() as Record<string, any>;
  expect(detail.snapshot).toBeNull();
  expect(detail.assets).toEqual([]);
  expect(detail.tasks).toHaveLength(1);
  expect(detail.plugin.approved_snapshot_id).toBeNull();
 });

 it('改密参数校验拒绝错误当前密码、弱口令与同口令', async () => {
  const e = testEnv();
  const current = '第一版隔离密码-2024-with-letters';
  const cookie = await seedAdmin(e, await hashPassword(current));
  const tryChange = async (body: unknown) => request(e, '/api/studio/password', 'POST', body, cookie);
  const wrong = await tryChange({ currentPassword: '完全不对的密码-000', newPassword: 'replacement-2025-x' });
  expect(wrong.status).toBe(401);
  expect(((await wrong.json()) as { error: string }).error).toContain('当前密码');
  expect((await tryChange({ currentPassword: current, newPassword: 'Ab1' })).status).toBe(400);
  expect((await tryChange({ currentPassword: current, newPassword: 'nodigitshere' })).status).toBe(400);
  expect((await tryChange({ currentPassword: current, newPassword: current })).status).toBe(400);
  expect((await tryChange({ currentPassword: current, newPassword: 12345678901234 })).status).toBe(400);
  const stored = await e.DB.prepare('SELECT password_hash FROM admins WHERE id=?').bind('admin').first<{ password_hash: string }>();
  expect(await verifyPassword(current, stored!.password_hash)).toBe(true);
  expect((await e.DB.prepare("SELECT COUNT(*) n FROM audit WHERE action='password-change'").first<{ n: number }>())?.n).toBe(0);
 });

 it('改密成功后旧密码失效、新密码可用，旧会话失效但同一响应签发新会话', async () => {
  const e = testEnv();
  const current = '第一版隔离密码-2024-with-letters';
  const next = 'replacement-password-2025-x';
  const cookie = await seedAdmin(e, await hashPassword(current));
  const changed = await request(e, '/api/studio/password', 'POST', { currentPassword: current, newPassword: next }, cookie);
  expect(changed.status).toBe(200);
  expect(await changed.json()).toEqual({ ok: true });
  const issued = changed.headers.get('set-cookie');
  expect(issued).toContain('plugin_store_admin=');
  expect(issued).toContain('HttpOnly');
  const fresh = issued!.split(';')[0]!;
  expect(fresh).not.toBe(cookie);
  expect((await request(e, '/api/studio/overview', 'GET', undefined, cookie)).status).toBe(401);
  expect((await request(e, '/api/studio/overview', 'GET', undefined, fresh)).status).toBe(200);
  expect((await e.DB.prepare("SELECT COUNT(*) n FROM sessions WHERE kind='admin' AND subject_id='admin'").first<{ n: number }>())?.n).toBe(1);
  expect((await request(e, '/api/studio/login', 'POST', { username: 'fixture-admin', password: current })).status).toBe(401);
  expect((await request(e, '/api/studio/login', 'POST', { username: 'fixture-admin', password: next })).status).toBe(200);
  const stored = await e.DB.prepare('SELECT password_hash,updated_at FROM admins WHERE id=?').bind('admin').first<{ password_hash: string; updated_at: number }>();
  expect(stored!.password_hash).toMatch(/^pbkdf2-sha256\$600000\$[A-Za-z0-9_-]{22}\$[A-Za-z0-9_-]{43}$/);
  expect(stored!.password_hash).not.toContain(next);
  expect(await verifyPassword(next, stored!.password_hash)).toBe(true);
  expect(await verifyPassword(current, stored!.password_hash)).toBe(false);
  expect((await e.DB.prepare("SELECT admin_id,action,target FROM audit WHERE action='password-change'").all<{ admin_id: string; action: string; target: string }>()).results).toEqual([{ admin_id: 'admin', action: 'password-change', target: 'admin' }]);
 });

 it('新密码策略要求字母与数字组合，或 16 位以上可打印长口令', () => {
  expect(() => validateNewPassword('old-password-1', 'short1')).toThrow('12–200');
  expect(() => validateNewPassword('old-password-1', 'a'.repeat(201))).toThrow('12–200');
  expect(() => validateNewPassword('old-password-1', 'onlylettershere')).toThrow('字母与数字');
  expect(() => validateNewPassword('old-password-1', '123456789012')).toThrow('字母与数字');
  // 长度 ≥16 的可打印口令不强制混用字母与数字，但仍拒绝控制字符。
  expect(() => validateNewPassword('old-password-1', 'abcdefghijklmnopqrst')).not.toThrow();
  expect(() => validateNewPassword('old-password-1', 'long-passphrase-with-symbols')).not.toThrow();
  expect(() => validateNewPassword('old-password-1', '密码口令需要足够长并且可以打印出来')).not.toThrow();
  expect(() => validateNewPassword('old-password-1', 'with-control-char\u0007-abc')).toThrow();
  expect(() => validateNewPassword('replacement-2025', 'replacement-2025')).toThrow('不能与当前密码相同');
 });

 it('下载源候选只包含已上架且有批准快照的插件', async () => {
  const x = await publish();
  await seedPlugin(x.e, { id: 'p-pending', fullName: 'owner/pending', status: 'pending', approved: false, createdAt: 5000 });
  await seedPlugin(x.e, { id: 'p-blocked', fullName: 'owner/blocked', status: 'published', blocked: 1, createdAt: 6000 });
  await seedPlugin(x.e, { id: 'p-removed', fullName: 'owner/removed', status: 'removed', approved: false, createdAt: 7000 });
  const many = Array.from({ length: 12 }, (_, index) => ({ id: 5000 + index, name: `many_${index}.ipk`, size: 1024 + index, url: 'https://github.com/owner/many/releases/download/v1/many.ipk', digest: null, updatedAt: '2026-01-01T00:00:00Z', sha256: 'd'.repeat(64), packageName: 'many', architecture: 'arm64' }));
  await seedPlugin(x.e, { id: 'p-many', fullName: 'owner/many', createdAt: 8000, assets: many });
  await x.e.DB.prepare('UPDATE assets SET disabled=1 WHERE plugin_id=? AND id=?').bind('p-many', 5001).run();
  const cookie = await seedAdmin(x.e);
  const body = await (await request(x.e, '/api/studio/sources/candidates', 'GET', undefined, cookie)).json() as { items: Record<string, any>[] };
  expect(body.items.map(item => item.pluginId)).toEqual([x.pluginId, 'p-many']);
  expect(body.items[0]!.fullName).toBe('fixture/harmless');
  expect(body.items[0]!.version).toBe('v1.0.0');
  expect(body.items[0]!.assets).toEqual([{ id: 2001, name: 'harmless_all.ipk', size: x.fixture.ipk.length, architecture: 'all', disabled: 0 }]);
  // 每个插件最多 10 个附件，顺序按附件 id，停用状态原样回显。
  expect(body.items[1]!.assets).toHaveLength(10);
  expect(body.items[1]!.assets.map((asset: Record<string, unknown>) => asset.id)).toEqual([5000, 5001, 5002, 5003, 5004, 5005, 5006, 5007, 5008, 5009]);
  expect(body.items[1]!.assets[0]).toEqual({ id: 5000, name: 'many_0.ipk', size: 1024, architecture: 'arm64', disabled: 0 });
  expect(body.items[1]!.assets[1]!.disabled).toBe(1);
 });
});
