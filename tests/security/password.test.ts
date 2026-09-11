import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '../../worker/security';

describe('管理员密码散列兼容导入格式', () => {
 it('生成 pbkdf2-sha256$600000 的 base64url 记录且可被 verifyPassword 验证', async () => {
  const encoded = await hashPassword('isolated-admin-password-1');
  expect(encoded).toMatch(/^pbkdf2-sha256\$600000\$[A-Za-z0-9_-]{22}\$[A-Za-z0-9_-]{43}$/);
  expect(encoded).not.toContain('isolated-admin-password-1');
  expect(await verifyPassword('isolated-admin-password-1', encoded)).toBe(true);
  expect(await verifyPassword('isolated-admin-password-2', encoded)).toBe(false);
 });

 it('同一口令每次使用独立盐，且任何篡改都无法通过验证', async () => {
  const first = await hashPassword('isolated-admin-password-1');
  const second = await hashPassword('isolated-admin-password-1');
  expect(first).not.toBe(second);
  expect(await verifyPassword('isolated-admin-password-1', first)).toBe(true);
  expect(await verifyPassword('isolated-admin-password-1', second)).toBe(true);
  const parts = first.split('$');
  // 改动首位字符必然改变派生字节（末位字符含有会被忽略的填充位）。
  const flipped = (parts[3]![0] === 'A' ? 'B' : 'A') + parts[3]!.slice(1);
  expect(await verifyPassword('isolated-admin-password-1', [...parts.slice(0, 3), flipped].join('$'))).toBe(false);
  expect(await verifyPassword('isolated-admin-password-1', first.replace('$600000$', '$100000$'))).toBe(false);
  expect(await verifyPassword('isolated-admin-password-1', first.replace('pbkdf2-sha256', 'pbkdf2-sha512'))).toBe(false);
 });

 it('拒绝空口令与超出上限的输入，不写入任何弱散列', async () => {
  await expect(hashPassword('')).rejects.toThrow('密码格式错误');
  await expect(hashPassword('a'.repeat(1025))).rejects.toThrow('密码格式错误');
  await expect(hashPassword(undefined as unknown as string)).rejects.toThrow('密码格式错误');
  expect(await verifyPassword('isolated-admin-password-1', 'not-a-verifier')).toBe(false);
 });
});
