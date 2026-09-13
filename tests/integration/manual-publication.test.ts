import { describe, expect, it } from 'vitest';
import { receiveUpload } from '../../worker/uploads';
import { manualPublish } from '../../worker/manual-publication';
import { processTask, scan, submit } from '../../worker/pipeline';
import { makeIPK } from '../adapters/fixtures';
import { installFixture, origin, request, seedAdmin, testEnv } from './harness';

async function candidate() {
  const e = testEnv();
  e.CLOUDMERSIVE_API_KEY = '';
  const bytes = await makeIPK({ dataFiles: [{ name: 'usr/bin/demo', bytes: new Uint8Array([127, 69, 76, 70, 0, 1]) }] });
  const form = new FormData();
  form.set('name', '手动作品'); form.set('description', '安装包'); form.set('tutorial', '# 使用说明'); form.set('file', new File([bytes as BlobPart], 'demo.ipk'));
  const task = await receiveUpload(e, new Request(origin, { method: 'POST', body: form }), null);
  const cookie = await seedAdmin(e);
  return { e, task, cookie, bytes };
}
describe('管理员手动上架', () => {
  it('无 AI/查毒配置也可发布二进制，准确披露且可下载，不调用外部服务', async () => {
    const { e, task, cookie, bytes } = await candidate();
    const r = await request(e, `/api/studio/plugins/${task.pluginId}/manual-publish`, 'POST', { confirmed: true, revision: 1 }, cookie);
    expect(r.status).toBe(200);
    const detail = await (await request(e, `/api/plugins/${task.pluginId}`)).json() as any;
    expect(detail.publicationMode).toBe('manual'); expect(detail.reviewLabel).toContain('未经自动审核'); expect(detail.reviewedAt).toBeNull();
    const download = await request(e, `/api/plugins/${task.pluginId}/download/1`);
    expect(download.status).toBe(200); expect(new Uint8Array(await download.arrayBuffer())).toEqual(bytes);
    expect(fetch).not.toHaveBeenCalled();
    expect(await e.DB.prepare("SELECT admin_id FROM audit WHERE action='manual-publish'").first()).toEqual({ admin_id: 'admin' });
    await processTask(e, task.taskId!); await scan(e);
    expect((await e.DB.prepare('SELECT status,revision FROM plugins WHERE id=?').bind(task.pluginId).first<any>())).toMatchObject({ status: 'published', revision: 2 });
    expect((await e.DB.prepare("SELECT COUNT(*) n FROM tasks WHERE status IN ('pending','running','retry')").first<any>()).n).toBe(0);
  });
  it('仅管理员、同源且明确确认才可操作；拒绝过期版本', async () => {
    const { e, task, cookie } = await candidate(); const url = `/api/studio/plugins/${task.pluginId}/manual-publish`;
    expect((await request(e, url, 'POST', { confirmed: true, revision: 1 })).status).toBe(401);
    const login = await request(e, '/api/login', 'POST', { phone: '13800138000' });
    expect((await request(e, url, 'POST', { confirmed: true, revision: 1 }, login.headers.get('set-cookie')!.split(';')[0])).status).toBe(401);
    expect((await request(e, url, 'POST', { confirmed: true, revision: 1 }, cookie, { Origin: 'https://evil.example' })).status).toBe(403);
    expect((await request(e, url, 'POST', { revision: 1 }, cookie)).status).toBe(400);
    expect((await request(e, url, 'POST', { confirmed: true, revision: 99 }, cookie)).status).toBe(409);
    expect((await request(e, `/api/plugins/${task.pluginId}`)).status).toBe(404);
  });
  it('管理员可显式手动恢复已下架包；已删除文件不能凭空上架', async () => {
    const { e, task, cookie } = await candidate(); const base = `/api/studio/plugins/${task.pluginId}`;
    await request(e, base + '/unlist', 'POST', {}, cookie);
    expect((await request(e, base + '/manual-publish', 'POST', { confirmed: true, revision: 2 }, cookie)).status).toBe(200);
    await request(e, base + '/delete', 'POST', {}, cookie);
    expect((await request(e, base + '/manual-publish', 'POST', { confirmed: true, revision: 4 }, cookie)).status).toBe(422);
    expect((await request(e, `/api/plugins/${task.pluginId}/download/1`)).status).toBe(404);
  });
  it('文件被替换时仍阻止发布', async () => {
    const { e, task, cookie } = await candidate();
    const row = await e.DB.prepare('SELECT object_key FROM uploads WHERE plugin_id=?').bind(task.pluginId).first<any>();
    await e.UPLOADS!.put(row.object_key, 'corrupt');
    expect((await request(e, `/api/studio/plugins/${task.pluginId}/manual-publish`, 'POST', { confirmed: true, revision: 1 }, cookie)).status).toBe(422);
    expect((await request(e, `/api/plugins/${task.pluginId}`)).status).toBe(404);
  });
  it('读取期间撤销会话或发生新操作时不能发布', async () => {
    const { e, task } = await candidate();
    await expect(manualPublish(e, task.pluginId, 1, async () => { throw new Error('revoked'); })).rejects.toThrow('revoked');
    await expect(manualPublish(e, task.pluginId, 1, async () => {
      await e.DB.prepare("UPDATE plugins SET revision=revision+1,blocked=1,status='removed' WHERE id=?").bind(task.pluginId).run(); return 'admin';
    })).rejects.toMatchObject({ status: 409 });
    expect((await e.DB.prepare('SELECT COUNT(*) n FROM snapshots').first<any>()).n).toBe(0);
    expect((await e.DB.prepare('SELECT COUNT(*) n FROM audit').first<any>()).n).toBe(0);
  });
  it('GitHub 缺少源码也可手动发布；不调用 AI，也不读取源码树', async () => {
    const e = testEnv(), { fixture, aiCalls } = await installFixture(), cookie = await seedAdmin(e);
    fixture.paths.set('/repos/fixture/harmless/commits/v1.0.0', { sha: fixture.sourceCommit });
    fixture.paths.delete(`/repos/fixture/harmless/git/trees/${fixture.sourceCommit}?recursive=1`);
    const task = await submit(e, 'https://github.com/fixture/harmless', null);
    const result = await request(e, `/api/studio/plugins/${task.pluginId}/manual-publish`, 'POST', { confirmed: true, revision: 1 }, cookie);
    expect(result.status).toBe(200); expect(aiCalls).toHaveLength(0);
    expect(fixture.calls.some(call => call.url.includes('/git/trees/') || call.url.includes('/git/blobs/'))).toBe(false);
    await scan(e);
    expect((await e.DB.prepare('SELECT revision FROM plugins WHERE id=?').bind(task.pluginId).first<any>()).revision).toBe(2);
    expect((await request(e, `/api/plugins/${task.pluginId}/download/2001`)).status).toBe(200);
  });
});
