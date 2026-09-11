import { env } from 'cloudflare:workers';
import { applyD1Migrations, reset } from 'cloudflare:test';
import { beforeEach, afterEach, vi } from 'vitest';
beforeEach(async()=>{await reset();await applyD1Migrations(env.DB,env.TEST_MIGRATIONS);await env.ADMIN_AUTH_DB.prepare('CREATE TABLE admins(id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE COLLATE NOCASE, password_hash TEXT NOT NULL, must_change_password INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)').run();vi.spyOn(globalThis,'fetch').mockImplementation(async()=>{throw new Error('Test network is isolated: configure an explicit fixture');});});
afterEach(()=>{vi.restoreAllMocks();});
