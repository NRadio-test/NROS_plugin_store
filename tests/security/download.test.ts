import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Asset, Env, Snapshot } from '../../worker/contracts';
import { forwardDownload, OFFICIAL_SOURCE, parseRange, testSource, validateSource } from '../../worker/download';
const bindings = env as unknown as Env;
// 所有外部响应仅存在于本隔离测试，不安装任何生产 mock 开关。
let pending: {host:string;path:string;method?:string;status:number;data:unknown;headers?:HeadersInit}[];
const fetchMock = {get(host:string) {return {intercept(match:{path:string;method?:string}) {return {reply(status:number,data:unknown,options?:{headers:HeadersInit}) {pending.push({host,...match,status,data,headers:options?.headers});}};}};}};
beforeEach(() => {
 pending=[];
 vi.mocked(globalThis.fetch).mockImplementation(async(input,init) => {
  const url=new URL(typeof input==='string'?input:input instanceof Request?input.url:input.toString());
  const method=init?.method??'GET';
  const index=pending.findIndex(p=>p.host===url.origin&&p.path===url.pathname+url.search&&(p.method??'GET')===method);
  if(index<0)throw new Error(`Unexpected fixture request ${method} ${url}`);
  const reply=pending.splice(index,1)[0]!;
  return new Response(method==='HEAD'?null:typeof reply.data==='string'?reply.data:JSON.stringify(reply.data),{status:reply.status,headers:reply.headers});
 });
});

const content = '!<arch>\n0123456789abcdef';
async function fixture() {
 const pluginId = crypto.randomUUID(), snapshotId = crypto.randomUUID();
 const asset: Asset = {id:971,name:'demo_arm64.ipk',size:content.length,url:'https://github.com/test-owner/test-repo/releases/download/v1/demo_arm64.ipk',digest:null,updatedAt:'2026-01-01T00:00:00Z',sha256:'b'.repeat(64)};
 const snapshot: Snapshot = {repositoryId:123,fullName:'test-owner/test-repo',description:'test',license:'MIT',readme:'readme',readmePath:'README.md',readmeCommit:'a'.repeat(40),releaseId:77,tag:'v1',sourceCommit:'a'.repeat(40),assets:[asset],materials:'',coverage:[],fingerprint:crypto.randomUUID()};
 await bindings.DB.prepare("INSERT INTO plugins(id,repository_id,full_name,status,approved_snapshot_id,created_at,updated_at) VALUES(?,?,'test-owner/test-repo','published',?,1,1)").bind(pluginId,Math.floor(Math.random()*1e10),snapshotId).run();
 await bindings.DB.prepare("INSERT INTO snapshots(id,plugin_id,revision,fingerprint,data,verdict,public_reason,internal_reason,review_version,created_at) VALUES(?,?,1,?,?,'allow','','','1',1)").bind(snapshotId,pluginId,snapshot.fingerprint,JSON.stringify(snapshot)).run();
 await bindings.DB.prepare('INSERT INTO assets(id,snapshot_id,plugin_id,name,size,sha256,data) VALUES(?,?,?,?,?,?,?)').bind(asset.id,snapshotId,pluginId,asset.name,asset.size,asset.sha256,JSON.stringify(asset)).run();
 return {pluginId,snapshotId,asset,snapshot};
}
function metadata(asset:Asset, changed=false) {
 const api = fetchMock.get('https://api.github.com');
 api.intercept({path:'/repositories/123'}).reply(200,{id:123,private:false,full_name:'test-owner/test-repo'});
 api.intercept({path:'/repos/test-owner/test-repo/releases/77'}).reply(200,{id:77,tag_name:'v1',draft:false,prerelease:false,assets:[{id:asset.id,name:asset.name,size:asset.size,updated_at:changed?'changed':asset.updatedAt,state:'uploaded',digest:null}]});
 api.intercept({path:'/repos/test-owner/test-repo/commits/v1'}).reply(200,{sha:'a'.repeat(40)});
}
function payload(method='GET',range?:string,type='application/octet-stream') {
 const partial = range ? content.slice(8,16) : content;
 fetchMock.get('https://api.github.com').intercept({path:'/repos/test-owner/test-repo/releases/assets/971',method}).reply(range?206:200,method==='HEAD'?'':partial,{headers:{'content-type':type,'content-length':String(range?8:content.length),...(range?{'content-range':`bytes 8-15/${content.length}`}:{})}});
}
const req = (method='GET',range?:string) => new Request('https://store.example.com/download',{method,headers:{'CF-Connecting-IP':'203.0.113.1','User-Agent':'isolated-test',...(range?{Range:range}:{})}});
describe('下载资产边界、流式转发和统计',()=>{
 it('拒绝任意 URL、未批准资产和异常 Range',async()=>{
  const f=await fixture();
  await expect(forwardDownload(new Request('https://store.example.com/download?url=https://evil.com'),bindings,f.pluginId,971)).rejects.toThrow('不接受');
  await expect(forwardDownload(req(),bindings,f.pluginId,999)).rejects.toThrow('尚未通过');
  expect(parseRange('bytes=-3',10)).toEqual({start:7,end:9});
  expect(()=>parseRange('bytes=0-1,4-5',10)).toThrow();
  expect((await forwardDownload(req('GET','bytes=999-'),bindings,f.pluginId,971)).status).toBe(416);
 });
 it('真实官方元数据核验后附件返回；重试和 Range 短期只计一次，HEAD不计',async()=>{
  const f=await fixture(); metadata(f.asset);payload();
  const response=await forwardDownload(req(),bindings,f.pluginId,971);
  expect(response.status).toBe(200);expect(response.headers.get('Content-Disposition')).toContain('demo_arm64.ipk');expect(new TextDecoder().decode(await response.arrayBuffer())).toBe(content);
  metadata(f.asset);payload('GET','bytes=8-15');
  const partial=await forwardDownload(req('GET','bytes=8-15'),bindings,f.pluginId,971);expect(partial.status).toBe(206);expect(new TextDecoder().decode(await partial.arrayBuffer())).toBe(content.slice(8,16));
  metadata(f.asset);payload('HEAD');expect((await forwardDownload(req('HEAD'),bindings,f.pluginId,971)).body).toBeNull();
  expect((await bindings.DB.prepare('SELECT download_count FROM plugins WHERE id=?').bind(f.pluginId).first<{download_count:number}>())?.download_count).toBe(1);
 });
 it('资产被替换持久停用，不向客户端下载且不计数',async()=>{
  const f=await fixture();metadata(f.asset,true);
  await expect(forwardDownload(req(),bindings,f.pluginId,971)).rejects.toThrow('需要重新审核');
  expect((await bindings.DB.prepare('SELECT disabled FROM assets WHERE snapshot_id=?').bind(f.snapshotId).first<{disabled:number}>())?.disabled).toBe(1);
 });
 it('上游 HTML 不伪装安装包也不增加计数',async()=>{
  const f=await fixture();metadata(f.asset);payload('GET',undefined,'text/html');
  await expect(forwardDownload(req(),bindings,f.pluginId,971)).rejects.toThrow('没有可用下载源');
  expect((await bindings.DB.prepare('SELECT download_count FROM plugins WHERE id=?').bind(f.pluginId).first<{download_count:number}>())?.download_count).toBe(0);
 });
 it('模板拒绝内网、凭据和未知变量，未测试第三方源不启用',async()=>{
  expect(()=>validateSource({...OFFICIAL_SOURCE,id:'other',template:'https://127.0.0.1/{assetId}',allowedHosts:['127.0.0.1']})).toThrow();
  expect(()=>validateSource({...OFFICIAL_SOURCE,id:'other',template:'https://u:p@evil.com/{assetId}',allowedHosts:['evil.com']})).toThrow();
  expect(()=>validateSource({...OFFICIAL_SOURCE,id:'other',template:'https://evil.com/{url}',allowedHosts:['evil.com']})).toThrow();
  const f=await fixture();metadata(f.asset);
  await bindings.DB.prepare("INSERT OR REPLACE INTO settings(key,value) VALUES('sources',?)").bind(JSON.stringify([{...OFFICIAL_SOURCE,id:'other',trusted:true}])).run();
  try { await expect(forwardDownload(req(),bindings,f.pluginId,971)).rejects.toThrow('没有可用下载源'); }
  finally { await bindings.DB.prepare("DELETE FROM settings WHERE key='sources'").run(); }
 });

 it('伪装为 octet-stream 的 HTML 正文仍被拒绝',async()=>{
  const f=await fixture();metadata(f.asset);
  fetchMock.get('https://api.github.com').intercept({path:'/repos/test-owner/test-repo/releases/assets/971'}).reply(200,'<html>bad</html>',{headers:{'content-type':'application/octet-stream'}});
  await expect(forwardDownload(req(),bindings,f.pluginId,971)).rejects.toThrow('IPK 内容');
  expect((await bindings.DB.prepare('SELECT download_count FROM plugins WHERE id=?').bind(f.pluginId).first<{download_count:number}>())?.download_count).toBe(0);
 });
 it('恶意重定向不能把 GitHub token 送到第三方',async()=>{
  const f=await fixture();metadata(f.asset);
  fetchMock.get('https://api.github.com').intercept({path:'/repos/test-owner/test-repo/releases/assets/971'}).reply(302,'',{headers:{location:'https://evil.com/stolen'}});
  await expect(forwardDownload(req(),bindings,f.pluginId,971)).rejects.toThrow('没有可用下载源');
  expect(vi.mocked(globalThis.fetch).mock.calls.every(([input])=>new URL(String(input)).hostname==='api.github.com')).toBe(true);
 });
 it('客户端下载取消会取消上游流，不保存安装包',async()=>{
  const f=await fixture();metadata(f.asset);
  const handler=vi.mocked(globalThis.fetch).getMockImplementation()!;
  const canceled=vi.fn();
  vi.mocked(globalThis.fetch).mockImplementation(async(input,init)=>{
   if(String(input).endsWith('/releases/assets/971')) {
    let delivered=false;
    return new Response(new ReadableStream({pull(controller){if(!delivered){delivered=true;controller.enqueue(new TextEncoder().encode('!<arch>\n'));}},cancel:canceled}),{headers:{'content-type':'application/octet-stream','content-length':String(content.length)}});
   }
   return handler(input,init);
  });
  const response=await forwardDownload(req(),bindings,f.pluginId,971);
  await response.body!.cancel('isolated client canceled');
  expect(canceled).toHaveBeenCalled();
 });

 it('保存并测试过的第三方配置证明可被正确读取并转发固定资产',async()=>{
  const f=await fixture();metadata(f.asset);payload();
  const source={...OFFICIAL_SOURCE,id:'trusted-source',trusted:true,enabled:true};
  await bindings.DB.prepare("INSERT OR REPLACE INTO settings(key,value) VALUES('sources',?)").bind(JSON.stringify([source])).run();
  await bindings.DB.prepare("INSERT OR REPLACE INTO settings(key,value) VALUES('source-tested:trusted-source',?)").bind(JSON.stringify(JSON.stringify({...source,enabled:false}))).run();
  const response=await forwardDownload(req(),bindings,f.pluginId,971);expect(response.status).toBe(200);expect((await response.arrayBuffer()).byteLength).toBe(content.length);
 });
 it('来源测试只报告实际样本验证，不假称整包SHA256',async()=>{
  const f=await fixture();metadata(f.asset);
  fetchMock.get('https://api.github.com').intercept({path:'/repos/test-owner/test-repo/releases/assets/971'}).reply(206,content,{headers:{'content-type':'application/octet-stream','content-length':String(content.length),'content-range':`bytes 0-${content.length-1}/${content.length}`}});
  const result=await testSource(bindings,OFFICIAL_SOURCE,f.pluginId,971);expect(result.ok).toBe(true);expect(result.sha256Verified).toBe(false);
 });
});
