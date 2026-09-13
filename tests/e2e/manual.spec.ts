import { test, expect } from '@playwright/test';
import { makeIPK } from '../adapters/fixtures';

test.afterEach(async ({ request }) => { await request.get('/__test/mode/allow'); });

test('管理员在后台手动上架被拒绝的 IPK，跳过审核并准确展示', async ({ page, request, baseURL }) => {
  await request.get('/__test/mode/reject');
  await page.goto('/studio');
  await page.getByLabel('用户名', { exact: true }).fill('e2e-admin');
  await page.getByLabel('密码', { exact: true }).fill('E2e-Only!Fixture-2468');
  await page.getByRole('button', { name: '管理员登录', exact: true }).click();
  await expect(page.getByRole('button', { name: '插件管理', exact: true })).toBeVisible();
  const bytes = Buffer.from(await makeIPK());
  const response = await page.request.post('/api/studio/submit/upload', { headers: { Origin: baseURL! }, multipart: {
    name: '手动发布浏览器样例', description: '管理员人工决定', tutorial: '# 使用方法', file: { name: 'manual.ipk', mimeType: 'application/octet-stream', buffer: bytes },
  } });
  expect(response.status()).toBe(202);
  const { pluginId } = await response.json();
  await expect.poll(async () => (await (await page.request.get(`/api/studio/plugins/${pluginId}`)).json()).tasks[0].status).toBe('rejected');
  const before = await (await request.get('/__test/info')).json();
  await page.getByRole('button', { name: '插件管理', exact: true }).click();
  await page.getByLabel('搜索名称或描述').fill('手动发布浏览器样例');
  const row = page.locator('.sp__table tbody tr').filter({ hasText: '手动发布浏览器样例' });
  await expect(row).toHaveCount(1);
  await row.getByRole('button', { name: '手动上架', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: /手动上架当前版本/ });
  await expect(dialog).toContainText('跳过 AI 审核和查毒');
  await dialog.getByRole('button', { name: '确认手动上架', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect.poll(async () => (await request.get(`/api/plugins/${pluginId}`)).status()).toBe(200);
  const after = await (await request.get('/__test/info')).json();
  expect(after.aiCalls).toBe(before.aiCalls); expect(after.scanCalls).toBe(before.scanCalls);
  const file = await request.get(`/api/plugins/${pluginId}/download/1`);
  expect(file.status()).toBe(200); expect(await file.body()).toEqual(bytes);
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'docs/evidence/manual-publish-studio-375.png', fullPage: true });
  await page.goto(`/plugins/${pluginId}`);
  await page.getByRole('tab', { name: '审核信息' }).click();
  await expect(page.getByText('管理员手动上架，未经自动审核或查毒', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'docs/evidence/manual-publish-detail-375.png', fullPage: true });
  expect((await page.request.post(`/api/studio/plugins/${pluginId}/delete`, { headers: { Origin: baseURL! }, data: {} })).status()).toBe(200);
});
