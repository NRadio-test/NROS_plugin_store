import { expect, it } from 'vitest';
import { receiveUpload } from '../../worker/uploads';
import { processTask, refresh, submit } from '../../worker/pipeline';
import { makeIPK } from '../adapters/fixtures';
import { installFixture, origin, request, seedAdmin, testEnv } from './harness';

it('关闭审核后上传直接发布，不调用查毒、AI 或消耗 AI 额度', async () => {
  const e = { ...testEnv(), REVIEW_ENABLED: 'false', CLOUDMERSIVE_API_KEY: '' };
  const bytes = await makeIPK({ dataFiles: [{ name: 'usr/bin/demo', bytes: new Uint8Array([127, 69, 76, 70, 0, 1]) }] });
  const form = new FormData();
  form.set('name', '未审核作品'); form.set('description', '说明'); form.set('tutorial', '# 使用教程');
  form.set('file', new File([bytes as BlobPart], 'demo.ipk'));
  const task = await receiveUpload(e, new Request(origin, { method: 'POST', body: form }), null);
  expect(task.message).toContain('未审核');
  await processTask(e, task.taskId!);
  const detail = await (await request(e, `/api/plugins/${task.pluginId}`)).json() as any;
  expect(detail.publicationMode).toBe('unreviewed'); expect(detail.reviewLabel).toContain('审核暂时关闭'); expect(detail.reviewedAt).toBeNull();
  const download = await request(e, `/api/plugins/${task.pluginId}/download/1`);
  expect(download.status).toBe(200); expect(new Uint8Array(await download.arrayBuffer())).toEqual(bytes);
  expect(fetch).not.toHaveBeenCalled();
  expect((await e.DB.prepare('SELECT COUNT(*) n FROM ai_usage').first<any>()).n).toBe(0);
  const session = await (await request(e, '/api/session')).json() as any;
  expect(session.reviewEnabled).toBe(false);
  const cookie = await seedAdmin(e);
  expect((await request(e, '/api/studio/ai/test', 'POST', {}, cookie)).status).toBe(409);
  expect(fetch).not.toHaveBeenCalled();
});

it('已有待处理任务按当前关闭状态直接发布，重新开启不复用免审结果', async () => {
  const enabled = { ...testEnv(), REVIEW_ENABLED: 'true' };
  const { fixture, aiCalls } = await installFixture();
  const task = await submit(enabled, 'https://github.com/fixture/harmless', null);
  const disabled = { ...enabled, REVIEW_ENABLED: 'false' };
  await processTask(disabled, task.taskId!);
  expect(aiCalls).toHaveLength(0);
  expect(fixture.calls.some(c => c.url.includes('/git/trees/'))).toBe(false);
  expect((await (await request(disabled, `/api/plugins/${task.pluginId}`)).json() as any).publicationMode).toBe('unreviewed');
  const next = await refresh(enabled, task.pluginId!, true);
  await processTask(enabled, next.taskId);
  expect((await enabled.DB.prepare('SELECT status FROM tasks WHERE id=?').bind(next.taskId).first<any>()).status).toBe('waiting_config');
  expect(fixture.calls.some(c => c.url.includes('/git/trees/'))).toBe(true);
});

it('关闭审核仍要求真实文件，不能发布缺失的安装包', async () => {
  const e = { ...testEnv(), REVIEW_ENABLED: 'false' };
  const { fixture } = await installFixture();
  fixture.paths.set('/repos/fixture/harmless/releases/3001/assets?per_page=100&page=1', []);
  const task = await submit(e, 'https://github.com/fixture/harmless', null);
  await processTask(e, task.taskId!);
  expect((await request(e, `/api/plugins/${task.pluginId}`)).status).toBe(404);
  expect((await e.DB.prepare('SELECT status FROM tasks WHERE id=?').bind(task.taskId).first<any>()).status).toBe('waiting_package');
});
