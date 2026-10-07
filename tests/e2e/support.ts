import { expect, type Page } from '@playwright/test';
let clientNumber = 1;
export async function loginAdmin(page: Page) {
  const session = await (await page.request.get('/api/session')).json();
  await page.goto('/studio');
  if (!session.admin) {
    // Isolated browser clients must not share the fixture server's loopback IP limit.
    await page.context().setExtraHTTPHeaders({ 'CF-Connecting-IP': `198.51.100.${clientNumber++}` });
    await page.getByLabel('留言箱管理员账号', { exact: true }).fill('e2e-admin');
    await page.getByLabel('密码', { exact: true }).fill('E2e-Only!Fixture-2468');
    await page.getByRole('button',{name:'管理员登录',exact:true}).click();
  }
  await expect(page.getByRole('heading',{name:'审核收件箱',exact:true})).toBeVisible();
}
export async function approve(page: Page, id: string) {
  await loginAdmin(page);
  await expect.poll(async()=> (await (await page.request.get('/api/studio/plugins/'+id)).json()).candidate?.decision).toBe('pending');
  const detail=await (await page.request.get('/api/studio/plugins/'+id)).json();
  const result=await page.request.post('/api/studio/plugins/'+id+'/review',{headers:{Origin:'http://127.0.0.1:8789'},data:{revision:detail.candidate.revision,decision:'approve'}});
  expect(result.status()).toBe(200);
}
export async function logoutAdmin(page: Page) {
  await page.request.post('/api/studio/logout',{headers:{Origin:'http://127.0.0.1:8789'},data:{}});
}
