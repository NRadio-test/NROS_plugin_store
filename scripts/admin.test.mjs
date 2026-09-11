import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pbkdf2Sync, randomBytes } from 'node:crypto';
import { strongPassword, validVerifier, validateExport, verify } from './admin.mjs';
function verifier() {
 const salt=randomBytes(16),password='isolated-random-T9!x7Q2n';
 return {password,hash:`pbkdf2-sha256$100000$${salt.toString('base64url')}$${pbkdf2Sync(password,salt,100000,32,'sha256').toString('base64url')}`};
}
test('管理员可信验证导入兼容现行 PBKDF2 且只允许最小账号字段',()=>{
 const value=verifier();assert.equal(validVerifier(value.hash),true);assert.equal(verify(value.password,value.hash),true);assert.equal(verify('incorrect',value.hash),false);
 assert.deepEqual(validateExport([{id:'old-id',username:'operator',password_hash:value.hash,must_change_password:0}]),[{username:'operator',password_hash:value.hash}]);
 assert.throws(()=>validateExport([{username:'operator',password_hash:value.hash,must_change_password:0,sessions:[]}]),/禁止业务数据或会话/);
 assert.throws(()=>validateExport([{username:'operator',password_hash:value.hash,must_change_password:1}]),/当前有效/);
 assert.throws(()=>validateExport([{username:'operator',password_hash:value.hash}]),/当前有效/);
});
test('新设密拒绝弱默认值且恶意哈希参数不会执行昂贵派生',()=>{
 assert.equal(strongPassword('admin123456789012345'),false);assert.equal(strongPassword('short'),false);assert.equal(strongPassword('4VR!k7m#u3Pz8$wQ'),true);
 const value=verifier();assert.equal(validVerifier(value.hash.replace('$100000$','$999999999$')),false);assert.equal(validVerifier('malformed'),false);
});
