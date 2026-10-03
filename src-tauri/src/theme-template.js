(() => {
  if (window.top !== window || location.origin !== 'https://roamresearch.com') return;
  const css = __THEME_CSS__;
  function install() {
    // Repeated injection must not install duplicate styles or observers.
    if (document.getElementById('roam-desktop-theme')) return;
    const style = document.createElement('style');
    style.id = 'roam-desktop-theme';
    style.textContent = css;
    const update = () => {
      const enabled = location.hash.startsWith('#/app/');
      if (style.disabled === enabled) style.disabled = !enabled;
      if (!style.isConnected) document.head.appendChild(style);
      if (enabled) {
        // Keep the bundled theme, but honor these Depot appearance modules.
        document.head.querySelectorAll('style[id^="roamstudio-"]').forEach(node => {
          const allowed = ['roamstudio-css-hide-logo', 'roamstudio-css-topbar-borders'].includes(node.id);
          if (node.sheet && node.sheet.disabled === allowed) node.sheet.disabled = !allowed;
          // Module variables must follow the bundled theme in the cascade.
          if (allowed && (node.compareDocumentPosition(style) & 4)) document.head.appendChild(node);
        });
      }
    };
    update();
    // Roam updates head metadata too. Only theme insertion/removal warrants a
    // stylesheet scan; editor updates and unrelated head nodes do no work.
    new MutationObserver(records => {
      const relevant = records.some(record =>
        [...record.addedNodes, ...record.removedNodes].some(node =>
          node === style || node.matches?.('style[id^="roamstudio-"]')));
      if (relevant) update();
    }).observe(document.head, {childList: true});
    window.addEventListener('hashchange', update);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, {once:true});
  else install();
})();
