import { describe, expect, it, vi } from 'vitest';
import { createExecutionContext } from 'cloudflare:test';
import worker from '../../worker/index';
import type { Env } from '../../worker/contracts';
import { processTask, recover, refresh, scan } from '../../worker/pipeline';
import { receiveUpload, cleanupUploads } from '../../worker/uploads';
import { saveAI } from '../../worker/settings';
import { makeIPK } from '../adapters/fixtures';
import { AI_CONFIG, installFixture, origin, request, seedAdmin, testEnv } from './harness';

async function login(e: Env, phone = '13800138000') { const r = await request(e, '/api/login', 'POST', { phone }); return r.headers.get('set-cookie')!.split(';')[0]!; }
function form(bytes: Uint8Array, fields: Record<string, string> = {}, filename = '无害插件.ipk') {
  const f = new FormData();
  for (const [k,v] of Object.entries({ name: '直传插件', description: '无害脚本插件', tutorial: '# 使用教程\n安装后运行 harmless-demo', ...fields })) f.set(k,v);
  f.set('file', new File([bytes as BlobPart], filename)); return f;
}
async function upload(e: Env, cookie?: string, options: { path?: string; bytes?: Uint8Array; fields?: Record<string,string>; filename?: string; origin?: string } = {}) {
  return worker.fetch(new Request(origin + (options.path ?? '/api/submit/upload'), { method: 'POST', headers: { Origin: options.origin ?? origin, ...(cookie ? { Cookie: cookie } : {}) }, body: form(options.bytes ?? await makeIPK(), options.fields, options.filename) }), e, createExecutionContext());
}
async function publishUpload() {
  const e = testEnv(), cookie = await login(e), { fixture, aiCalls } = await installFixture();
  await saveAI(e, AI_CONFIG);
  const response = await upload(e, cookie); expect(response.status).toBe(202);
  const task = await response.json() as {pluginId:string;taskId:string};
  await processTask(e, task.taskId);
  return { e, cookie, task, fixture, aiCalls };
}

describe('IPK 直接上传：真实 R2/D1、共用审核与下载', () => {
  it('上传后未批准不可下载；审核真实脚本和教程后上架，不访问 GitHub', async () => {
    const e = testEnv(), cookie = await login(e), { fixture, aiCalls } = await installFixture();
    await saveAI(e, AI_CONFIG);
    const r = await upload(e, cookie); expect(r.status).toBe(202);
    const task = await r.json() as { pluginId:string; taskId:string };
    expect((await request(e, `/api/plugins/${task.pluginId}/download/1`)).status).toBe(404);
    await processTask(e, task.taskId);
    const d = await (await request(e, `/api/plugins/${task.pluginId}`)).json() as any;
    expect(d.plugin.source_kind).toBe('upload'); expect(d.readme).toContain('使用教程'); expect(d.plugin.version).toBe('1.0.0');
    expect(JSON.stringify(d)).not.toMatch(/objectKey|objectEtag|internal_reason|packages\//);
    expect(JSON.stringify(aiCalls)).toContain('postinst'); expect(JSON.stringify(aiCalls)).toContain('harmless-demo'); expect(JSON.stringify(aiCalls)).toContain('使用教程');
    expect(fixture.calls.every(c => !c.url.includes('api.github.com'))).toBe(true);
    const list = await (await request(e, '/api/me', 'GET', undefined, cookie)).json() as any;
    expect(list.submissions[0].upload_tutorial).toContain('使用教程');
  });
  it('流式 GET、HEAD、Range 和去重统计；对象替换后拒绝下载', async () => {
    const { e, task } = await publishUpload(); const url = `/api/plugins/${task.pluginId}/download/1`;
    const bytes = await makeIPK();
    expect((await request(e, url, 'HEAD')).status).toBe(200);
    const first = await request(e, url); expect(first.status).toBe(200); expect(new Uint8Array(await first.arrayBuffer())).toEqual(bytes);
    const range = await request(e, url, 'GET', undefined, undefined, { Range: 'bytes=8-19' }); expect(range.status).toBe(206); expect(new Uint8Array(await range.arrayBuffer())).toEqual(bytes.slice(8,20));
    expect((await request(e, url, 'GET', undefined, undefined, { Range:'bytes=999999-' })).status).toBe(416);
    expect((await e.DB.prepare('SELECT download_count FROM plugins WHERE id=?').bind(task.pluginId).first<any>()).download_count).toBe(1);
    const row = await e.DB.prepare('SELECT object_key FROM uploads WHERE plugin_id=?').bind(task.pluginId).first<any>();
    await e.UPLOADS!.put(row.object_key, new Uint8Array(bytes.length));
    expect((await request(e, url)).status).toBe(409);
  });
  it('认证、来源、资料、伪造格式及大小限制在服务端生效', async () => {
    const e = testEnv(), cookie = await login(e);
    expect((await upload(e)).status).toBe(401);
    expect((await upload(e, cookie, { origin:'https://evil.example' })).status).toBe(403);
    expect((await upload(e, cookie, { fields:{tutorial:''} })).status).toBe(400);
    expect((await upload(e, cookie, { filename:'bad.apk' })).status).toBe(400);
    expect((await upload(e, cookie, { bytes:new TextEncoder().encode('<html>fake</html>') })).status).toBe(422);
    const limited = { ...e, MAX_IPK_BYTES: '8' };
    expect((await upload(limited, cookie)).status).toBe(413);
    expect((await e.UPLOADS!.list()).objects).toHaveLength(0);
  });
  it('缺少存储绑定不影响旧接口；缺少 AI 配置不发布', async () => {
    const e = testEnv(), cookie = await login(e);
    expect((await upload({ ...e, UPLOADS: undefined }, cookie)).status).toBe(503);
    expect((await request({ ...e, UPLOADS: undefined }, '/api/plugins')).status).toBe(200);
    const task = await (await upload(e, cookie)).json() as any; await processTask(e, task.taskId);
    expect((await e.DB.prepare('SELECT status FROM tasks WHERE id=?').bind(task.taskId).first<any>()).status).toBe('waiting_config');
    expect((await request(e, `/api/plugins/${task.pluginId}`)).status).toBe(404);
  });
  it.each(['reject', 'uncertain'] as const)('AI %s 不开放下载', async verdict => {
    const e = testEnv(), cookie = await login(e); await installFixture(verdict); await saveAI(e, AI_CONFIG);
    const t = await (await upload(e, cookie)).json() as any; await processTask(e, t.taskId);
    expect((await request(e, `/api/plugins/${t.pluginId}/download/1`)).status).toBe(404);
  });
  it('无法核验二进制不送入 AI 放行', async () => {
    const e = testEnv(), cookie = await login(e), {aiCalls} = await installFixture(); await saveAI(e, AI_CONFIG);
    const t = await (await upload(e, cookie, { bytes:await makeIPK({ dataFiles:[{name:'usr/bin/program',bytes:new Uint8Array([127,69,76,70,0,1])}] }) })).json() as any;
    await processTask(e, t.taskId);
    expect((await e.DB.prepare('SELECT status FROM tasks WHERE id=?').bind(t.taskId).first<any>()).status).toBe('incomplete'); expect(aiCalls).toHaveLength(0);
  });
  it('更新需原提交会话；新资料审核前保留旧版，迟到任务不能覆盖', async () => {
    const { e, cookie, task } = await publishUpload(); const other = await login(e, '13900139000'); const path = `/api/plugins/${task.pluginId}/upload`;
    expect((await upload(e, other, { path })).status).toBe(403);
    const second = await (await upload(e, cookie, { path, fields:{ name:'第二版' } })).json() as any;
    expect((await (await request(e, `/api/plugins/${task.pluginId}`)).json() as any).plugin.full_name).toBe('直传插件');
    const third = await (await upload(e, cookie, { path, fields:{ name:'第三版' } })).json() as any;
    await processTask(e, second.taskId); await processTask(e, third.taskId);
    expect((await (await request(e, `/api/plugins/${task.pluginId}`)).json() as any).plugin.full_name).toBe('第三版');
    const duplicate = await (await upload(e, cookie, { path, fields:{name:'第三版'} })).json() as any; expect(duplicate.taskId).toBeNull();
  });
  it('下架阻断下载和迟到审核，显式恢复可重审，删除清理私有文件', async () => {
    const {e,task} = await publishUpload(); const admin = await seedAdmin(e);
    const retry = await refresh(e, task.pluginId, true);
    expect((await request(e, `/api/studio/plugins/${task.pluginId}/unlist`, 'POST', {}, admin)).status).toBe(200);
    await processTask(e,retry.taskId);
    expect((await request(e, `/api/plugins/${task.pluginId}/download/1`)).status).toBe(404);
    const restore = await (await request(e, `/api/studio/plugins/${task.pluginId}/restore`, 'POST', {}, admin)).json() as any; await processTask(e, restore.taskId);
    expect((await request(e, `/api/plugins/${task.pluginId}`)).status).toBe(200);
    expect((await request(e, `/api/studio/plugins/${task.pluginId}/delete`, 'POST', {}, admin)).status).toBe(200);
    expect((await e.UPLOADS!.list()).objects).toHaveLength(0);
  });
  it('入队失败可恢复；Cron 重查不请求 GitHub、不重复消耗 AI', async () => {
    const e = testEnv(), cookie = await login(e), {fixture,aiCalls} = await installFixture(); await saveAI(e, AI_CONFIG);
    vi.mocked(e.JOBS.send).mockRejectedValueOnce(new Error('queue offline'));
    const t = await (await upload(e,cookie)).json() as any;
    expect((await e.DB.prepare('SELECT queued_at FROM tasks WHERE id=?').bind(t.taskId).first<any>()).queued_at).toBeNull();
    await recover(e); await processTask(e,t.taskId); await scan(e);
    const next = await e.DB.prepare('SELECT id FROM tasks WHERE plugin_id=? ORDER BY revision DESC LIMIT 1').bind(t.pluginId).first<any>(); await processTask(e,next.id);
    expect(aiCalls).toHaveLength(1); expect(fixture.calls.every(c=>!c.url.includes('api.github.com'))).toBe(true);
  });
  it('并发版本更新保持单一候选，不留下无任务插件或多余 R2 对象', async () => {
    const {e,task} = await publishUpload();
    const bytes=await makeIPK();
    const make=(name:string)=>new Request(origin,{method:'POST',body:form(bytes,{name})});
    const results=await Promise.allSettled([receiveUpload(e,make('并发一'),null,task.pluginId),receiveUpload(e,make('并发二'),null,task.pluginId)]);
    expect(results.some(r=>r.status==='fulfilled')).toBe(true);
    const p=await e.DB.prepare('SELECT revision,upload_id FROM plugins WHERE id=?').bind(task.pluginId).first<any>();
    expect(await e.DB.prepare('SELECT 1 FROM uploads WHERE id=?').bind(p.upload_id).first()).toBeTruthy();
    expect(await e.DB.prepare('SELECT 1 FROM tasks WHERE plugin_id=? AND revision=?').bind(task.pluginId,p.revision).first()).toBeTruthy();
    expect((await e.UPLOADS!.list()).objects.length).toBe((await e.DB.prepare('SELECT COUNT(*) n FROM uploads').first<any>()).n);
  });
  it('并发重复首次投稿只保存一个插件和文件', async () => {
    const e=testEnv(), bytes=await makeIPK();
    const make=()=>new Request(origin,{method:'POST',body:form(bytes)});
    const results=await Promise.allSettled([receiveUpload(e,make(),null),receiveUpload(e,make(),null)]);
    expect(results.some(r=>r.status==='fulfilled')).toBe(true);
    expect((await e.DB.prepare('SELECT COUNT(*) n FROM plugins').first<any>()).n).toBe(1);
    expect((await e.DB.prepare('SELECT COUNT(*) n FROM tasks').first<any>()).n).toBe(1);
    expect((await e.UPLOADS!.list()).objects).toHaveLength(1);
  });
  it('额度不足时原子回滚新投稿和候选指针，清理刚写入的对象', async () => {
    const {e,cookie,task}=await publishUpload();
    const previous=await e.DB.prepare('SELECT revision,upload_id FROM plugins WHERE id=?').bind(task.pluginId).first<any>();
    await e.DB.prepare('UPDATE uploads SET size=134217728').run();
    const response=await upload(e,cookie,{fields:{name:'超过额度'}});
    expect(response.status).toBe(409);
    expect((await e.DB.prepare('SELECT COUNT(*) n FROM plugins').first<any>()).n).toBe(1);
    const update=await upload(e,cookie,{path:`/api/plugins/${task.pluginId}/upload`,fields:{name:'超额更新'}});
    expect(update.status).toBe(409);
    expect(await e.DB.prepare('SELECT revision,upload_id FROM plugins WHERE id=?').bind(task.pluginId).first()).toEqual(previous);
    expect((await e.UPLOADS!.list()).objects).toHaveLength(1);
  });
  it('回收旧候选时保留当前候选与已批准文件', async () => {
    const {e,cookie,task}=await publishUpload();
    await upload(e,cookie,{path:`/api/plugins/${task.pluginId}/upload`,fields:{name:'未审第二版'}});
    await upload(e,cookie,{path:`/api/plugins/${task.pluginId}/upload`,fields:{name:'未审第三版'}});
    await e.DB.prepare('UPDATE uploads SET created_at=0').run();
    await cleanupUploads(e);
    expect((await e.UPLOADS!.list()).objects).toHaveLength(2);
    const r=await request(e,`/api/plugins/${task.pluginId}/download/1`);expect(r.status).toBe(200);await r.arrayBuffer();
  });
});
