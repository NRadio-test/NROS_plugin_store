import { spawnSync } from 'node:child_process';
import { readdir,readFile,rm } from 'node:fs/promises';
import path from 'node:path';
const result=spawnSync(process.execPath,['node_modules/vite/bin/vite.js','build'],{stdio:'inherit',env:{...process.env,WRANGLER_LOG_PATH:'.wrangler/logs',WRANGLER_SEND_METRICS:'false'}});if(result.status!==0)process.exit(result.status??1);
// Vite 会为本地预览复制 .dev.vars；正式产物不携带这份文件。
async function files(directory){const values=[];for(const entry of await readdir(directory,{withFileTypes:true})){const p=path.join(directory,entry.name);if(entry.isDirectory())values.push(...await files(p));else values.push(p);}return values;}
for(const p of await files('dist'))if(path.basename(p)==='.dev.vars')await rm(p);
let secrets=[];try{secrets=(await readFile('.dev.vars','utf8')).split('\n').filter(l=>/^(MASTER_KEY|PHONE_HMAC_KEY|GITHUB_TOKEN)=/.test(l)).map(l=>l.slice(l.indexOf('=')+1).trim()).filter(v=>v.length>12);}catch(error){if(error.code!=='ENOENT')throw error;}
for(const p of await files('dist')){const data=await readFile(p,'utf8');if(secrets.some(v=>data.includes(v))||['e2e-admin','e2e-only-fixture-key','isolated-fixture-model','/__test/mode/'].some(v=>data.includes(v)))throw new Error('生产产物隔离检查失败：包含本地密钥或测试实现（内容不显示）');}
console.log('生产产物隔离检查通过：无本地密钥文件或测试入口。');
