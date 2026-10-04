// Actual-page UX verification against the isolated local Worker and real local APIs.
import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { seedPreview } from './preview-seed.mjs';

const phase = process.argv[2] || 'before';
if (!['before', 'after'].includes(phase)) throw new Error('Capture phase invalid');
const origin = 'http://127.0.0.1:8789';
const { cookies, ids } = await seedPreview(origin);
const directory = 'docs/evidence/ux';
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const failures = [], verified = [], screenshots = [];
try {
  const context = await browser.newContext();
  await context.addCookies(cookies.map(value => {
    const [name, ...parts] = value.split(';')[0].split('=');
    return { name, value: parts.join('='), url: origin, httpOnly: true, sameSite: 'Lax' };
  }));
  const page = await context.newPage();
  page.on('pageerror', error => failures.push(error.message));
  async function capture(label, width, theme = 'light') {
    const filename = `${phase}-${label}-${width}${theme === 'dark' ? '-dark' : ''}.png`;
    await page.screenshot({ path: `${directory}/${filename}`, fullPage: true });
    screenshots.push(filename);
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) failures.push(`${label} overflows at ${width} ${theme}`);
  }
  const routes = [['market', '/', '.pkg'], ['submit', '/submit', '.repo-form'], ['me', '/me', '.submission-row'], ['studio', '/studio', '.review-item'], ['detail', '/plugins/' + ids[0], '[data-testid="readme"]']];
  for (const width of phase === 'before' ? [375, 1280] : [375, 768, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const [label, route, target] of routes) {
      await page.goto(origin + route);
      await page.locator(target).first().waitFor();
      await capture(label, width);
      if (phase !== 'after') continue;
      if (label === 'market') {
        await page.keyboard.press('/');
        const search = page.getByLabel('搜索插件名称或描述');
        await expect(search).toBeFocused();
        await search.fill('找不到的本地样例');
        await expect(page.getByText('没有找到匹配的插件', { exact: true })).toBeVisible();
        await expect(search).toBeFocused();
        await page.locator('.search').getByRole('button', { name: '清空搜索', exact: true }).click();
        await expect(page.locator('.pkg')).toHaveCount(4);
        await expect(search).toBeFocused();
        await search.fill('DNS');
        await expect(page.locator('.pkg')).toHaveCount(1);
        await page.getByLabel('排序', { exact: true }).selectOption('favorites');
        await expect(page).toHaveURL(/sort=favorites/);
        await page.reload();
        await expect(search).toHaveValue('DNS');
        await expect(page.getByLabel('排序', { exact: true })).toHaveValue('favorites');
        verified.push(`Market search, empty result, clear, focus and URL persistence at ${width}`);
      }
      if (label === 'submit') {
        const tab = page.getByRole('tab', { name: 'GitHub 仓库', exact: true });
        await tab.focus();
        await page.keyboard.press('ArrowRight');
        await expect(page.getByRole('tab', { name: '直接上传 IPK', exact: true })).toHaveAttribute('aria-selected', 'true');
        const file = page.getByLabel('IPK 安装包', { exact: true });
        await expect(file).toBeDisabled();
        await page.getByLabel('插件名称', { exact: true }).fill('本地预览测试');
        await page.getByLabel('插件简介', { exact: true }).fill('检查表单状态');
        await page.getByLabel('使用教程', { exact: true }).fill('填写支持设备、安装和卸载步骤。');
        await expect(file).toBeEnabled();
        await tab.click();
        await page.getByRole('tab', { name: '直接上传 IPK', exact: true }).click();
        await expect(page.getByLabel('插件名称', { exact: true })).toHaveValue('本地预览测试');
        if ([375, 1280].includes(width)) await capture('submit-ipk', width);
        verified.push(`Upload prerequisites, keyboard tabs and preserved draft at ${width}`);
      }
      if (label === 'studio') {
        if (width > 1000) {
          const sidebar = await page.locator('.studio__sidebar').boundingBox();
          const main = await page.locator('.studio__main').boundingBox();
          assert(sidebar && main && sidebar.width < 260 && main.x >= sidebar.x + sidebar.width, 'Admin sidebar must remain beside workspace');
        }
        await page.getByRole('button', { name: '开始审核', exact: true }).first().click();
        const dialog = page.getByRole('dialog');
        await expect(dialog).toBeVisible();
        await expect(dialog.getByRole('button', { name: '通过并上架', exact: true })).toBeVisible();
        const box = await dialog.boundingBox();
        assert(box && box.y >= 0 && box.height <= 900 && box.width <= width, 'Review must fit viewport');
        if ([375, 1280].includes(width)) await capture('review-drawer', width);
        for (let i = 0; i < 16; i++) {
          await page.keyboard.press('Tab');
          assert(await dialog.evaluate(el => el.contains(document.activeElement)), 'Review focus escapes dialog');
        }
        await page.keyboard.press('Escape');
        await expect(dialog).not.toBeVisible();
        await expect(page.getByRole('button', { name: '开始审核', exact: true }).first()).toBeFocused();
        if (width <= 1000) await page.getByRole('button', { name: '切换 Studio 导航' }).click();
        await page.getByRole('button', { name: '插件管理', exact: true }).click();
        await page.locator('.sp__table tbody tr').first().waitFor();
        if ([375, 1280].includes(width)) await capture('plugin-management', width);
        if (width === 1280) {
          for (const [navigation, target, label] of [['总览', '.ov__tiles', 'overview'], ['整理任务', '.record', 'tasks'], ['操作日志', '.record', 'logs'], ['自动审核配置', '.ai__form', 'ai'], ['下载源', '.src', 'sources'], ['账号安全', '.sec', 'security']]) {
            await page.getByRole('button', { name: navigation, exact: true }).click();
            await page.locator(target).first().waitFor();
            await capture('studio-' + label, width);
          }
        }
        verified.push(`Admin navigation, sidebar, review viewport and focus restoration at ${width}`);
      }
    }
  }
  if (phase === 'after') {
    await page.evaluate(() => localStorage.setItem('theme-preference', 'dark'));
    for (const width of [375, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      for (const [label, route, target] of routes) {
        await page.goto(origin + route);
        await page.locator(target).first().waitFor();
        await capture(label, width, 'dark');
      }
    }
    verified.push('Light/dark theme page layouts at 375 and 1280');
    const anonymous = await browser.newContext();
    const auth = await anonymous.newPage();
    auth.on('pageerror', error => failures.push(error.message));
    for (const width of [375, 1280]) {
      await auth.setViewportSize({ width, height: 900 });
      for (const [label, route, target] of [['login', '/login', '.auth__form'], ['admin-login', '/studio', '.studio-login__form']]) {
        await auth.goto(origin + route);
        await auth.locator(target).waitFor();
        const filename = `${phase}-${label}-${width}.png`;
        await auth.screenshot({ path: `${directory}/${filename}`, fullPage: true });
        screenshots.push(filename);
        if (await auth.evaluate(() => document.documentElement.scrollWidth > innerWidth)) failures.push(`${label} overflows at ${width}`);
      }
    }
    // Render the same feature flag used in production without contacting shared auth or Youzan.
    await anonymous.addInitScript(() => sessionStorage.setItem('plugin-sso-checked', String(Date.now())));
    await auth.route('**/api/session', route => route.fulfill({ json: { user: null, admin: null, ssoEnabled: true, reviewMode: 'manual', reviewEnabled: false } }));
    for (const width of [375, 1280]) {
      await auth.setViewportSize({ width, height: 900 });
      await auth.goto(origin + '/login');
      await auth.getByRole('button', { name: '使用有赞账号登录', exact: true }).waitFor();
      const filename = `${phase}-login-sso-${width}.png`;
      await auth.screenshot({ path: `${directory}/${filename}`, fullPage: true });
      screenshots.push(filename);
    }
    verified.push('SSO login view with simulated server feature flag only; no external authorization');
    await anonymous.close();
    verified.push('Anonymous login and administrator login layouts at 375 and 1280');

  }
  assert.equal(failures.length, 0, failures.join('; '));
  const report = { phase, localFixtureOnly: true, screenshots, verified, pageErrors: failures };
  if (phase === 'after') await writeFile(`${directory}/verification.json`, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ phase, screenshots: screenshots.length, verified: verified.length, pageErrors: failures }));
} finally { await browser.close(); }
