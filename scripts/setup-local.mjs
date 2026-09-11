import { randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
const contents=`APP_ENV=development\nAPP_ORIGIN=http://127.0.0.1:5173\nMASTER_KEY=${randomBytes(32).toString('base64url')}\nPHONE_HMAC_KEY=${randomBytes(32).toString('base64url')}\nGITHUB_TOKEN=\n`;
try{await writeFile('.dev.vars',contents,{flag:'wx',mode:0o600});console.log('已生成独立本地随机密钥（未显示），请按需填写GitHub Token。');}catch(e){if(e.code!=='EEXIST')throw e;console.log('保留现有 .dev.vars，不覆盖本地配置。');}
const result=spawnSync(process.execPath,['node_modules/wrangler/bin/wrangler.js','d1','migrations','apply','DB','--local'],{stdio:'inherit',env:{...process.env,WRANGLER_LOG_PATH:'.wrangler/logs',WRANGLER_SEND_METRICS:'false'}});
process.exit(result.status??1);
