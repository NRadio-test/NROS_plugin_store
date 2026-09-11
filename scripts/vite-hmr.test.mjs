import { test } from 'node:test';
import assert from 'node:assert/strict';
import config from '../vite.config.ts';

test('Vue 在 buildStart 前收到文件变化时不崩溃', async () => {
  const plugin = config.plugins.flat(Infinity).find(item => item?.name === 'vite:vue');
  assert.ok(plugin);
  // Vite/Workers 启动时可能先收到文件监听事件，尚未调用 buildStart。
  const events = [];
  await plugin.handleHotUpdate({
    file: '/isolated/startup-generated.d.ts',
    modules: [],
    read: async () => '',
    server: { ws: { send: event => events.push(event) } },
  });
  assert.equal(events[0]?.event, 'file-changed');
});
