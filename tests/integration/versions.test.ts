import { describe, expect, it, vi } from 'vitest';
import { receiveUpload, cleanupUploads } from '../../worker/uploads';
import { currentReview } from '../../worker/manual-review';
import { processTask } from '../../worker/pipeline';
import { makeIPK } from '../adapters/fixtures';
import { origin, request, seedAdmin, testEnv } from './harness';

async function context() {
  const e = { ...testEnv(), REVIEW_MODE: 'manual' };
  return { e, cookie: await seedAdmin(e) };
}
async function version(x: Awaited<ReturnType<typeof context>>, tag: string, pluginId?: string, decision: 'approve' | 'reject' | 'pending' = 'approve') {
  const bytes = await makeIPK({ controlFiles: [{ name: './control', text: `Package: versioned-demo\nVersion: ${tag}\nArchitecture: all\nDescription: Version history fixture\n` }] });
  const form = new FormData();
  form.set('name', '历史版本测试'); form.set('description', '验证已审核版本下载'); form.set('tutorial', '# 使用教程\n安装后启用。');
  form.set('file', new File([bytes as BlobPart], `versioned-demo_${tag}_all.ipk`));
  const task = await receiveUpload(x.e, new Request(origin, { method: 'POST', body: form }), null, pluginId);
  await processTask(x.e, task.taskId!);
  const candidate = (await currentReview(x.e, task.pluginId))!;
  if (decision !== 'pending') {
    const result = await request(x.e, `/api/studio/plugins/${task.pluginId}/review`, 'POST', { revision: candidate.revision, decision, reason: decision === 'reject' ? '请补充卸载步骤' : '', internalReason: 'private-review-note' }, x.cookie);
    expect(result.status).toBe(200);
  }
  return { pluginId: task.pluginId, snapshotId: candidate.snapshot_id, bytes };
}
async function twoVersions() {
  const x = await context();
  const old = await version(x, '1.0.0');
  const latest = await version(x, '2.0.0', old.pluginId);
  return { ...x, old, latest };
}
const historyPath = (v: {pluginId:string;snapshotId:string}) => `/api/plugins/${v.pluginId}/versions/${v.snapshotId}/download/1`;

describe('历史版本和已审核文件保留', () => {
  it('最新版入口保持当前版本，历史入口返回旧版的确切字节并支持 HEAD/Range', async () => {
    const x = await twoVersions();
    const listing = await (await request(x.e, `/api/plugins/${x.old.pluginId}/versions`)).json() as any;
    expect(listing.total).toBe(1);
    expect(listing.items[0]).toMatchObject({ id: x.old.snapshotId, version: '1.0.0', assets: [{ available: true }] });
    expect(JSON.stringify(listing)).not.toMatch(/private-review-note|objectKey|objectEtag|uploadId|materials/);
    expect((await request(x.e, historyPath(x.old), 'HEAD')).status).toBe(200);
    const old = await request(x.e, historyPath(x.old));
    expect(old.status).toBe(200);
    expect(new Uint8Array(await old.arrayBuffer())).toEqual(x.old.bytes);
    const range = await request(x.e, historyPath(x.old), 'GET', undefined, undefined, { Range: 'bytes=8-15' });
    expect(range.status).toBe(206);
    expect(new Uint8Array(await range.arrayBuffer())).toEqual(x.old.bytes.slice(8, 16));
    const latest = await request(x.e, `/api/plugins/${x.old.pluginId}/download/1`);
    expect(new Uint8Array(await latest.arrayBuffer())).toEqual(x.latest.bytes);
    expect((await x.e.DB.prepare('SELECT download_count FROM plugins WHERE id=?').bind(x.old.pluginId).first<any>()).download_count).toBe(2);
  });

  it('待审、退回、其他插件的版本不能借历史接口下载', async () => {
    const x = await twoVersions();
    const pending = await version(x, '3.0.0', x.old.pluginId, 'pending');
    expect((await request(x.e, historyPath(pending))).status).toBe(404);
    const rejected = await version(x, '4.0.0', x.old.pluginId, 'reject');
    expect((await request(x.e, historyPath(rejected))).status).toBe(404);
    const other = await version(x, '8.0.0');
    expect((await request(x.e, historyPath({ ...x.old, snapshotId: other.snapshotId }))).status).toBe(404);
    const listing = await (await request(x.e, `/api/plugins/${x.old.pluginId}/versions`)).json() as any;
    expect(listing.items.map((v:any) => v.version)).toEqual(['1.0.0']);
    expect((await request(x.e, historyPath(x.old) + '?url=https://example.com/file.ipk')).status).toBe(400);
  });

  it('文件停用和整件下架立即限制历史下载', async () => {
    const x = await twoVersions();
    await x.e.DB.prepare('UPDATE assets SET disabled=1 WHERE snapshot_id=?').bind(x.old.snapshotId).run();
    expect((await request(x.e, historyPath(x.old))).status).toBe(404);
    const listing = await (await request(x.e, `/api/plugins/${x.old.pluginId}/versions`)).json() as any;
    expect(listing.items[0].assets[0].available).toBe(false);
    expect((await request(x.e, `/api/plugins/${x.old.pluginId}/download/1`, 'HEAD')).status).toBe(200);
    const unlisted = await request(x.e, `/api/studio/plugins/${x.old.pluginId}/unlist`, 'POST', { reason: '停止公开此插件' }, x.cookie);
    expect(unlisted.status).toBe(200);
    expect((await request(x.e, historyPath(x.old))).status).toBe(404);
    expect((await request(x.e, `/api/plugins/${x.old.pluginId}/versions`)).status).toBe(404);
  });

  it('清理只移除废弃候选，保留所有已批准旧包；已丢失文件如实标为不可用', async () => {
    const x = await twoVersions();
    const rejected = await version(x, '3.0.0', x.old.pluginId, 'reject');
    await version(x, '4.0.0', x.old.pluginId, 'pending');
    const rejectedSnapshot = JSON.parse((await x.e.DB.prepare('SELECT data FROM snapshots WHERE id=?').bind(rejected.snapshotId).first<any>()).data);
    await x.e.DB.prepare('UPDATE uploads SET created_at=?').bind(Date.now() - 2 * 86400000).run();
    await cleanupUploads(x.e);
    expect((await request(x.e, historyPath(x.old), 'HEAD')).status).toBe(200);
    expect(await x.e.UPLOADS!.head(rejectedSnapshot.assets[0].objectKey)).toBeNull();
    const oldSnapshot = JSON.parse((await x.e.DB.prepare('SELECT data FROM snapshots WHERE id=?').bind(x.old.snapshotId).first<any>()).data);
    await x.e.DB.prepare('DELETE FROM uploads WHERE id=?').bind(oldSnapshot.uploadId).run();
    await x.e.UPLOADS!.delete(oldSnapshot.assets[0].objectKey);
    const listing = await (await request(x.e, `/api/plugins/${x.old.pluginId}/versions`)).json() as any;
    expect(listing.items[0].assets[0].available).toBe(false);
    expect((await request(x.e, historyPath(x.old))).status).toBe(409);
  });

  it.each(['GET', 'HEAD'])('读取文件期间权限变化，迟到的 %s 也不会放行', async method => {
    const x = await twoVersions();
    const name = method === 'GET' ? 'get' : 'head';
    const original = x.e.UPLOADS![name].bind(x.e.UPLOADS!);
    vi.spyOn(x.e.UPLOADS!, name).mockImplementationOnce(async (...args: any[]) => {
      const object = await (original as any)(...args);
      await x.e.DB.prepare('UPDATE plugins SET blocked=1 WHERE id=?').bind(x.old.pluginId).run();
      return object;
    });
    expect((await request(x.e, historyPath(x.old), method)).status).toBe(409);
    expect((await x.e.DB.prepare('SELECT download_count FROM plugins WHERE id=?').bind(x.old.pluginId).first<any>()).download_count).toBe(0);
  });

  it('人工审核模式不会把旧自动批准版本暴露为历史下载', async () => {
    const x = await twoVersions();
    await x.e.DB.prepare("UPDATE snapshots SET data=json_set(data,'$.publicationMode','unreviewed') WHERE id=?").bind(x.old.snapshotId).run();
    expect((await (await request(x.e, `/api/plugins/${x.old.pluginId}/versions`)).json() as any).total).toBe(0);
    expect((await request(x.e, historyPath(x.old))).status).toBe(404);
    await x.e.DB.prepare("UPDATE snapshots SET data=json_set(data,'$.publicationMode','unreviewed') WHERE id=?").bind(x.latest.snapshotId).run();
    expect((await request(x.e, `/api/plugins/${x.old.pluginId}/versions`)).status).toBe(404);
  });

  it('分页完整列出已批准旧记录，不把最新版本算入历史', async () => {
    const x = await twoVersions();
    for (let i = 0; i < 21; i++) {
      await x.e.DB.prepare("INSERT INTO snapshots(id,plugin_id,revision,fingerprint,data,verdict,public_reason,internal_reason,review_version,created_at) SELECT ?,plugin_id,revision,?,json_set(data,'$.tag',?),verdict,public_reason,internal_reason,review_version,? FROM snapshots WHERE id=?")
        .bind(`history-${i}`, `history-fingerprint-${i}`, `0.${i}.0`, 1000 + i, x.old.snapshotId).run();
    }
    const a = await (await request(x.e, `/api/plugins/${x.old.pluginId}/versions?page=1`)).json() as any;
    const b = await (await request(x.e, `/api/plugins/${x.old.pluginId}/versions?page=2`)).json() as any;
    expect(a.total).toBe(22); expect(a.items).toHaveLength(20); expect(b.items).toHaveLength(2);
    expect(new Set([...a.items, ...b.items].map(v => v.id)).size).toBe(22);
    expect(a.items[0].id).toBe(x.old.snapshotId);
  });
});
