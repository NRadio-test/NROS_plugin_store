#!/usr/bin/env node
import { createHash, pbkdf2Sync, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { readFile, stat, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const deny = new Set(['2547d75a715e92ca38fb9d0cdf2fb9a8b3ede8f37b514909d82fcd34dfdc8a4a','c70e8c9cac000915426c6abc7637202a0805aea22637e69c4cff295bcc9ffa35','9b0d22c5e7f3e09d8df4e99079c7707df8f1e39cd408c6bd4d8e5733cd846cd3','871b641bc79b248fe91d4303eede84a82c960a5bf23486a494f672e27514e9bc','e2b1a3ffe3f3e2a95ebf60a665abb36d347ca66fcc585c03bed39a018bdbd01e','060ecdcbea9b724898f266dd73771832e562d0ec1b38780b4d19f8f9f31351dc','6c483503cb612edd25f43cfd9ea4a2e1b2e6b4bd0299e4d618d96271c19a30af','bc143f16ab1b1fac50e11f000060ce699f5a70ce27976e0276d5cddf99ef9741']);
export function validVerifier(encoded) {
 if (typeof encoded !== 'string' || deny.has(createHash('sha256').update(encoded).digest('hex'))) return false;
 const parts = encoded.split('$');
 return parts.length === 4 && parts[0] === 'pbkdf2-sha256' && /^\d+$/.test(parts[1]) && Number(parts[1]) >= 100000 && Number(parts[1]) <= 2000000 && /^[A-Za-z0-9_-]+$/.test(parts[2]) && Buffer.from(parts[2], 'base64url').length >= 16 && Buffer.from(parts[2], 'base64url').length <= 128 && /^[A-Za-z0-9_-]+$/.test(parts[3]) && Buffer.from(parts[3], 'base64url').length === 32;
}
export function verify(password, encoded) {
 if (!validVerifier(encoded)) return false;
 const [, iterations, salt, expected] = encoded.split('$');
 return timingSafeEqual(pbkdf2Sync(password, Buffer.from(salt, 'base64url'), Number(iterations), 32, 'sha256'), Buffer.from(expected, 'base64url'));
}
export function validateExport(data) {
 if (!Array.isArray(data) || data.length < 1 || data.length > 100) throw new Error('导出必须是 1–100 个管理员验证记录的数组');
 const names = new Set();
 return data.map(row => {
  if (!row || Object.keys(row).some(k => !['id','username','password_hash','must_change_password'].includes(k))) throw new Error('只允许账号验证字段，禁止业务数据或会话');
  if (typeof row.username !== 'string' || !/^[A-Za-z0-9_.@-]{1,64}$/.test(row.username) || names.has(row.username.toLowerCase())) throw new Error('用户名无效或重复');
  if (row.must_change_password !== 0 && row.must_change_password !== false) throw new Error('必须明确为当前有效、无需初始化的账号');
  if (!validVerifier(row.password_hash)) throw new Error('验证格式不支持或属于历史公开默认验证值');
  names.add(row.username.toLowerCase());
  return { username: row.username, password_hash: row.password_hash };
 });
}
export function strongPassword(password) {
 return typeof password === 'string' && password.length >= 14 && password.length <= 128 && !/(?:password|admin|123456|qwerty|changeme|default|zhangdao)/i.test(password) && new Set(password).size >= 8;
}
function hidden(prompt) {
 if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('必须在交互终端隐藏输入密码，不接受命令行或管道密码');
 process.stdout.write(prompt);
 process.stdin.setRawMode(true); process.stdin.resume(); process.stdin.setEncoding('utf8');
 return new Promise((resolve, reject) => {
  let value = '';
  function done() { process.stdin.setRawMode(false); process.stdin.pause(); process.stdin.off('data', onData); process.stdout.write('\n'); }
  function onData(chunk) {
   for (const c of chunk) {
    if (c === '\u0003') { done(); reject(new Error('已取消')); return; }
    if (c === '\r' || c === '\n') { done(); resolve(value); return; }
    if (c === '\u007f' || c === '\b') value = value.slice(0,-1);
    else if (c >= ' ' && value.length < 1024) value += c;
   }
  }
  process.stdin.on('data', onData);
 });
}
const sql = value => "'" + String(value).replaceAll("'", "''") + "'";
async function main() {
 const args = process.argv.slice(2), mode = args[0];
 if (/"binding"\s*:\s*"ADMIN_AUTH_DB"/.test(await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8'))) {
  if (args.includes('--help') || !mode) { console.log('管理员认证使用留言箱 ADMIN_AUTH_DB；请在留言箱管理账号与密码。商店导入/设密命令已停用。'); return; }
  throw new Error('共享认证已启用，请在留言箱管理账号与密码；商店不会导入或重置账号。');
 }
 if (args.includes('--help') || !mode) { console.log('用法：pnpm admin set --username NAME --local\n     pnpm admin import --trusted-current-export /安全路径/admins.json --local\n远程由管理员自行将 --local 换为 --remote --confirm-remote；本工具不会读取旧站数据库或复制会话。'); return; }
 const flag = key => { const index = args.indexOf(key); return index >= 0 ? args[index + 1] : undefined; };
 const allowedFlags = new Set(['--username','--trusted-current-export','--local','--remote','--confirm-remote']);
 for (const arg of args.slice(1)) if (arg.startsWith('--') && !allowedFlags.has(arg)) throw new Error('未知参数');
 const remote = args.includes('--remote');
 if (remote === args.includes('--local') || (remote && !args.includes('--confirm-remote'))) throw new Error('必须选择 --local 或显式 --remote --confirm-remote');
 let rows;
 if (mode === 'import') {
  const path = flag('--trusted-current-export');
  if (!path) throw new Error('必须显式提供当前可信账号验证导出');
  const info = await stat(path);
  if (info.size > 128 * 1024 || (info.mode & 0o077)) throw new Error('导出须小于 128 KiB 且权限为 600');
  rows = validateExport(JSON.parse(await readFile(path, 'utf8')));
  for (const row of rows) if (!verify(await hidden(`确认 ${row.username} 当前密码（不显示）：`), row.password_hash)) throw new Error('当前密码验证失败，未写入');
 } else if (mode === 'set') {
  const username = flag('--username');
  if (!username || !/^[A-Za-z0-9_.@-]{1,64}$/.test(username)) throw new Error('用户名格式无效');
  const password = await hidden('新密码（至少 14 字符，不显示）：');
  if (!strongPassword(password)) throw new Error('密码过弱或包含默认口令，请使用随机长密码');
  if (password !== await hidden('再次输入新密码：')) throw new Error('两次密码不一致');
  const salt = randomBytes(16), iterations = 100000;
  rows = [{ username, password_hash: `pbkdf2-sha256$${iterations}$${salt.toString('base64url')}$${pbkdf2Sync(password,salt,iterations,32,'sha256').toString('base64url')}` }];
 } else throw new Error('仅支持 set/import');
 const now = Date.now();
 const statements = rows.flatMap(row => [
  `INSERT INTO admins(id,username,password_hash,created_at,updated_at) VALUES(${sql(randomUUID())},${sql(row.username)},${sql(row.password_hash)},${now},${now}) ON CONFLICT(username) DO UPDATE SET password_hash=excluded.password_hash,updated_at=excluded.updated_at;`,
  `DELETE FROM sessions WHERE kind='admin' AND subject_id=(SELECT id FROM admins WHERE username=${sql(row.username)});`,
  `INSERT INTO audit(id,admin_id,action,target,created_at) VALUES(${sql(randomUUID())},NULL,'credential-${mode}',${sql(row.username)},${now});`,
 ]);
 const directory = await mkdtemp(join(tmpdir(), 'plugin-store-admin-'));
 try {
  const file = join(directory, 'credentials.sql');
  await writeFile(file, statements.join('\n'), { mode: 0o600 });
  const result = spawnSync('pnpm',['exec','wrangler','d1','execute','DB',remote ? '--remote':'--local','--file',file], { cwd: fileURLToPath(new URL('..', import.meta.url)), encoding: 'utf8', stdio: ['ignore','pipe','pipe'], env: {...process.env, WRANGLER_LOG_PATH: join(directory, 'private-wrangler.log'), WRANGLER_LOG: 'error', WRANGLER_SEND_METRICS: 'false'} });
  // Wrangler 的失败输出可能回显 SQL，故绝不将其写到终端或日志。
  if (result.status !== 0) throw new Error('D1 写入失败；敏感 SQL/输出已隐藏，请检查本地迁移或 Cloudflare 配置');
  console.log(`已${mode === 'import' ? '导入验证资料' : '设置密码'}：${rows.length} 个管理员；本商店原管理员会话已失效。未读取旧站会话。`);
 } finally { await rm(directory,{ recursive:true,force:true }); }
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main().catch(error => { console.error(error.message); process.exitCode = 1; });
