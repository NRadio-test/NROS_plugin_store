// Local, ephemeral preview only. Uses the test server's accounts and real submission/review APIs.
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

export async function seedPreview(origin = 'http://127.0.0.1:8789') {
  if (origin !== 'http://127.0.0.1:8789') throw new Error('Preview requires the isolated loopback server');
  const source = await readFile(new URL('./e2e-server.mjs', import.meta.url), 'utf8');
  const password = source.match(/password='([^']+)'/)?.[1];
  if (!password) throw new Error('Test account not available');
  const { makeIPK } = await import(pathToFileURL(path.resolve('.wrangler/e2e/fixtures.mjs')).href);
  const headers = { Origin: origin, 'CF-Connecting-IP': '198.51.100.240' };
  const admin = await fetch(origin + '/api/studio/login', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'e2e-admin', password }) });
  if (!admin.ok) throw new Error('Preview login failed');
  const adminCookie = admin.headers.getSetCookie()[0];
  let userCookie;
  const state = await (await fetch(origin + '/api/session')).json();
  if (state.ssoEnabled) {
    const start = await fetch(origin + '/api/login', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ next: '/me' }) });
    const { authorizationUrl } = await start.json();
    const authorize = await fetch(authorizationUrl, { redirect: 'manual' });
    const finish = await fetch(authorize.headers.get('Location'), { redirect: 'manual', headers: { Cookie: start.headers.getSetCookie()[0].split(';')[0] } });
    if (finish.headers.get('Location')?.includes('login_error')) throw new Error('Preview SSO callback rejected');
    userCookie = finish.headers.getSetCookie().find(cookie => cookie.startsWith('plugin_store_user=') && !cookie.startsWith('plugin_store_user=;'));
  } else {
    const user = await fetch(origin + '/api/login', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: '13900139000' }) });
    if (!user.ok) throw new Error('Preview author unavailable');
    userCookie = user.headers.getSetCookie()[0];
  }
  if (!userCookie) throw new Error('Preview author unavailable');
  const cookie = adminCookie.split(';')[0] + '; ' + userCookie.split(';')[0];
  const names = [
    ['路由器状态面板', '集中查看设备温度、内存占用和运行时间。', '1.4.2'],
    ['网络诊断工具', '在管理界面执行连通性检查，定位常见网络问题。', '2.1.0'],
    ['DNS 缓存管理', '查看并清理本机 DNS 缓存记录。', '1.0.3'],
    ['定时任务助手', '管理计划任务，查看最近执行记录。', '0.9.6'],
    ['设备信息导出', '导出设备基本信息和网络配置，便于排查问题。', '1.2.0'],
    ['访客网络开关', '通过管理界面启用或停用访客无线网络。', '1.0.0'],
    ['日志查看器', '按模块查看设备日志，支持关键词过滤。', '0.8.1'],
  ];
  const ids = [];
  for (const [index, [name, description, version]] of names.entries()) {
    const existing = await (await fetch(origin + '/api/studio/plugins?q=' + encodeURIComponent(name), { headers: { Cookie: cookie } })).json();
    const found = existing.items?.find(item => item.full_name === name);
    if (found) { ids.push(found.id); continue; }
    const releases = index === 0 ? ['1.2.0', '1.3.1', version] : [version];
    let pluginId;
    for (const release of releases) {
    const packageName = index === 0 ? 'luci-app-nradio-router-status-panel' : `preview-tool-${index}`;
    const architecture = index === 0 ? 'aarch64_cortex-a53' : 'all';
    const bytes = await makeIPK({ controlFiles: [{ name: './control', text: `Package: ${packageName}\nVersion: ${release}\nArchitecture: ${architecture}\nDescription: Isolated preview fixture\n` }] });
    const form = new FormData();
    form.set('name', name); form.set('description', description);
    form.set('tutorial', `# ${name}\n\n本地预览示例，安装包仅用于测试。\n\n## 支持环境\n\n适用于支持 IPK 安装包的测试设备。安装前请备份配置。\n\n## 安装与使用\n\n1. 下载对应安装包。\n2. 在设备管理界面上传并安装。\n3. 在服务菜单中打开插件。\n\n## 卸载\n\n在已安装软件列表中移除对应软件包。`);
    form.set('file', new File([bytes], `${packageName}_${release}_${architecture}.ipk`));
    const endpoint = pluginId ? `/api/studio/plugins/${pluginId}/upload` : index < 5 ? '/api/submit/upload' : '/api/studio/submit/upload';
    const response = await fetch(origin + endpoint, { method: 'POST', headers: { ...headers, Cookie: cookie }, body: form });
    if (response.status !== 202) throw new Error('Preview submission failed');
    pluginId = (await response.json()).pluginId;
    let candidate;
    for (let attempt = 0; attempt < 100; attempt++) {
      candidate = (await (await fetch(origin + '/api/studio/plugins/' + pluginId, { headers: { Cookie: cookie } })).json()).candidate;
      if (candidate?.decision === 'pending') break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (candidate?.decision !== 'pending') throw new Error('Preview material not ready');
    if (index < 4 || index === 6) {
      const decision = index === 6 ? 'reject' : 'approve';
      const result = await fetch(origin + '/api/studio/plugins/' + pluginId + '/review', { method: 'POST', headers: { ...headers, Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ revision: candidate.revision, decision, ...(decision === 'reject' ? { reason: '请补充支持的设备型号和卸载步骤' } : {}) }) });
      if (!result.ok) throw new Error('Preview review failed');
    }
    }
    ids.push(pluginId);
    if (index < 2) await fetch(origin + '/api/plugins/' + pluginId + '/favorite', { method: 'PUT', headers: { ...headers, Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ active: true }) });
  }
  return { cookies: [adminCookie, userCookie], ids };
}
