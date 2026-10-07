// Opt-in local contract test against the standalone auth project's actual source.
// All databases, credentials and Youzan replies are isolated fixtures.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
const require = createRequire(import.meta.resolve('wrangler'));
const { build } = require('esbuild');
if (!process.argv[2]) throw Error('Provide the local zdwifi-auth-worker source directory');
const authPath = path.resolve(process.argv[2]);
const { Miniflare, convertV4MiniflareOptions } = require('miniflare');
const root = path.resolve(import.meta.dirname, '..');
const temporary = await mkdtemp(path.join(tmpdir(), 'plugin-auth-contract-'));
const origin = 'https://auth.zdwifi.com';
const ua = 'Mozilla/5.0 PluginAuthContract/1.0';
const sites = { plugin: 'https://plugin.zdwifi.com', second: 'https://second.example.test' };
const keys = { plugin: 'isolated-plugin-auth-contract-key-000000000', second: 'isolated-second-auth-contract-key-000000000' };
const upstreamCalls = [];
let profileAvailable = true, profileName = '联调用户';
const cookie = (response, name) => response.headers.getSetCookie().find(v => v.startsWith(name + '=') && !v.startsWith(name + '=;'))?.split(';')[0];
let mf;
try {
 await build({ entryPoints: [path.join(root, 'worker/index.ts')], bundle: true, format: 'esm', platform: 'browser', outfile: path.join(temporary, 'plugin.mjs') });
 await build({ entryPoints: [path.join(authPath, 'src/worker.mjs')], bundle: true, format: 'esm', platform: 'browser', outfile: path.join(temporary, 'auth.mjs') });
 const authEnv = {
    AUTH_ORIGIN: origin, YOUZAN_CALLBACK_URL: origin + '/api/customer/oauth/callback',
    YOUZAN_CLIENT_ID: 'isolated-app', YOUZAN_SHOP_ID: '12345', YOUZAN_CLIENT_SECRET: 'isolated-youzan-secret',
    YOUZAN_RELAY_URL: 'https://relay.example.test', YOUZAN_RELAY_SECRET: 'isolated-relay-contract-secret-0000000000',
    SSO_CLIENT_KEYS: JSON.stringify(keys),
    SSO_SITES: JSON.stringify(Object.fromEntries(Object.entries(sites).map(([id, address]) => [id, { origin: address, callback: address + '/api/auth/callback', identity_fields: [] }]))),
 };
 const upstream = async request => {
    assert.equal(request.url, 'https://relay.example.test/v1/youzan');
    const body = await request.json(); upstreamCalls.push(body.route);
    if (body.route === 'buyer-token') {
     assert.equal(new URLSearchParams(body.query).get('userAgent'), ua);
     return Response.json({ code: 0, data: { openId: 'isolated-contract-buyer', scope: 'auth_user', expiresIn: 7200, accessToken: 'isolated-unused-token' } });
    }
    if (body.route === 'shop-token') return Response.json({ code: 200, success: true, data: { access_token: 'isolated-shop-token', authority_id: '12345', expires: Date.now() + 86400000 } });
    if (body.route === 'buyer-profile') return profileAvailable ? Response.json({ code: 0, data: { openId: 'isolated-contract-buyer', nickName: profileName, avatar: 'https://img.yzcdn.cn/contract-avatar.png' } }) : Response.json({ code: 500, data: null });
    throw Error('Unexpected network request in isolated contract test');
 };
 mf = new Miniflare(convertV4MiniflareOptions({ workers: [
  {name: 'zdwifi-auth', modules: true, modulesRoot: temporary, scriptPath: path.join(temporary, 'auth.mjs'), compatibilityDate: '2026-09-01', routes: [origin+'/*'], d1Databases: {AUTH_DB:'isolated-contract-auth'}, bindings: authEnv, outboundService: upstream},
  ...Object.entries(sites).map(([id, address]) => ({
   name: id, routes: [address+'/*'], modules: true, modulesRoot: temporary, scriptPath: path.join(temporary, 'plugin.mjs'), compatibilityDate: '2026-09-01',
   compatibilityFlags: ['nodejs_compat'],
   d1Databases: { DB: 'isolated-' + id + '-business', ADMIN_AUTH_DB: 'isolated-' + id + '-admins' },
   serviceBindings: { AUTH_SERVICE: 'zdwifi-auth', ASSETS: async () => new Response('isolated-assets') },
   bindings: { APP_ENV: 'production', APP_ORIGIN: address, SSO_ENABLED: 'true', SSO_ORIGIN: origin, SSO_CLIENT_SECRET: keys[id], MASTER_KEY: 'isolated-business-master-key-000000000000', PHONE_HMAC_KEY: 'isolated-business-phone-key-000000000000' },
   outboundService: () => { throw Error('Business sites must only call the local auth Service Binding'); },
  })),
 ] }));
 async function migrate(db, directory) {
  for (const file of (await readdir(directory)).filter(v => v.endsWith('.sql')).sort()) {
   const sql = await readFile(path.join(directory, file), 'utf8');
   await db.batch(require('wrangler').unstable_splitSqlQuery(sql).map(v => db.prepare(v)));
  }
 }
 await migrate(await mf.getD1Database('AUTH_DB', 'zdwifi-auth'), path.join(authPath, 'auth-migrations'));
 for (const name of Object.keys(sites)) await migrate(await mf.getD1Database('DB', name), path.join(root, 'migrations'));
 const auth = await mf.getWorker('zdwifi-auth');
 const workers = Object.fromEntries(await Promise.all(Object.keys(sites).map(async id => [id, await mf.getWorker(id)])));
 async function call(id, route, method = 'GET', session, input) {
  return workers[id].fetch(sites[id] + route, { method, redirect: 'manual', headers: { ...(session ? { Cookie: session } : {}), ...(method === 'POST' ? { Origin: sites[id], 'Content-Type': 'application/json' } : {}) }, ...(input ? { body: JSON.stringify(input) } : {}) });
 }
 async function begin(id, silent = false, rootCookie) {
  const start = await call(id, '/api/login', 'POST', undefined, { next: '/me', silent }); assert.equal(start.status, 200);
  const attempt = cookie(start, '__Host-plugin_store_sso_attempt'); assert.ok(attempt);
  const response = await auth.fetch((await start.json()).authorizationUrl, { redirect: 'manual', headers: { 'User-Agent': ua, ...(rootCookie ? { Cookie: rootCookie } : {}) } });
  assert.equal(response.status, 303);
  return { attempt, response };
 }
 // Authenticate on another participating site first, then reuse the root session on plugin.
 const other = await begin('second');
 const oauth = new URL(other.response.headers.get('Location'));
 const back = await auth.fetch(origin + '/api/customer/oauth/callback?' + new URLSearchParams({ state: oauth.searchParams.get('state'), code: 'isolated-youzan-code' }), {
  redirect: 'manual', headers: { Cookie: cookie(other.response, '__Host-zdwifi_oauth_browser'), 'User-Agent': ua },
 });
 assert.equal(back.status, 303);
 const rootCookie = cookie(back, '__Host-zdwifi_sso'); assert.ok(rootCookie);
 const otherFinish = await workers.second.fetch(back.headers.get('Location'), { redirect: 'manual', headers: { Cookie: other.attempt } });
 assert.equal(otherFinish.status, 303);
 const otherCookie = cookie(otherFinish, '__Host-plugin_store_user'); assert.ok(otherCookie);
 const plugin = await begin('plugin', true, rootCookie);
 const callback = plugin.response.headers.get('Location'); assert.equal(new URL(callback).origin, sites.plugin);
 const wrongBrowser = await workers.plugin.fetch(callback, { redirect: 'manual' });
 assert.match(wrongBrowser.headers.get('Location'), /login_error=1/);
 const finish = await workers.plugin.fetch(callback, { redirect: 'manual', headers: { Cookie: plugin.attempt } });
 assert.equal(finish.headers.get('Location'), sites.plugin + '/me');
 const pluginCookie = cookie(finish, '__Host-plugin_store_user'); assert.ok(pluginCookie); assert.notEqual(pluginCookie, otherCookie);
 const replay = await workers.plugin.fetch(callback, { redirect: 'manual', headers: { Cookie: plugin.attempt } });
 assert.match(replay.headers.get('Location'), /login_error=1/);
 const first = await (await call('plugin', '/api/session', 'GET', pluginCookie)).json();
 const second = await (await call('second', '/api/session', 'GET', otherCookie)).json();
 assert.equal(first.user.id, second.user.id); assert.equal(first.user.display_name, '联调用户'); assert.equal(first.admin, null);
 assert.equal((await (await call('plugin', '/api/session', 'GET', pluginCookie)).json()).user.id, first.user.id);
 assert.equal((await call('plugin', '/api/studio/overview', 'GET', pluginCookie)).status, 401);
 const profile = await call('plugin', '/api/account/profile/sync', 'POST', pluginCookie, {}); assert.equal(profile.status, 200);
 assert.equal((await profile.json()).user.avatar_url, 'https://img.yzcdn.cn/contract-avatar.png');
 // An upstream profile outage must not revoke identity; a later background request repairs both sites' display data.
 const authDb = await mf.getD1Database('AUTH_DB', 'zdwifi-auth');
 await authDb.prepare('UPDATE global_user_profiles SET synced_at=?').bind(Date.now() - 61000).run();
 profileAvailable = false;
 const unavailable = await call('plugin', '/api/account/profile/sync', 'POST', pluginCookie, {});
 assert.equal(unavailable.status, 503); assert.equal((await unavailable.json()).code, 'profile_unavailable');
 assert.equal(unavailable.headers.get('Set-Cookie'), null);
 assert.equal((await (await call('plugin', '/api/session', 'GET', pluginCookie)).json()).user.display_name, '联调用户');
 profileAvailable = true; profileName = '自动更新资料';
 const recovered = await call('plugin', '/api/account/profile/sync', 'POST', pluginCookie, {});
 assert.equal(recovered.status, 200); assert.equal((await recovered.json()).user.display_name, profileName);
 for (const [id, session] of [['plugin', pluginCookie], ['second', otherCookie]]) {
  const current = await (await call(id, '/api/session', 'GET', session)).json();
  assert.equal(current.user.id, first.user.id); assert.equal(current.user.display_name, profileName);
 }
 const wrongSite = await call('plugin', '/api/me', 'GET', otherCookie); assert.equal(wrongSite.status, 401);
 assert.match(wrongSite.headers.get('Set-Cookie'), /Max-Age=0/);
 for (const id of Object.keys(sites)) {
  const db = await mf.getD1Database('DB', id);
  assert.equal((await db.prepare("SELECT id FROM users WHERE identity_kind='sso'").first()).id, first.user.id);
  assert.equal((await db.prepare("SELECT COUNT(*) n FROM sessions WHERE kind='user'").first()).n, 0);
 }
 assert.deepEqual(upstreamCalls, ['buyer-token', 'shop-token', 'buyer-profile', 'buyer-profile', 'buyer-profile']);
 assert.equal((await call('plugin', '/api/logout', 'POST', pluginCookie, {})).status, 200);
 for (const [id, session] of [['plugin', pluginCookie], ['second', otherCookie]]) {
  const response = await call(id, '/api/me', 'GET', session); assert.equal(response.status, 401); assert.match(response.headers.get('Set-Cookie'), /Max-Age=0/);
 }
 assert.equal((await auth.fetch(origin + '/api/auth/session', { headers: { Cookie: rootCookie } })).status, 401);
 console.log('PASS: actual auth Worker + two local business Workers; login, profile, shared ID, silent SSO, refresh, callback replay/browser binding, site isolation, global logout and admin isolation. Youzan replies simulated; no production calls.');
} finally {
 await mf?.dispose();
 await rm(temporary, { recursive: true, force: true });
}
