import { env } from 'cloudflare:workers';
import { applyD1Migrations, reset } from 'cloudflare:test';
import { beforeEach, afterEach, vi } from 'vitest';
beforeEach(async()=>{await reset();await applyD1Migrations(env.DB,env.TEST_MIGRATIONS);vi.spyOn(globalThis,'fetch').mockImplementation(async()=>{throw new Error('Test network is isolated: configure an explicit fixture');});});
afterEach(()=>{vi.restoreAllMocks();});
