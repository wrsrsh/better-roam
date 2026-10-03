(() => {
  if (window.top !== window || location.origin !== 'https://roamresearch.com') return;
  const css = __THEME_CSS__;
  function install() {
    const style = document.createElement('style');
    style.id = 'roam-desktop-theme';
    style.textContent = css;
    const update = () => {
      const enabled = location.hash.startsWith('#/app/');
      style.disabled = !enabled;
      if (enabled) {
        // Suppress the Depot copy only in this webview, without changing the graph.
        document.head.querySelectorAll('style[id^="roamstudio-"]').forEach(node => { if (node.sheet) node.sheet.disabled = true; });
      }
      if (!style.isConnected) document.head.appendChild(style);
    };
    update();
    new MutationObserver(update).observe(document.head, {childList: true});
    window.addEventListener('hashchange', update);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, {once:true});
  else install();
})();
