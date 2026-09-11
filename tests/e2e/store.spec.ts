import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';

let pluginId = '';
const qa: { checks: Array<{ name: string; detail: string; passed: boolean }> } = { checks: [] };
const record = (name: string, detail: string) => qa.checks.push({ name, detail, passed: true });

test.describe.serial('真实浏览器 → Worker/D1/Queues → 隔离外部服务', () => {
  test('用户提交后后台自动上架、真实README、多IPK下载与收藏', async ({ page, request }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: '插件目录等待第一份发布' })).toBeVisible();
    await expect(page.locator('a[href="/studio"]')).toHaveCount(0);
    await expect(page.locator('h1')).toHaveCount(1);
    expect((await request.post('/api/submit', { headers: { Origin: 'http://127.0.0.1:8789' }, data: { url: 'https://github.com/fixture/harmless' } })).status()).toBe(401);

    await page.goto('/login?next=/submit');
    await page.getByLabel('张导小店绑定手机号').fill('13800138000');
    await page.getByRole('button', { name: '进入', exact: true }).click();
    await expect(page).toHaveURL(/\/submit$/);
    await page.getByLabel('GitHub 公开仓库链接').fill('https://github.com/fixture/harmless');
    await page.getByRole('button', { name: '提交审核', exact: true }).click();
    await expect(page.getByText('投稿已保存，自动审核将在后台进行')).toBeVisible();

    await page.goto('/me');
    await expect(page.getByRole('heading', { name: '我的提交' })).toBeVisible();

    await expect.poll(async () => {
      const data = await (await request.get('/api/plugins')).json();
      pluginId = data.items[0]?.id ?? '';
      return data.total;
    }, { timeout: 30000 }).toBe(1);

    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'harmless', exact: true })).toBeVisible();
    await expect(page.getByTestId('readme')).toHaveCount(0);
    await expect(page.locator('.pkg').first()).toBeVisible();

    const favorite = page.getByRole('button', { name: '收藏 fixture/harmless' });
    await favorite.click();
    await expect(page.getByRole('button', { name: '取消收藏 fixture/harmless' })).toHaveAttribute('aria-pressed', 'true');
    await page.reload();
    await expect(page.getByRole('button', { name: '取消收藏 fixture/harmless' })).toBeVisible();

    // 行内文字区可点：点击描述区域进入详情页
    const row = page.locator('.pkg').first();
    const box = (await row.boundingBox())!;
    await row.click({ position: { x: Math.min(160, box.width / 3), y: box.height / 2 } });
    await expect(page).toHaveURL(new RegExp(`/plugins/${pluginId}$`));
    await page.goto('/');

    await page.getByRole('button', { name: '下载 fixture/harmless' }).click();
    await expect(page).toHaveURL(new RegExp(`/plugins/${pluginId}#downloads`));

    const readme = page.getByTestId('readme');
    await expect(readme).toContainText('这是作者上传的原文');
    await expect(readme.locator('img')).toHaveAttribute('src', /raw\.githubusercontent\.com\/fixture\/harmless\/a{40}\/images\/icon\.png/);
    await expect(readme.locator('script,[onerror],[onclick]')).toHaveCount(0);
    expect(await page.evaluate(() => ('' + (window as unknown as { __readmeExecuted?: unknown }).__readmeExecuted))).toBe('undefined');
    await expect(readme.getByText('相对说明', { exact: true })).toHaveAttribute('href', /github\.com\/fixture\/harmless\/blob\/a{40}\/docs\/guide\.md/);
    await expect(readme.locator('a[href^="javascript:"],a[href^="http://127"]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: '下载此文件', exact: true })).toHaveCount(2);

    const info = await (await request.get('/__test/info')).json();
    for (const [assetId, name, sha] of [['2001', 'harmless_all.ipk', info.sha256], ['2002', 'harmless_arm_cortex-a7.ipk', info.sha256Second]]) {
      const wait = page.waitForEvent('download');
      await page.locator(`[data-asset-id="${assetId}"]`).click();
      const download = await wait;
      expect(download.suggestedFilename()).toBe(name);
      const file = await download.path();
      expect(createHash('sha256').update(await readFile(file!)).digest('hex')).toBe(sha);
    }

    const detail = await (await request.get(`/api/plugins/${pluginId}`)).json();
    expect(detail.plugin.download_count).toBe(2);
    expect(detail.plugin.favorite_count).toBe(1);
    expect(detail.sourceCommit).not.toBe(detail.readmeCommit);
    expect(typeof detail.reviewedAt).toBe('number');
    expect(detail.reviewPublicReason).toBeTruthy();
    expect(JSON.stringify(detail)).not.toContain('internal_reason');
    expect(info.aiCalls).toBe(1);
    expect((await request.get('/api/studio/tasks')).status()).toBe(401);

    await page.goto('/me');
    await expect(page.getByRole('heading', { name: '我的提交' })).toBeVisible();
    await expect(page.locator('.submission-row')).toContainText('已上架');
    await page.getByRole('tab', { name: /我的收藏/ }).click();
    await expect(page.getByRole('heading', { name: '我的收藏' })).toBeVisible();
    await expect(page.locator('body')).not.toContainText('13800138000');
    record('公开闭环', '投稿 → 自动上架 → 收藏 → 多架构下载 → 个人中心状态一致');
  });

  test('Studio 真实登录、配置测试、插件操作与显式恢复', async ({ page, request }) => {
    await page.goto('/studio');
    await page.getByLabel('用户名', { exact: true }).fill('e2e-admin');
    await page.getByLabel('密码', { exact: true }).fill('E2e-Only!Fixture-2468');
    await page.getByRole('button', { name: '管理员登录', exact: true }).click();
    await expect(page.getByRole('button', { name: '退出管理员', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: '总览', exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'AI 设置', exact: true }).click();
    await expect(page.getByLabel('Base URL', { exact: true })).toHaveValue('https://ai.vendor.com/v1');
    await expect(page.getByLabel('API Key', { exact: true })).toHaveValue('');
    await page.getByRole('button', { name: '测试已保存配置', exact: true }).click();
    await expect(page.getByText(/连接成功/)).toBeVisible();

    await page.getByRole('button', { name: '下载源', exact: true }).click();
    await expect(page.getByText('GitHub 官方', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '测试已保存源', exact: true })).toBeVisible();

    await page.getByRole('button', { name: '账号安全', exact: true }).click();
    await expect(page.getByRole('link', { name: '前往留言箱修改密码' })).toHaveAttribute('href', 'https://msg.zdwifi.com/studio');
    await expect(page.locator('input[type=password]')).toHaveCount(0);

    await page.getByRole('button', { name: '插件管理', exact: true }).click();
    await page.getByLabel('操作原因（对用户可见）').fill('端到端隔离测试下架');
    await page.getByRole('button', { name: /的更多操作$/ }).first().click();
    await page.getByRole('menuitem', { name: '下架' }).click();
    await page.getByRole('button', { name: '确认下架', exact: true }).click();
    await expect(page.getByText('禁止自动恢复', { exact: true })).toBeVisible();
    expect((await request.get(`/api/plugins/${pluginId}`)).status()).toBe(404);
    expect((await request.get(`/api/plugins/${pluginId}/download/2001`)).status()).toBe(404);

    await page.getByRole('button', { name: /的更多操作$/ }).first().click();
    await page.getByRole('menuitem', { name: '显式恢复' }).click();
    await page.getByRole('button', { name: '恢复并重新审核', exact: true }).click();
    await expect.poll(async () => (await request.get(`/api/plugins/${pluginId}`)).status(), { timeout: 30000 }).toBe(200);

    await page.getByRole('button', { name: '操作日志', exact: true }).click();
    await expect(page.locator('body')).toContainText('显式恢复');
    await page.getByRole('button', { name: '退出管理员', exact: true }).click();
    expect((await page.request.get('/api/studio/tasks')).status()).toBe(401);
    record('Studio 权限与操作', '登录、配置测试、下架阻断下载、显式恢复重新审核、审计日志、退出失效');
  });

  test('设计系统、主题与键盘可用性', async ({ page }) => {
    // 深色为基准主题，与线上留言板一致；应用默认跟随系统偏好
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/');
    await expect(page.locator('header.top')).toBeVisible();
    await expect(page.locator('main#main')).toBeVisible();
    await expect(page.locator('footer.foot')).toBeVisible();

    const design = await page.evaluate(() => {
      const root = getComputedStyle(document.documentElement);
      const body = getComputedStyle(document.body);
      const field = document.querySelector('.search');
      const button = document.querySelector('.btn--signal');
      const icon = document.querySelector('.top__end .btn--icon');
      return {
        signal: root.getPropertyValue('--signal').trim(),
        radius: root.getPropertyValue('--r-group').trim(),
        controlRadius: root.getPropertyValue('--r-control').trim(),
        font: body.fontFamily,
        bodySize: body.fontSize,
        fieldRadius: field ? getComputedStyle(field).borderRadius : '',
        buttonHeight: button ? Math.round(button.getBoundingClientRect().height) : 0,
        iconButtonSize: icon ? Math.round(icon.getBoundingClientRect().height) : 0,
        headerHeight: Math.round(document.querySelector('header.top')!.getBoundingClientRect().height),
      };
    });
    expect(design.signal).toBe('#5cdeff');           // 与线上 message.fallaxaura.com 的 --color-accent 一致
    expect(design.radius).toBe('16px');
    expect(design.controlRadius).toBe('12px');
    expect(design.bodySize).toBe('16px');
    expect(design.font).toContain('HarmonyOS Sans SC');
    expect(design.fieldRadius).toBe('12px');
    expect(design.buttonHeight).toBeGreaterThanOrEqual(44);
    expect(design.iconButtonSize).toBeGreaterThanOrEqual(44);
    expect(design.headerHeight).toBeGreaterThanOrEqual(56);

    // 搜索快捷键
    await page.locator('body').click({ position: { x: 4, y: 4 } });
    await page.keyboard.press('/');
    await expect(page.locator('#plugin-search')).toBeFocused();
    await page.keyboard.type('harmless');
    await expect.poll(() => new URL(page.url()).searchParams.get('q')).toBe('harmless');
    await expect(page.getByText(/匹配「harmless」/)).toBeVisible();
    await page.keyboard.press('Escape');

    // 键盘焦点可见：聚焦元素自身或它的直接容器必须出现 outline 或主色焦点环
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(250);
    await page.keyboard.press('Tab');
    await page.waitForTimeout(320); // 等焦点环过渡结束再读取计算样式
    const focus = await page.evaluate(() => {
      const chain: Array<{ tag: string; outlineStyle: string; outlineWidth: string; shadow: string }> = [];
      let node = document.activeElement as HTMLElement | null;
      for (let depth = 0; node && depth < 4; depth += 1, node = node.parentElement) {
        const style = getComputedStyle(node);
        chain.push({
          tag: node.tagName + (typeof node.className === 'string' && node.className ? `.${node.className.split(' ')[0]}` : ''),
          outlineStyle: style.outlineStyle,
          outlineWidth: style.outlineWidth,
          shadow: style.boxShadow,
        });
      }
      return chain;
    });
    const ring = focus.find(item =>
      (item.outlineStyle !== 'none' && Number.parseFloat(item.outlineWidth) > 0)
      || /rgba?\(114, 236, 255|rgba?\(14, 116, 144/.test(item.shadow));
    expect(ring, `聚焦元素缺少可见焦点指示：${JSON.stringify(focus)}`).toBeTruthy();
    record('焦点可见', `${ring!.tag} 焦点指示：outline ${ring!.outlineWidth} ${ring!.outlineStyle}，box-shadow ${ring!.shadow}`);

    // 主题切换、持久化与浅色派生
    const readTokens = () => page.evaluate(() => {
      const styles = getComputedStyle(document.documentElement);
      return {
        bg: styles.getPropertyValue('--bg').trim(),
        text: styles.getPropertyValue('--text').trim(),
        signal: styles.getPropertyValue('--signal').trim(),
      };
    });
    expect((await readTokens()).bg).toBe('#07101b'); // 与线上留言板 --color-bg 一致

    await page.getByRole('button', { name: '切换到浅色主题' }).click();
    await expect(page.locator('html')).not.toHaveClass(/dark/);
    const light = await readTokens();
    expect(light.signal).toBe('#0e7490');
    expect(light.bg).toBe('#f4f7fa');

    await page.getByRole('button', { name: '切换到深色主题' }).click();
    await expect(page.locator('html')).toHaveClass(/dark/);
    await page.reload();
    await expect(page.locator('html')).toHaveClass(/dark/);
    expect((await readTokens()).bg).toBe('#07101b');
    record('设计系统', `令牌生效：信号青 ${design.signal}、圆角 ${design.radius}、控件圆角 ${design.controlRadius}、正文 ${design.bodySize}、头部 ${design.headerHeight}px`);
    record('主题', '深色为基准（#07101b / #5cdeff），浅色派生 #f4f7fa / #0e7490，切换持久化通过');
    record('键盘可用性', '/ 聚焦搜索、Tab 焦点环可见');
  });

  test('搜索框布局、持续输入与错误计数不误导', async ({ page }) => {
    for (const width of [375, 768, 1280]) {
      await page.setViewportSize({ width, height: 812 });
      await page.goto('/');
      const search = page.getByRole('searchbox');
      await expect(search).toBeVisible();
      const geometry = await page.locator('.search').evaluate(el => {
        const input = el.querySelector('input')!.getBoundingClientRect();
        const icon = el.querySelector('.search__icon')!.getBoundingClientRect();
        const shortcut = el.querySelector('.search__kbd') as HTMLElement;
        const right = shortcut && getComputedStyle(shortcut).display !== 'none' ? shortcut.getBoundingClientRect().left : el.getBoundingClientRect().right;
        return { gap: input.left - icon.right, inputRight: input.right, right, width: input.width };
      });
      expect(geometry.gap).toBeGreaterThanOrEqual(8);
      expect(geometry.gap).toBeLessThanOrEqual(16);
      expect(geometry.inputRight).toBeLessThanOrEqual(geometry.right);
      expect(geometry.width).toBeGreaterThan(230);
      await search.fill('har');
      await expect.poll(() => new URL(page.url()).searchParams.get('q')).toBe('har');
      await expect(search).toBeFocused();
      await search.pressSequentially('mless');
      await expect.poll(() => new URL(page.url()).searchParams.get('q')).toBe('harmless');
      await page.getByRole('button', { name: '清空搜索', exact: true }).click();
      await expect(search).toHaveValue('');
      await expect(search).toBeFocused();
      await page.selectOption('#market-sort', 'favorites');
      await expect(page.locator('.page-head__meta')).toContainText('按收藏最多排序');
    }
    await page.route('**/api/plugins?*', route => route.fulfill({ status: 503, json: { error: '隔离测试：服务暂不可用', code: 'configuration' } }));
    await page.goto('/');
    await expect(page.getByRole('heading', { name: '加载失败' })).toBeVisible();
    await expect(page.locator('.page-head__meta')).not.toContainText('共 0');
    await page.unroute('**/api/plugins?*');
    await page.getByRole('button', { name: '重新加载', exact: true }).click();
    await expect(page.locator('.pkg')).toHaveCount(1);
    await page.goto('/login');
    await expect(page.locator('#phone-note')).toHaveCount(0);
    record('搜索与错误状态', '375/768/1280 图标、输入区与快捷键无重叠；筛选后焦点保持；排序文案同步；错误不显示虚假零计数；指定说明框已删除');
  });

  test('后台菜单不被表格裁切、原生弹窗焦点与详情标签页', async ({ page }) => {
    await page.goto('/studio');
    await page.getByLabel('用户名', { exact: true }).fill('e2e-admin');
    await page.getByLabel('密码', { exact: true }).fill('E2e-Only!Fixture-2468');
    await page.getByRole('button', { name: '管理员登录', exact: true }).click();
    await page.getByRole('button', { name: '插件管理', exact: true }).click();
    const more = page.getByRole('button', { name: /的更多操作$/ }).first();
    await more.focus();
    await more.press('ArrowDown');
    const menu = page.getByRole('menu', { name: /的更多操作$/ });
    await expect(menu).toBeVisible();
    await expect(page.getByRole('menuitem', { name: '重新审核', exact: true })).toBeFocused();
    await expect(menu).toHaveJSProperty('popover', 'auto');
    const box = (await menu.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(page.viewportSize()!.height);
    await page.keyboard.press('Escape');
    await expect(more).toBeFocused();
    await page.getByRole('button', { name: '详情', exact: true }).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveJSProperty('open', true);
    for (let i = 0; i < 16; i++) {
      await page.keyboard.press('Tab');
      expect(await dialog.evaluate(el => el.contains(document.activeElement))).toBe(true);
    }
    await page.setViewportSize({ width: 375, height: 812 });
    const mobile = (await dialog.boundingBox())!;
    expect(mobile.x).toBeGreaterThanOrEqual(0);
    expect(mobile.width).toBeLessThanOrEqual(375);
    expect(mobile.height).toBeLessThanOrEqual(812);
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    await expect(page.getByRole('button', { name: '详情', exact: true }).first()).toBeFocused();
    await page.goto(`/plugins/${pluginId}`);
    const tabs = page.getByRole('tab');
    await tabs.first().focus();
    await page.keyboard.press('ArrowRight');
    await expect(tabs.nth(1)).toBeFocused();
    await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
    const selected = await tabs.nth(1).getAttribute('aria-controls');
    await expect(page.locator(`#${selected}`)).toBeVisible();
    record('弹窗与键盘', '后台菜单进入浏览器顶层且不出视口；弹窗循环焦点/Esc/焦点恢复通过；移动抽屉无溢出；详情支持方向键标签页');
  });

  test('手机、平板与桌面真实页面无水平溢出并留截图', async ({ page }) => {
    await mkdir('docs/evidence', { recursive: true });
    const routes: Array<[string, string]> = [
      ['/', 'market'],
      [`/plugins/${pluginId}`, 'detail'],
      ['/login', 'login'],
      ['/submit', 'submit'],
      ['/me', 'me'],
      ['/studio', 'studio'],
    ];
    for (const [width, height] of [[375, 812], [768, 1024], [1280, 800], [1440, 900]]) {
      await page.setViewportSize({ width, height });
      for (const [route, label] of routes) {
        await page.goto(route);
        await page.waitForLoadState('networkidle');
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${label} ${width}`).toBe(true);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `${label} ${width} 二次确认`).toBe(true);
      }
    }

    // 代表视图截图（浅色与深色）
    for (const [width, height] of [[375, 812], [768, 1024], [1280, 800]]) {
      await page.setViewportSize({ width, height });
      for (const [route, label] of [['/', 'market'], [`/plugins/${pluginId}`, 'detail'], ['/login', 'login'], ['/studio', 'studio-login']]) {
        await page.goto(route);
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(250);
      await expect(page.locator('main [aria-busy="true"]')).toHaveCount(0);
      await page.screenshot({ path: `docs/evidence/e2e-${label}-${width}.png`, fullPage: true });
      }
    }
    await page.setViewportSize({ width: 1280, height: 900 });
    for (const [route, label] of [['/', 'market'], ['/submit', 'submit'], ['/me', 'me']]) {
      await page.goto(route);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(250);
      await expect(page.locator('main [aria-busy="true"]')).toHaveCount(0);
      await page.screenshot({ path: `docs/evidence/ui-${label}-1280.png`, fullPage: true });
    }
    await page.goto('/');
    await page.getByRole('button', { name: '切换到深色主题' }).click();
    for (const [route, label] of [['/', 'market'], [`/plugins/${pluginId}`, 'detail']]) {
      await page.goto(route);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(250);
      await expect(page.locator('main [aria-busy="true"]')).toHaveCount(0);
      await page.screenshot({ path: `docs/evidence/ui-${label}-dark-1280.png`, fullPage: true });
    }
    await page.goto('/studio');
    await page.getByLabel('用户名', { exact: true }).fill('e2e-admin');
    await page.getByLabel('密码', { exact: true }).fill('E2e-Only!Fixture-2468');
    await page.getByRole('button', { name: '管理员登录', exact: true }).click();
    await expect(page.getByRole('button', { name: '退出管理员', exact: true })).toBeVisible();
    for (const close of await page.getByRole('button', { name: '关闭提示', exact: true }).all()) await close.click();
    for (const [panel, label] of [['总览', 'studio-overview'], ['插件管理', 'studio-plugins'], ['审核任务', 'studio-tasks'], ['操作日志', 'studio-logs'], ['AI 设置', 'studio-ai'], ['下载源', 'studio-sources'], ['账号安全', 'studio-security']]) {
      await page.getByRole('button', { name: panel, exact: true }).click();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(250);
      await expect(page.locator('main [aria-busy="true"]')).toHaveCount(0);
      await page.screenshot({ path: `docs/evidence/ui-${label}-1280.png`, fullPage: true });
    }
    await page.setViewportSize({ width: 375, height: 812 });
    for (const [panel, label] of [['总览', 'studio-overview'], ['插件管理', 'studio-plugins'], ['审核任务', 'studio-tasks'], ['操作日志', 'studio-logs'], ['AI 设置', 'studio-ai'], ['下载源', 'studio-sources'], ['账号安全', 'studio-security']]) {
      await page.getByRole('button', { name: '切换 Studio 导航' }).click();
      await page.getByRole('button', { name: panel, exact: true }).click();
      await page.waitForLoadState('networkidle');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `studio ${label} 375`).toBe(true);
      await page.waitForTimeout(250);
      await expect(page.locator('main [aria-busy="true"]')).toHaveCount(0);
      await page.screenshot({ path: `docs/evidence/ui-${label}-375.png`, fullPage: true });
    }
    record('响应式', '4 种宽度 × 6 条路由无水平溢出；Studio 七个面板均有桌面和手机截图');
  });

  test.afterAll(async () => {
    await mkdir('docs/evidence', { recursive: true });
    await writeFile('docs/evidence/frontend-qa.json', JSON.stringify({ ranAt: new Date().toISOString(), checks: qa.checks }, null, 2) + '\n');
  });
});
