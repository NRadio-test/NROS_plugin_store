import { describe, expect, it } from 'vitest';
import type { Asset } from '../../worker/contracts';
import { INTERNAL_SENTINEL, request, seedPlugin, testEnv } from './harness';

interface MarketBody { items: { id: string; full_name: string; version: string | null; favorite_count: number; download_count: number; favorited: boolean; updated_at: number }[]; total: number; page: number; pageSize: number; sort: string }

async function market(e: ReturnType<typeof testEnv>, query = ''): Promise<MarketBody> {
 const response = await request(e, '/api/plugins' + query);
 expect(response.status).toBe(200);
 return await response.json() as MarketBody;
}

describe('公共市场排序白名单与公开审核信息', () => {
 it('缺省与非法 sort 一律回落 updated，downloads/favorites 只按白名单排序且不拼接输入', async () => {
  const e = testEnv();
  await seedPlugin(e, { id: 'p-a', fullName: 'owner/alpha', updatedAt: 300 });
  await seedPlugin(e, { id: 'p-b', fullName: 'owner/beta', updatedAt: 200, downloads: 5 });
  await seedPlugin(e, { id: 'p-c', fullName: 'owner/gamma', updatedAt: 100, favorites: 3 });
  const fallback = await market(e);
  expect(fallback.sort).toBe('updated');
  expect(fallback.items.map(item => item.id)).toEqual(['p-a', 'p-b', 'p-c']);
  expect(fallback.pageSize).toBe(12);
  expect(fallback.total).toBe(3);
  for (const illegal of ['', 'bogus', 'UPDATED', 'download_count DESC', 'favorite_count;DROP TABLE plugins', '__proto__', 'constructor', 'toString']) {
   const body = await market(e, '?sort=' + encodeURIComponent(illegal));
   expect(body.sort).toBe('updated');
   expect(body.items.map(item => item.id)).toEqual(['p-a', 'p-b', 'p-c']);
  }
  expect((await e.DB.prepare('SELECT COUNT(*) n FROM plugins').first<{ n: number }>())?.n).toBe(3);
  const downloads = await market(e, '?sort=downloads');
  expect(downloads.sort).toBe('downloads');
  expect(downloads.items.map(item => item.id)).toEqual(['p-b', 'p-a', 'p-c']);
  const favorites = await market(e, '?sort=favorites');
  expect(favorites.sort).toBe('favorites');
  expect(favorites.items.map(item => item.id)).toEqual(['p-c', 'p-a', 'p-b']);
  expect(favorites.items[0]?.favorite_count).toBe(3);
  expect(favorites.items[1]?.favorite_count).toBe(0);
 });

 it('任何排序都只返回已上架、未停用且有已批准快照的插件', async () => {
  const e = testEnv();
  await seedPlugin(e, { id: 'p-ok', fullName: 'owner/ok', updatedAt: 500, downloads: 1 });
  await seedPlugin(e, { id: 'p-draft', fullName: 'owner/draft', status: 'pending', updatedAt: 900, downloads: 9 });
  await seedPlugin(e, { id: 'p-blocked', fullName: 'owner/blocked', status: 'published', blocked: 1, updatedAt: 800, downloads: 8 });
  await seedPlugin(e, { id: 'p-nosnapshot', fullName: 'owner/nosnapshot', status: 'published', approved: false, updatedAt: 700, downloads: 7 });
  for (const query of ['', '?sort=updated', '?sort=downloads', '?sort=favorites', '?sort=illegal']) {
   const body = await market(e, query);
   expect(body.items.map(item => item.id)).toEqual(['p-ok']);
   expect(body.total).toBe(1);
  }
 });

 it('公共详情补充 reviewedAt/reviewPublicReason/publishedAt，且绝不包含内部依据', async () => {
  const e = testEnv();
  const asset: Asset = { id: 4101, name: 'demo_arm64.ipk', size: 4096, url: 'https://github.com/owner/detail/releases/download/v2.3.4/demo_arm64.ipk', digest: null, updatedAt: '2026-01-01T00:00:00Z', sha256: 'c'.repeat(64), packageName: 'demo', architecture: 'arm64' };
  await seedPlugin(e, { id: 'p-detail', fullName: 'owner/detail', tag: 'v2.3.4', updatedAt: 777, reviewedAt: 555, publicReason: '公开理由：材料齐全', internalReason: INTERNAL_SENTINEL, downloads: 4, assets: [asset] });
  const response = await request(e, '/api/plugins/p-detail');
  expect(response.status).toBe(200);
  const body = await response.json() as { plugin: Record<string, unknown>; assets: Record<string, unknown>[]; reviewedAt: number | null; reviewPublicReason: string; publishedAt: number | null };
  expect(body.reviewedAt).toBe(555);
  expect(body.reviewPublicReason).toBe('公开理由：材料齐全');
  expect(body.publishedAt).toBe(777);
  expect(Object.keys(body.plugin).sort()).toEqual(['description', 'download_count', 'favorite_count', 'favorited', 'full_name', 'id', 'updated_at', 'version']);
  expect(body.plugin.version).toBe('v2.3.4');
  expect(body.assets).toEqual([{ id: 4101, name: 'demo_arm64.ipk', size: 4096, sha256: 'c'.repeat(64), packageName: 'demo', architecture: 'arm64' }]);
  const serialized = JSON.stringify(body);
  expect(serialized).not.toContain('内部依据');
  expect(serialized).not.toContain(INTERNAL_SENTINEL);
  expect(serialized).not.toContain('internal_reason');
  expect(serialized).not.toContain('review_version');
 });

 it('未上架插件没有公开详情，公共列表也不回显内部依据', async () => {
  const e = testEnv();
  await seedPlugin(e, { id: 'p-hidden', fullName: 'owner/hidden', status: 'pending', internalReason: INTERNAL_SENTINEL });
  expect((await request(e, '/api/plugins/p-hidden')).status).toBe(404);
  const list = await request(e, '/api/plugins');
  expect(JSON.stringify(await list.json())).not.toContain('内部依据');
  expect((await market(e)).total).toBe(0);
 });
});
