import { spawnSync } from 'node:child_process';
const env={...process.env,WRANGLER_LOG_PATH:'.wrangler/logs',WRANGLER_SEND_METRICS:'false'};
const checks=[['Vue 类型检查',['node_modules/vue-tsc/bin/vue-tsc.js','--noEmit']],['Worker 类型检查',['node_modules/typescript/bin/tsc','--noEmit','-p','tsconfig.worker.json']],['ESLint',['node_modules/eslint/bin/eslint.js','src','worker','tests','scripts','*.ts']],['Workers 单元与集成测试',['node_modules/vitest/vitest.mjs','run']],['管理员导入工具测试',['--test','scripts/admin.test.mjs']],['颜色对比度',['scripts/check-contrast.mjs']],['生产构建',['scripts/build.mjs']]];
checks.splice(4,0,['开发热更新启动回归',['--test','scripts/vite-hmr.test.mjs']]);
for(const [label,args] of checks){console.log(`\n${label}`);const result=spawnSync(process.execPath,args,{stdio:'inherit',env});if(result.status!==0)process.exit(result.status??1);}
console.log('\n全部检查通过。浏览器端到端另运行 pnpm run test:e2e。');
