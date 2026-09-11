import { spawnSync } from 'node:child_process';
const env={...process.env,WRANGLER_LOG_PATH:'.wrangler/logs',WRANGLER_SEND_METRICS:'false'};
for(const args of [['scripts/build.mjs'],['node_modules/@playwright/test/cli.js','test']]){const result=spawnSync(process.execPath,args,{stdio:'inherit',env});if(result.status!==0)process.exit(result.status??1);}
