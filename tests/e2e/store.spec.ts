import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { makeIPK } from '../adapters/fixtures';
import { approve, loginAdmin, logoutAdmin } from './support';

test.describe.serial('人工审核后的市场、收藏、下载与版本更新',()=>{
  let pluginId='';
  test('GitHub 投稿需管理员批准，README 安全渲染，多架构文件可下载和收藏',async({page,request})=>{
    await page.goto('/login?next=/submit'); await page.getByLabel('张导小店绑定手机号').fill('13800138000'); await page.getByRole('button',{name:'进入',exact:true}).click();
    await page.getByRole('tab',{name:'GitHub 仓库',exact:true}).click(); await page.getByLabel('GitHub 公开仓库链接').fill('https://github.com/fixture/harmless');
    await page.getByRole('button',{name:'提交人工审核',exact:true}).click();
    await expect(page.getByText('投稿已保存，资料整理后交由管理员人工审核',{exact:true})).toBeVisible();
    await expect.poll(async()=>{ const data=await (await page.request.get('/api/me')).json(); pluginId=data.submissions.find((p:{full_name:string})=>p.full_name==='fixture/harmless')?.id||''; return pluginId; }).not.toBe('');
    expect((await request.get(`/api/plugins/${pluginId}`)).status()).toBe(404);
    await approve(page,pluginId); await logoutAdmin(page);
    await page.goto('/'); const row=page.locator('.pkg').filter({hasText:'harmless'}).first(); await expect(row).toContainText('作者 fixture');
    await row.getByRole('button',{name:'收藏 fixture/harmless'}).click(); await page.reload(); await expect(page.getByRole('button',{name:'取消收藏 fixture/harmless'})).toBeVisible();
    await row.getByRole('button',{name:'下载 fixture/harmless'}).click();
    const readme=page.getByTestId('readme'); await expect(readme).toContainText('这是作者上传的原文');
    await expect(readme.locator('script,[onerror],a[href^="javascript:"],a[href^="http://127"]')).toHaveCount(0);
    await expect(page.getByRole('button',{name:'下载此文件',exact:true})).toHaveCount(2);
    for(const assetId of [2001,2002]) { const wait=page.waitForEvent('download'); await page.locator(`[data-asset-id="${assetId}"]`).click(); const download=await wait; expect((await readFile((await download.path())!)).length).toBeGreaterThan(0); }
    await page.goto('/me'); await page.getByRole('tab',{name:/我的收藏/}).click(); await expect(page.locator('.pkg')).toContainText('harmless');
    expect((await request.get('/api/studio/tasks')).status()).toBe(401);
  });
  test('后台下架和恢复都有效，恢复后仍须人工审核',async({page,request})=>{
    await loginAdmin(page); await page.getByRole('button',{name:'插件管理',exact:true}).click();
    await page.getByLabel('搜索名称或描述').fill('fixture/harmless'); await expect(page.locator('.sp__table tbody tr')).toHaveCount(1);
    await page.getByRole('button',{name:/的更多操作$/}).click(); await page.getByRole('menuitem',{name:'下架',exact:true}).click(); await page.getByRole('dialog').getByLabel('操作原因（对用户可见）').fill('浏览器测试下架'); await page.getByRole('button',{name:'确认下架',exact:true}).click();
    await expect.poll(async()=>(await request.get(`/api/plugins/${pluginId}`)).status()).toBe(404);
    await page.getByRole('button',{name:/的更多操作$/}).click(); await page.getByRole('menuitem',{name:'显式恢复',exact:true}).click(); await page.getByRole('button',{name:'恢复并提交审核',exact:true}).click();
    await expect.poll(async()=>(await (await page.request.get(`/api/studio/plugins/${pluginId}`)).json()).candidate?.decision).toBe('pending');
    expect((await request.get(`/api/plugins/${pluginId}`)).status()).toBe(404); await approve(page,pluginId);
    expect((await request.get(`/api/plugins/${pluginId}`)).status()).toBe(200);
  });
  test('直传更新保留旧版，退回反馈对作者可见，批准新版后替换',async({page,request})=>{
    await page.goto('/login?next=/submit'); await page.getByLabel('张导小店绑定手机号').fill('13600136000'); await page.getByRole('button',{name:'进入',exact:true}).click();
    await expect(page).toHaveURL(/\/submit$/);
    const bytes=Buffer.from(await makeIPK());
    const first=await page.request.post('/api/submit/upload',{headers:{Origin:'http://127.0.0.1:8789'},multipart:{name:'版本更新作品',description:'验证版本审核',tutorial:'# 第一版教程',file:{name:'versioned.ipk',mimeType:'application/octet-stream',buffer:bytes}}}); expect(first.status()).toBe(202); const {pluginId:id}=await first.json();
    await approve(page,id); await logoutAdmin(page); await page.goto('/me'); const own=page.locator('.submission-row').filter({hasText:'版本更新作品'}); await own.getByRole('button',{name:'上传新版本',exact:true}).click();
    const dialog=page.getByRole('dialog',{name:'上传新版本',exact:true}); await dialog.getByLabel('使用教程',{exact:true}).fill('# 第二版教程'); await dialog.getByLabel('IPK 安装包',{exact:true}).setInputFiles({name:'versioned.ipk',mimeType:'application/octet-stream',buffer:bytes}); await dialog.getByRole('button',{name:'上传并提交人工审核',exact:true}).click(); await expect(dialog).not.toBeVisible();
    await expect(own).toContainText('旧版本仍已上架'); expect((await (await request.get(`/api/plugins/${id}`)).json()).readme).toBe('# 第一版教程');
    await loginAdmin(page);
    await expect.poll(async()=> (await (await page.request.get(`/api/studio/plugins/${id}`)).json()).candidate?.decision).toBe('pending');
    const candidate=(await (await page.request.get(`/api/studio/plugins/${id}`)).json()).candidate;
    const rejection=await page.request.post(`/api/studio/plugins/${id}/review`,{headers:{Origin:'http://127.0.0.1:8789'},data:{revision:candidate.revision,decision:'reject',reason:'请补充设备支持说明'}});
    expect(rejection.status()).toBe(200); await logoutAdmin(page); await page.goto('/me');
    await expect(own).toContainText('请补充设备支持说明'); await expect(own).toContainText('已退回');
    expect((await (await request.get(`/api/plugins/${id}`)).json()).readme).toBe('# 第一版教程');
    await own.getByRole('button',{name:'上传新版本',exact:true}).click();
    await dialog.getByLabel('使用教程',{exact:true}).fill('# 第三版教程\n支持测试设备。');
    await dialog.getByLabel('IPK 安装包',{exact:true}).setInputFiles({name:'versioned.ipk',mimeType:'application/octet-stream',buffer:bytes});
    await dialog.getByRole('button',{name:'上传并提交人工审核',exact:true}).click(); await expect(dialog).not.toBeVisible();
    await approve(page,id); expect((await (await request.get(`/api/plugins/${id}`)).json()).readme.replace(/\r\n/g,'\n')).toBe('# 第三版教程\n支持测试设备。');
  });
  test('插件管理可打开对应待审版本的人工审核',async({page,request})=>{
    await loginAdmin(page);
    const response=await page.request.post('/api/studio/submit/upload',{headers:{Origin:'http://127.0.0.1:8789'},multipart:{name:'管理入口待审作品',description:'验证管理列表到人工审核的入口',tutorial:'# 使用说明',file:{name:'entry.ipk',mimeType:'application/octet-stream',buffer:Buffer.from(await makeIPK())}}});
    expect(response.status()).toBe(202); const {pluginId:id}=await response.json();
    await expect.poll(async()=> (await (await page.request.get(`/api/studio/plugins/${id}`)).json()).candidate?.decision).toBe('pending');
    await page.getByRole('button',{name:'插件管理',exact:true}).click();
    await page.getByLabel('搜索名称或描述').fill('管理入口待审作品');
    await expect(page.locator('.sp__table tbody tr')).toHaveCount(1);
    await page.locator('.sp__table tbody tr').filter({hasText:'管理入口待审作品'}).getByRole('button',{name:'查看审核',exact:true}).click();
    const drawer=page.getByRole('dialog',{name:'管理入口待审作品',exact:true});
    await expect(drawer.getByRole('button',{name:'通过并上架',exact:true})).toBeVisible();
    await expect(drawer.getByRole('button',{name:'退回修改',exact:true})).toBeVisible();
    expect((await request.get(`/api/plugins/${id}`)).status()).toBe(404);
  });
});
