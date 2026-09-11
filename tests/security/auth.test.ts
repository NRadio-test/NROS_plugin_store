import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import type { Env } from '../../worker/contracts';
import { assertOrigin, createSession, decrypt, encrypt, getSession, hash, hmac, logoutSession, normalizePhone, rateLimit, verifyPassword } from '../../worker/security';
const bindings = env as unknown as Env;
describe('真实 Workers 密码、密钥、会话', () => {
 it('号码规范化不混淆国际区号且拒绝伪标识', () => {
  expect(normalizePhone('138 0013 8000')).toBe('+8613800138000');
  expect(normalizePhone('00853 6612 3456')).toBe('+85366123456');
  expect(() => normalizePhone('66123456')).toThrow();
  expect(() => normalizePhone('https://example.com')).toThrow();
 });
 it('加密可还原但错误主密钥/篡改不能解密', async () => {
  const encrypted = await encrypt(bindings.MASTER_KEY, 'isolated-secret');
  expect(encrypted).not.toContain('isolated-secret');
  expect(await decrypt(bindings.MASTER_KEY, encrypted)).toBe('isolated-secret');
  await expect(decrypt('different-master-key-with-more-than-32-characters', encrypted)).rejects.toThrow();
  await expect(hmac('', 'value')).rejects.toThrow();
  expect(await hmac(bindings.PHONE_HMAC_KEY, '13800138000')).not.toContain('13800138000');
 });
 it.each([100000,600000])('兼容旧站 PBKDF2 %i 参数并拒绝错误密码/格式', async (iterations) => {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode('test-random-password-with-length'), 'PBKDF2', false, ['deriveBits']);
  const bits = new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt,iterations},material,256));
  const encode = (bytes:Uint8Array) => btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
  const verifier = `pbkdf2-sha256$${iterations}$${encode(salt)}$${encode(bits)}`;
  expect(await verifyPassword('test-random-password-with-length', verifier)).toBe(true);
  expect(await verifyPassword('incorrect', verifier)).toBe(false);
  expect(await verifyPassword('test-random-password-with-length', verifier.replace(`$${iterations}$`, '$1$'))).toBe(false);
 });
 it('普通与管理员独立 cookie，服务端仅保存随机 token 摘要且退出失效', async () => {
  const production = {...bindings,APP_ENV:'production'};
  const issued = await createSession(production,'user','isolated-user');
  expect(issued.cookie).toContain('__Host-plugin_store_user=');
  expect(issued.cookie).toContain('HttpOnly'); expect(issued.cookie).toContain('Secure'); expect(issued.cookie).not.toContain('Domain=');
  const request = new Request('https://store.example.com/api/session',{headers:{cookie:issued.cookie}});
  expect((await getSession(request,production,'user'))?.subjectId).toBe('isolated-user');
  expect(await getSession(request,production,'admin')).toBeNull();
  const row = await bindings.DB.prepare('SELECT token_hash FROM sessions WHERE subject_id=?').bind('isolated-user').first<{token_hash:string}>();
  expect(row?.token_hash).toBe(await hash(issued.token)); expect(row?.token_hash).not.toBe(issued.token);
  await logoutSession(request,production,'user'); expect(await getSession(request,production,'user')).toBeNull();
 });
 it('拒绝无 Origin、跨站写请求并原子限流', async () => {
  expect(() => assertOrigin(new Request('https://store.example.com/api/login',{method:'POST'}),bindings)).toThrow();
  expect(() => assertOrigin(new Request('https://store.example.com/api/login',{method:'POST',headers:{Origin:'https://evil.com'}}),bindings)).toThrow();
  expect(() => assertOrigin(new Request('https://store.example.com/api/login',{method:'POST',headers:{Origin:bindings.APP_ORIGIN}}),bindings)).not.toThrow();
  const key = crypto.randomUUID();
  const results = await Promise.allSettled(Array.from({length:4},()=>rateLimit(bindings,key,2,60)));
  expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(2);
 });
});
