import { env as bindings } from 'cloudflare:workers';
import { createExecutionContext } from 'cloudflare:test';
import { vi } from 'vitest';
import worker from '../../worker/index';
import type { Asset, Env, Snapshot } from '../../worker/contracts';
import { createSession } from '../../worker/security';
import { saveAI } from '../../worker/settings';
import { submit, processTask } from '../../worker/pipeline';
import { makeGitHubFixture } from '../adapters/fixtures';

export const origin = 'https://store.example.com';
/** 只存在于隔离测试的内部依据哨兵：用来证明它不会出现在公共接口。 */
export const INTERNAL_SENTINEL = '隔离内部依据哨兵：实际扫描包含源码、控制与安装脚本';
export const AI_CONFIG = { baseUrl: 'https://ai.vendor.com/v1', model: 'fixture-model', apiKey: 'isolated-key', timeoutMs: 1000, maxRetries: 0, inputBudget: 100000, outputBudget: 1500, rules: 'fixture rule', structuredOutput: false };
let repositoryId = 9_000_000;

/** 每个用例独立的 Env：队列用内存实现，网络仍由 tests/setup.ts 隔离。 */
export const testEnv = () => ({ ...bindings, JOBS: { send: vi.fn(async () => undefined) } } as unknown as Env);

export function request(e: Env, path: string, method = 'GET', body?: unknown, cookie?: string, headers: Record<string, string> = {}) {
 return worker.fetch(new Request(origin + path, {
  method,
  headers: { ...(method === 'GET' || method === 'HEAD' ? {} : { Origin: origin, 'Content-Type': 'application/json' }), ...(cookie ? { Cookie: cookie } : {}), ...headers },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
 }), e, createExecutionContext());
}

/** 安装 GitHub/AI 夹具；所有外部响应只存在于本隔离测试。 */
export async function installFixture(verdict: 'allow' | 'reject' | 'uncertain' = 'allow') {
 const fixture = await makeGitHubFixture();
 const aiCalls: Record<string, unknown>[] = [];
 vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
  if (String(input).startsWith('https://ai.vendor.com/')) {
   aiCalls.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
   return Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ verdict, publicReason: '隔离测试：静态材料符合预期', internalReason: INTERNAL_SENTINEL }) } }] });
  }
  return fixture.fetcher(input, init);
 });
 return { fixture, aiCalls };
}

/** 走完整投稿与自动审核流程，得到一个真实上架的插件。 */
export async function publish(verdict: 'allow' | 'reject' | 'uncertain' = 'allow') {
 const e = testEnv();
 const { fixture, aiCalls } = await installFixture(verdict);
 await saveAI(e, AI_CONFIG);
 const task = await submit(e, 'https://github.com/fixture/harmless', null);
 await processTask(e, task.taskId!);
 return { e, fixture, aiCalls, task, pluginId: task.pluginId! };
}

/** 写入管理员并签发真实会话 cookie。 */
export async function seedAdmin(e: Env, passwordHash = 'unused') {
 await e.ADMIN_AUTH_DB.prepare("INSERT INTO admins(id,username,password_hash,created_at,updated_at) VALUES('admin','fixture-admin',?,?,?)").bind(passwordHash, Date.now(), Date.now()).run();
 return (await createSession(e, 'admin', 'admin')).cookie.split(';')[0]!;
}

export interface SeedPluginOptions {
 id: string; fullName: string; status?: string; blocked?: number; description?: string;
 createdAt?: number; updatedAt?: number; downloads?: number; favorites?: number; reviewedAt?: number;
 tag?: string; publicReason?: string; internalReason?: string; approved?: boolean; assets?: Asset[];
}

/** 直接写入一个插件（含已批准快照、附件、收藏），用于市场与 Studio 读取类断言。 */
export async function seedPlugin(e: Env, options: SeedPluginOptions) {
 const createdAt = options.createdAt ?? 1000, updatedAt = options.updatedAt ?? createdAt, snapshotId = crypto.randomUUID();
 const approved = options.approved !== false;
 const assets = options.assets ?? [];
 // 先建插件再建快照，避免 plugins/snapshots 的外键顺序问题。
 await e.DB.prepare('INSERT INTO plugins(id,repository_id,full_name,status,blocked,revision,description,public_reason,created_at,updated_at,download_count) VALUES(?,?,?,?,?,1,?,?,?,?,?)')
  .bind(options.id, ++repositoryId, options.fullName, options.status ?? 'published', options.blocked ?? 0, options.description ?? '隔离描述', options.publicReason ?? '隔离公开理由', createdAt, updatedAt, options.downloads ?? 0).run();
 if (approved) {
  const snapshot: Snapshot = { repositoryId: ++repositoryId, fullName: options.fullName, description: options.description ?? '隔离描述', license: 'MIT', readme: '# 隔离 README', readmePath: 'README.md', readmeCommit: 'a'.repeat(40), releaseId: 1, tag: options.tag ?? 'v1.0.0', sourceCommit: 'b'.repeat(40), assets, materials: '', coverage: [], fingerprint: crypto.randomUUID() };
  await e.DB.prepare("INSERT INTO snapshots(id,plugin_id,revision,fingerprint,data,verdict,public_reason,internal_reason,review_version,created_at) VALUES(?,?,1,?,?,'allow',?,?,'v1',?)").bind(snapshotId, options.id, snapshot.fingerprint, JSON.stringify(snapshot), options.publicReason ?? '隔离公开理由', options.internalReason ?? INTERNAL_SENTINEL, options.reviewedAt ?? createdAt).run();
  for (const asset of assets) await e.DB.prepare('INSERT INTO assets(id,snapshot_id,plugin_id,name,size,sha256,data) VALUES(?,?,?,?,?,?,?)').bind(asset.id, snapshotId, options.id, asset.name, asset.size, asset.sha256 ?? '', JSON.stringify(asset)).run();
  await e.DB.prepare('UPDATE plugins SET approved_snapshot_id=? WHERE id=?').bind(snapshotId, options.id).run();
 }
 for (let index = 0; index < (options.favorites ?? 0); index++) {
  const userId = `${options.id}-user-${index}`;
  await e.DB.prepare('INSERT INTO users(id,phone_index,phone_mask,created_at) VALUES(?,?,?,?)').bind(userId, `${options.id}-index-${index}`, '+8613800000000', createdAt).run();
  await e.DB.prepare('INSERT INTO favorites(user_id,plugin_id,created_at) VALUES(?,?,?)').bind(userId, options.id, createdAt).run();
 }
 return { snapshotId, approved };
}

/** 直接写入任务，用于 Studio 计数与筛选断言。 */
export async function seedTask(e: Env, pluginId: string, status: string, options: { revision?: number; attempts?: number; createdAt?: number; internalReason?: string; publicReason?: string } = {}) {
 const id = crypto.randomUUID(), createdAt = options.createdAt ?? 1500;
 await e.DB.prepare("INSERT INTO tasks(id,plugin_id,revision,status,attempts,public_reason,internal_reason,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)")
  .bind(id, pluginId, options.revision ?? 1, status, options.attempts ?? 0, options.publicReason ?? '隔离任务公开理由', options.internalReason ?? INTERNAL_SENTINEL, createdAt, createdAt).run();
 return id;
}
export { bindings as cloudflareEnv };
