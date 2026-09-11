import js from '@eslint/js';
import ts from 'typescript-eslint';
import vue from 'eslint-plugin-vue';
import globals from 'globals';
export default ts.config({ignores:['dist/**','vendor/**','node_modules/**','.wrangler/**','test-results/**','playwright-report/**']},js.configs.recommended,...ts.configs.recommended,...vue.configs['flat/recommended'],{files:['**/*.{ts,vue,mjs}'],languageOptions:{globals:{...globals.browser,...globals.node},parserOptions:{parser:ts.parser}},rules:{'@typescript-eslint/no-explicit-any':'off','@typescript-eslint/no-unused-vars':['error',{argsIgnorePattern:'^_',varsIgnorePattern:'^_'}],'vue/multi-word-component-names':'off','vue/html-self-closing':'off','vue/max-attributes-per-line':'off','vue/singleline-html-element-content-newline':'off'}});
