import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import * as compiler from 'vue/compiler-sfc';
import { cloudflare } from '@cloudflare/vite-plugin';
// 文件监听可能早于 buildStart；提前提供与 Vue 同版本的编译器。
export default defineConfig({plugins:[vue({ compiler }),cloudflare()],server:{port:5173}});
