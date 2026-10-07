import { expect, test } from '@playwright/test';
import { makeIPK } from '../adapters/fixtures';

test('关闭自动引擎仍须人工审核，作者能看到等待状态且不会被引向不存在的详情',async({page})=>{
  await page.goto('/login?next=/submit');
  await page.getByLabel('张导小店绑定手机号').fill('13700137000');
  await page.getByRole('button',{name:'进入',exact:true}).click();
  await page.getByRole('tab',{name:'直接上传 IPK',exact:true}).click();
  await expect(page.getByRole('tab',{name:'直接上传 IPK',exact:true})).toHaveAttribute('aria-selected','true');
  await expect(page.getByLabel('IPK 安装包',{exact:true})).toBeDisabled();
  await page.getByLabel('插件名称',{exact:true}).fill('作者待审作品');
  await page.getByLabel('插件简介',{exact:true}).fill('等待人工审核的作者投稿');
  await page.getByLabel('使用教程',{exact:true}).fill('# 使用教程\n安装后启用，卸载后移除配置。');
  await page.getByLabel('IPK 安装包',{exact:true}).setInputFiles({name:'author.ipk',mimeType:'application/octet-stream',buffer:Buffer.from(await makeIPK())});
  await page.getByRole('tab',{name:'GitHub 仓库',exact:true}).click();
  await page.getByRole('tab',{name:'直接上传 IPK',exact:true}).click();
  await expect(page.getByLabel('插件名称',{exact:true})).toHaveValue('作者待审作品');
  await page.getByRole('button',{name:'提交审核',exact:true}).click();
  await expect(page.getByRole('status').filter({hasText:'交由管理员人工审核'})).toBeVisible();
  await page.goto('/me');
  await page.getByRole('button',{name:'等待审核',exact:true}).click();
  const row=page.locator('.submission-row').filter({hasText:'作者待审作品'});
  await expect(row).toContainText('待人工审核');
  await expect(row.locator('a[href^="/plugins/"]')).toHaveCount(0);
  const state=await (await page.request.get('/api/session')).json(); expect(state.reviewMode).toBe('manual'); expect(state.reviewEnabled).toBe(false);
});
