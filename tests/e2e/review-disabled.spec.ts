import { expect, test } from '@playwright/test';
import { makeIPK } from '../adapters/fixtures';

test('暂停审核时提交直接上架，前台如实提示且不调用外部审核', async ({ page, request }) => {
  test.skip(process.env.TEST_REVIEW_ENABLED !== 'false', '使用 TEST_REVIEW_ENABLED=false 的隔离服务器验证');
  await page.goto('/login?next=/submit');
  await page.getByLabel('张导小店绑定手机号').fill('13700137000');
  await page.getByRole('button', { name: '进入', exact: true }).click();
  await page.getByRole('tab', { name: '直接上传 IPK', exact: true }).click();
  await expect(page.getByText('审核暂时关闭，安装包整理完成后直接上架；未经过自动审核或查毒。')).toBeVisible();
  await page.getByLabel('插件名称', { exact: true }).fill('免审上架浏览器样例');
  await page.getByLabel('插件简介', { exact: true }).fill('暂不启用审核');
  await page.getByLabel('使用教程', { exact: true }).fill('# 使用方法');
  const bytes = Buffer.from(await makeIPK());
  await page.getByLabel('IPK 安装包', { exact: true }).setInputFiles({ name: 'no-review.ipk', mimeType: 'application/octet-stream', buffer: bytes });
  await page.getByRole('button', { name: '上传并上架', exact: true }).click();
  let id = '';
  await expect.poll(async () => {
    const data = await (await request.get('/api/plugins?q=' + encodeURIComponent('免审上架浏览器样例'))).json();
    id = data.items[0]?.id ?? ''; return data.total;
  }).toBe(1);
  const info = await (await request.get('/__test/info')).json();
  expect(info.aiCalls).toBe(0); expect(info.scanCalls).toBe(0);
  await page.goto(`/plugins/${id}`);
  await page.getByRole('tab', { name: '审核信息' }).click();
  await expect(page.getByText('审核暂时关闭，此版本未经自动审核或查毒', { exact: true }).first()).toBeVisible();
  const download = await request.get(`/api/plugins/${id}/download/1`);
  expect(download.status()).toBe(200); expect(await download.body()).toEqual(bytes);
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
