/* 原型交互脚本：主题切换、标签页、状态切换与演示交互。原型专用，不进入生产构建。 */
(function () {
  var KEY = 'zd-proto-theme';

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    var label = document.querySelector('[data-theme-label]');
    if (label) label.textContent = theme === 'dark' ? '深色' : '浅色';
  }
  var saved = null;
  try { saved = localStorage.getItem(KEY); } catch (error) { saved = null; }
  applyTheme(saved === 'light' ? 'light' : 'dark');

  function setTheme(next) {
    try { localStorage.setItem(KEY, next); } catch (error) { /* 忽略存储失败 */ }
    applyTheme(next);
    document.querySelectorAll('[data-theme-toggle] use').forEach(function (use) {
      use.setAttribute('href', next === 'dark' ? '#ph-moon' : '#ph-sun');
    });
  }

  document.addEventListener('click', function (event) {
    var pick = event.target.closest && event.target.closest('[data-theme-pick]');
    if (pick) { setTheme(pick.getAttribute('data-theme-pick')); return; }
    var toggle = event.target.closest && event.target.closest('[data-theme-toggle]');
    if (toggle) setTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
  });

  document.addEventListener('click', function (event) {
    var tab = event.target.closest && event.target.closest('[role="tab"]');
    if (!tab) return;
    var list = tab.closest('[role="tablist"]');
    if (!list) return;
    list.querySelectorAll('[role="tab"]').forEach(function (item) { item.setAttribute('aria-selected', 'false'); });
    tab.setAttribute('aria-selected', 'true');
    var id = tab.getAttribute('aria-controls');
    if (!id) return;
    var scope = list.parentElement;
    scope.querySelectorAll('[role="tabpanel"]').forEach(function (panel) { panel.hidden = panel.id !== id; });
  });

  document.addEventListener('click', function (event) {
    var fav = event.target.closest && event.target.closest('[data-demo-favorite]');
    if (fav) {
      var on = fav.getAttribute('aria-pressed') === 'true';
      fav.setAttribute('aria-pressed', on ? 'false' : 'true');
      fav.setAttribute('aria-label', on ? '收藏' : '取消收藏');
      var use = fav.querySelector('use');
      if (use) use.setAttribute('href', on ? '#ph-heart' : '#ph-heart-fill');
      return;
    }
    var load = event.target.closest && event.target.closest('[data-demo-loading]');
    if (load) {
      var original = load.innerHTML;
      load.setAttribute('disabled', 'disabled');
      load.innerHTML = '<svg class="icon icon--sm" aria-hidden="true"><use href="#ph-spinner-gap"></use></svg>正在检查来源';
      setTimeout(function () { load.removeAttribute('disabled'); load.innerHTML = original; }, 1400);
    }
  });

  document.addEventListener('click', function (event) {
    var chip = event.target.closest && event.target.closest('[data-state-set]');
    if (!chip) return;
    var group = chip.closest('[data-state-group]');
    if (!group) return;
    var wanted = chip.getAttribute('data-state-set');
    group.querySelectorAll('[data-state]').forEach(function (node) { node.hidden = node.getAttribute('data-state') !== wanted; });
    group.querySelectorAll('[data-state-set]').forEach(function (node) { node.setAttribute('aria-pressed', node === chip ? 'true' : 'false'); });
  });
})();
