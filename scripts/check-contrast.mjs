import { readFile, writeFile, mkdir } from 'node:fs/promises';

// 读取设计令牌并校验关键前景/背景组合的可读性对比度（WCAG AA 正文 4.5:1）。
const css = await readFile('src/styles/tokens.css', 'utf8');

function block(selector) {
  const start = css.indexOf(selector + ' {');
  if (start < 0) throw new Error(`缺少令牌块：${selector}`);
  const open = css.indexOf('{', start);
  const end = css.indexOf('\n}', open);
  return css.slice(open + 1, end);
}
function tokens(selector) {
  return Object.fromEntries([...block(selector).matchAll(/--([a-z-]+):\s*(#[a-f0-9]{6})/g)].map(match => [match[1], match[2]]));
}
const luminance = hex => {
  const channels = hex.slice(1).match(/../g).map(value => Number.parseInt(value, 16) / 255)
    .map(value => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
};
function ratio(foreground, background) {
  const a = luminance(foreground), b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

const PAIRS = [
  ['正文', 'text-primary', 'bg-base'],
  ['正文卡片', 'text-primary', 'bg-card'],
  ['辅助文字', 'text-secondary', 'bg-card'],
  ['占位文字', 'text-tertiary', 'bg-card'],
  ['链接', 'primary-text', 'bg-card'],
  ['按钮文字', 'on-primary', 'primary'],
  ['按钮悬浮', 'on-primary', 'primary-fill-hover'],
  ['按钮按下', 'on-primary', 'primary-fill-active'],
  ['链接悬浮', 'primary-hover', 'bg-card'],
  ['主色徽章', 'primary-text', 'primary-surface'],
  ['成功徽章', 'success-text', 'success-surface'],
  ['警告徽章', 'warning-text', 'warning-surface'],
  ['危险徽章', 'danger-text', 'danger-surface'],
  ['信息徽章', 'info-text', 'info-surface'],
  ['中性徽章', 'text-secondary', 'bg-subtle'],
  ['反向文字', 'text-inverse', 'bg-inverse'],
  ['悬浮底文字', 'text-primary', 'bg-hover'],
];

const results = [];
for (const [theme, selector] of [['浅色', ':root'], ['深色', ':root.dark']]) {
  const values = tokens(selector);
  for (const [label, foregroundKey, backgroundKey] of PAIRS) {
    const foreground = values[foregroundKey];
    const background = values[backgroundKey];
    if (!foreground || !background) throw new Error(`${theme}${label} 令牌缺失：${foregroundKey}/${backgroundKey}`);
    const value = Number(ratio(foreground, background).toFixed(2));
    results.push({ name: theme + label, foreground, background, contrast: value, passed: value >= 4.5 });
  }
}

await mkdir('docs/evidence', { recursive: true });
await writeFile('docs/evidence/contrast.json', JSON.stringify(results, null, 2) + '\n');
for (const item of results) console.log(`${item.name} ${item.contrast}:1 ${item.passed ? '通过' : '失败'}`);
const failed = results.filter(item => !item.passed);
if (failed.length) {
  console.error(`\n${failed.length} 组对比度未达到 4.5:1`);
  process.exit(1);
}
console.log(`\n${results.length} 组颜色对比度全部通过 4.5:1。`);
