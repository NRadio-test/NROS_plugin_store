import { describe, expect, it } from 'vitest';
import { receiveUpload } from '../../worker/uploads';
import { currentReview, decideReview } from '../../worker/manual-review';
import { processTask, refresh, recover, scan, submit } from '../../worker/pipeline';
import { makeIPK } from '../adapters/fixtures';
import { installFixture, origin, request, seedAdmin, seedPlugin, testEnv } from './harness';

async function upload(e: ReturnType<typeof testEnv>, version = '1.0.0', pluginId?: string) {
  const bytes = await makeIPK({ controlFiles: [{ name: './control', text: `Package: manual-demo\nVersion: ${version}\nArchitecture: all\nDescription: Manual review fixture\n` }] });
  const form = new FormData();
  form.set('name','人工审核样例'); form.set('description','用于验证全部人工审核'); form.set('tutorial','# 使用教程\n安装后启用。');
  form.set('file',new File([bytes as BlobPart],'demo.ipk'));
  return { task: await receiveUpload(e,new Request(origin,{method:'POST',body:form}),null,pluginId), bytes };
}
async function prepared(version = '1.0.0') {
  const e = {...testEnv(), REVIEW_MODE:'manual', CLOUDMERSIVE_API_KEY:''};
  const {task,bytes} = await upload(e,version);
  const cookie = await seedAdmin(e);
  await processTask(e,task.taskId!);
  return {e,task,bytes,cookie};
}
const decision = (x: Awaited<ReturnType<typeof prepared>>, value = 'approve', revision = 1, reason = '') => request(x.e,`/api/studio/plugins/${x.task.pluginId}/review`,'POST',{decision:value,revision,reason},x.cookie);

describe('所有来源和版本必须由管理员人工审核',()=>{
  it.each(['true','false'])('自动审核开关 %s 不能绕过人工批准',async enabled=>{
    const e={...testEnv(),REVIEW_MODE:'manual',REVIEW_ENABLED:enabled};
    const {task}=await upload(e);
    await processTask(e,task.taskId!);
    expect((await e.DB.prepare('SELECT status,approved_snapshot_id FROM plugins WHERE id=?').bind(task.pluginId).first())).toEqual({status:'awaiting_review',approved_snapshot_id:null});
    expect((await request(e,`/api/plugins/${task.pluginId}`)).status).toBe(404);
    expect((await request(e,`/api/plugins/${task.pluginId}/download/1`)).status).toBe(404);
    expect((await (await request(e,'/api/plugins')).json() as any).total).toBe(0);
    expect(fetch).not.toHaveBeenCalled();
    expect((await e.DB.prepare('SELECT COUNT(*) n FROM ai_usage').first<any>()).n).toBe(0);
  });
  it('管理员提交的 IPK 仍先进入待审队列，不能自动上架',async()=>{
    const x=await prepared();
    expect((await currentReview(x.e,x.task.pluginId))?.decision).toBe('pending');
    const detail=await (await request(x.e,`/api/studio/plugins/${x.task.pluginId}`,'GET',undefined,x.cookie)).json() as any;
    expect(detail.candidate.readme).toContain('使用教程');
    expect(detail.candidate.assets[0].name).toBe('demo.ipk');
    expect(detail.candidate.publicReason).toBe('');
    expect((await (await request(x.e,'/api/studio/overview','GET',undefined,x.cookie)).json() as any).counts.awaitingReview).toBe(1);
    expect((await (await request(x.e,'/api/studio/plugins?status=awaiting_review','GET',undefined,x.cookie)).json() as any).items).toHaveLength(1);
  });
  it('GitHub 来源整理完只待审，不调用 AI 或要求二进制源码',async()=>{
    const e={...testEnv(),REVIEW_MODE:'manual'}, {fixture,aiCalls}=await installFixture();
    const task=await submit(e,'https://github.com/fixture/harmless',null);
    await processTask(e,task.taskId!);
    expect((await currentReview(e,task.pluginId!))?.decision).toBe('pending');
    expect(aiCalls).toHaveLength(0);
    expect(fixture.calls.some(call=>call.url.includes('/git/trees/'))).toBe(false);
    expect((await request(e,`/api/plugins/${task.pluginId}`)).status).toBe(404);
  });
  it('缺失审核模式配置也默认人工审核',async()=>{
    const e={...testEnv(),REVIEW_MODE:undefined}, {task}=await upload(e);
    await processTask(e,task.taskId!);
    expect((await currentReview(e,task.pluginId))?.decision).toBe('pending');
  });
  it('尚未整理完时，旧手动上架接口也不能绕过候选审核',async()=>{
    const e={...testEnv(),REVIEW_MODE:'manual'}, {task}=await upload(e), cookie=await seedAdmin(e);
    expect((await request(e,`/api/studio/plugins/${task.pluginId}/manual-publish`,'POST',{confirmed:true,revision:1},cookie)).status).toBe(409);
    expect((await request(e,`/api/plugins/${task.pluginId}`)).status).toBe(404);
  });
  it('候选安装包仅管理员可下载，并且不增加市场下载统计',async()=>{
    const x=await prepared(), path=`/api/studio/plugins/${x.task.pluginId}/review/download/1`;
    expect((await request(x.e,path)).status).toBe(401);
    const result=await request(x.e,path,'GET',undefined,x.cookie);
    expect(result.status).toBe(200); expect(new Uint8Array(await result.arrayBuffer())).toEqual(x.bytes);
    expect((await x.e.DB.prepare('SELECT download_count FROM plugins WHERE id=?').bind(x.task.pluginId).first<any>()).download_count).toBe(0);
  });
  it('批准版本后才进入市场、开放下载，公开接口不泄露内部备注',async()=>{
    const x=await prepared();
    const response=await request(x.e,`/api/studio/plugins/${x.task.pluginId}/review`,'POST',{revision:1,decision:'approve',reason:'使用说明完整，允许收录',internalReason:'仅后台可见的审核备注'},x.cookie);
    expect(response.status).toBe(200);
    const detail=await (await request(x.e,`/api/plugins/${x.task.pluginId}`)).json() as any;
    expect(detail.publicationMode).toBe('human-reviewed'); expect(detail.reviewLabel).toBe('人工审核通过'); expect(detail.reviewedAt).toBeGreaterThan(0);
    expect(JSON.stringify(detail)).not.toContain('仅后台可见');
    expect((await request(x.e,`/api/plugins/${x.task.pluginId}/download/1`)).status).toBe(200);
    expect((await (await request(x.e,'/api/plugins')).json() as any).total).toBe(1);
    expect(await x.e.DB.prepare("SELECT admin_id,action FROM audit WHERE action='manual-approve'").first()).toEqual({admin_id:'admin',action:'manual-approve'});
    expect((await decision(x)).status).toBe(409);
  });
  it('退回必须填写可操作的原因，不能上架；新版本可以重新送审',async()=>{
    const x=await prepared();
    expect((await request(x.e,`/api/studio/plugins/${x.task.pluginId}/review`,'POST',{revision:1,decision:['approve']},x.cookie)).status).toBe(400);
    expect((await decision(x,'reject')).status).toBe(400);
    expect((await decision(x,'reject',1,'请补充支持的设备型号')).status).toBe(200);
    expect((await currentReview(x.e,x.task.pluginId))?.public_reason).toBe('请补充支持的设备型号');
    expect((await request(x.e,`/api/plugins/${x.task.pluginId}`)).status).toBe(404);
    const next=await upload(x.e,'2.0.0',x.task.pluginId); await processTask(x.e,next.task.taskId!);
    expect((await currentReview(x.e,x.task.pluginId))?.decision).toBe('pending');
  });
  it('新版本必须重新人工审核，待审和退回期间不替换已批准版本',async()=>{
    const x=await prepared(); await decision(x);
    const next=await upload(x.e,'2.0.0',x.task.pluginId); await processTask(x.e,next.task.taskId!);
    let detail=await (await request(x.e,`/api/plugins/${x.task.pluginId}`)).json() as any;
    expect(detail.plugin.version).toBe('1.0.0');
    expect((await decision(x,'approve',1)).status).toBe(409);
    expect((await decision(x,'reject',2,'请完善新版本的升级说明')).status).toBe(200);
    detail=await (await request(x.e,`/api/plugins/${x.task.pluginId}`)).json() as any;
    expect(detail.plugin.version).toBe('1.0.0');
  });
  it('两个管理员同时处理只能产生一个结论和一条审核审计',async()=>{
    const x=await prepared();
    const responses=await Promise.all([decision(x),decision(x,'reject',1,'请补充完整使用步骤')]);
    expect(responses.map(r=>r.status).sort()).toEqual([200,409]);
    expect((await x.e.DB.prepare("SELECT COUNT(*) n FROM audit WHERE action IN ('manual-approve','manual-reject')").first<any>()).n).toBe(1);
  });
  it('候选准备之后文件替换，或读取之后会话撤销，都不能批准',async()=>{
    const x=await prepared();
    await expect(decideReview(x.e,x.task.pluginId,{revision:1,decision:'approve'},async()=>{throw new Error('revoked');})).rejects.toThrow('revoked');
    const row=await x.e.DB.prepare('SELECT object_key FROM uploads WHERE plugin_id=?').bind(x.task.pluginId).first<any>();
    await x.e.UPLOADS!.put(row.object_key,'changed');
    expect((await decision(x)).status).toBe(409);
    expect((await currentReview(x.e,x.task.pluginId))?.decision).toBe('pending');
  });
  it('只有当前管理员、同源请求才能审核；停用后也不能审核',async()=>{
    const x=await prepared(), path=`/api/studio/plugins/${x.task.pluginId}/review`;
    expect((await request(x.e,path,'POST',{revision:1,decision:'approve'})).status).toBe(401);
    expect((await request(x.e,path,'POST',{revision:1,decision:'approve'},x.cookie,{Origin:'https://other.example'})).status).toBe(403);
    await request(x.e,`/api/studio/plugins/${x.task.pluginId}/unlist`,'POST',{},x.cookie);
    expect((await decision(x)).status).toBe(409);
  });
  it('队列重试和定时同步不能反复替换待人工审核的版本',async()=>{
    const x=await prepared();
    await processTask(x.e,x.task.taskId!); await recover(x.e); await scan(x.e);
    expect((await currentReview(x.e,x.task.pluginId))?.revision).toBe(1);
    expect(x.e.JOBS.send).not.toHaveBeenCalled();
    await decision(x,'reject',1,'请补充支持的设备型号'); await scan(x.e);
    expect((await currentReview(x.e,x.task.pluginId))?.decision).toBe('rejected');
    expect(x.e.JOBS.send).not.toHaveBeenCalled();
  });
  it('旧引擎退回但尚无人工审核记录的作品仍能整理并进入人工队列',async()=>{
    const e={...testEnv(),REVIEW_MODE:'manual'}, {task}=await upload(e);
    await e.DB.prepare("UPDATE plugins SET status='rejected' WHERE id=?").bind(task.pluginId).run();
    await e.DB.prepare("UPDATE tasks SET status='rejected' WHERE id=?").bind(task.taskId).run();
    await scan(e);
    expect(e.JOBS.send).toHaveBeenCalled();
    const next=await e.DB.prepare('SELECT id FROM tasks WHERE plugin_id=? ORDER BY revision DESC LIMIT 1').bind(task.pluginId).first<{id:string}>();
    await processTask(e,next!.id);
    expect((await currentReview(e,task.pluginId))?.decision).toBe('pending');
  });
  it('旧自动或免审快照即使还标记 published，也不能进入市场或公开下载',async()=>{
    const e={...testEnv(),REVIEW_MODE:'manual'};
    await seedPlugin(e,{id:'old-publication',fullName:'fixture/old',assets:[{id:1,name:'old.ipk',size:8,url:'',digest:null,updatedAt:''}]});
    expect((await (await request(e,'/api/plugins')).json() as any).total).toBe(0);
    expect((await request(e,'/api/plugins/old-publication')).status).toBe(404);
    expect((await request(e,'/api/plugins/old-publication/download/1')).status).toBe(404);
  });
  it('GitHub 内容没变时继续使用已有人工批准，内容变动后仍需新审核',async()=>{
    const e={...testEnv(),REVIEW_MODE:'manual'};
    const {fixture}=await installFixture(), cookie=await seedAdmin(e), task=await submit(e,'https://github.com/fixture/harmless',null);
    await processTask(e,task.taskId!);
    expect((await request(e,`/api/studio/plugins/${task.pluginId}/review`,'POST',{revision:1,decision:'approve'},cookie)).status).toBe(200);
    const next=await refresh(e,task.pluginId!); await processTask(e,next.taskId);
    expect((await e.DB.prepare('SELECT status FROM tasks WHERE id=?').bind(next.taskId).first<any>()).status).toBe('done');
    expect((await request(e,`/api/plugins/${task.pluginId}`)).status).toBe(200);
    expect(fixture.calls.length).toBeGreaterThan(0);
  });
});
