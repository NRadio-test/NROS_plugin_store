import { readFile, writeFile, mkdir } from 'node:fs/promises';

// 校验设计令牌的关键前景/背景组合对比度（WCAG AA 正文 4.5:1）。
// 令牌来源：src/styles/tokens.css（深色为基准，浅色同语义派生）。
const css = await readFile('src/styles/tokens.css', 'utf8');

function block(selector) {
  const start = css.indexOf(selector + ' {');
  if (start < 0) throw new Error(`缺少令牌块：${selector}`);
  const open = css.indexOf('{', start);
  const end = css.indexOf('\n}', open);
  return css.slice(open + 1, end);
}
function tokens(selector) {
  return Object.fromEntries([...block(selector).matchAll(/--([a-z0-9-]+):\s*(#[a-f0-9]{6})\b/g)].map(match => [match[1], match[2]]));
}
const luminance = hex => {
  const channels = hex.slice(1).match(/../g).map(value => Number.parseInt(value, 16) / 255)
    .map(value => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
};
const ratio = (foreground, background) => {
  const a = luminance(foreground), b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
};

const PAIRS = [
  ['正文/页面', 'text', 'bg'],
  ['正文/表面', 'text', 'surface'],
  ['次文字/表面', 'text-2', 'surface'],
  ['弱化文字/表面', 'text-3', 'surface'],
  ['次文字/抬升面', 'text-2', 'surface-raised'],
  ['弱化文字/抬升面', 'text-3', 'surface-raised'],
  ['链接/页面', 'signal', 'bg'],
  ['链接/表面', 'signal', 'surface'],
  ['主按钮文字', 'on-signal', 'signal'],
  ['主按钮悬浮文字', 'on-signal', 'signal-hover'],
  ['成功/成功底', 'success', 'success-surface'],
  ['警告/警告底', 'warning', 'warning-surface'],
  ['失败/失败底', 'danger', 'danger-surface'],
  ['中性状态/抬升面', 'neutral-status', 'surface-raised'],
  ['选中文字/选中底', 'signal-text', 'signal-surface'],
];

const results = [];
for (const [theme, selector] of [['深色', ':root'], ['浅色', ":root[data-theme='light']"]]) {
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
console.log(`\n${results.length} 组颜色对比度全部通过 4.5:1（令牌来源 src/styles/tokens.css）。`);
