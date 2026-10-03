(() => {
  if (window.top !== window || location.origin !== 'https://roamresearch.com') return;
  // Store only the graph route; graph data remains managed by Roam/WebKit.
  const routeKey = 'roam-desktop:last-graph';
  try {
    const saved = localStorage.getItem(routeKey);
    if ((location.hash === '' || location.hash === '#/' || location.hash === '#') && saved?.startsWith('#/app/')) {
      location.replace('/' + saved);
    }
  } catch (_) {}
  const rememberGraph = () => {
    if (location.hash.startsWith('#/app/')) {
      try { localStorage.setItem(routeKey, location.hash); } catch (_) {}
    }
  };
  rememberGraph();
  window.addEventListener('hashchange', rememberGraph);
  window.addEventListener('pagehide', rememberGraph);

  const openExternal = (url) => window.__TAURI__.core.invoke('open_external', { url });
  const external = (url) => ['http:', 'https:', 'mailto:', 'tel:'].includes(url.protocol)
    && url.origin !== location.origin;
  const followLink = (event) => {
    const anchor = event.composedPath().find(node => node instanceof Element && node.matches('a[href]'));
    if (!anchor || (event.type === 'auxclick' && event.button !== 1)) return;
    const url = new URL(anchor.href, location.href);
    if (!external(url)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    openExternal(url.href).catch(console.error);
  };
  document.addEventListener('click', followLink, true);
  document.addEventListener('auxclick', followLink, true);

  const sendKey = (key, code, keyCode) => {
    const target = document.activeElement || document.body;
    for (const type of ['keydown', 'keypress', 'keyup']) {
      const event = new KeyboardEvent(type, {
        key, code, metaKey: true, bubbles: true, cancelable: true
      });
      // WebKit ignores legacy keyCode/which constructor fields used by Roam.
      Object.defineProperties(event, {
        keyCode: {get: () => keyCode}, which: {get: () => keyCode}
      });
      target.dispatchEvent(event);
    }
  };
  const openPalette = () => {
    if (!document.querySelector('.rm-command-palette__menu')) sendKey('p', 'KeyP', 80);
  };
  window.__roamDesktopAction = (action) => {
    if (action === 'palette') { openPalette(); return; }
    if (action === 'search') {
      const input = document.querySelector('input[placeholder="Find or Create Page"]');
      if (input) { input.focus(); input.select(); }
      else sendKey('u', 'KeyU', 85);
      return;
    }
    if (action === 'settings') {
      if (document.querySelector('.rm-settings')) return;
      openPalette();
      let attempts = 0;
      const chooseSettings = () => {
        const entry = [...document.querySelectorAll('.rm-command-palette__menu .rm-menu-item')]
          .find(el => el.textContent.trim() === 'Open settings');
        if (entry) { entry.click(); return; }
        if (++attempts < 20) setTimeout(chooseSettings, 50);
        else console.warn('Roam settings command not available yet');
      };
      chooseSettings();
    }
  };
  // Capture before Roam's editor shortcuts (Cmd+K normally inserts a link).
  window.addEventListener('keydown', event => {
    if (!event.isTrusted || !event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
    const action = { ',': 'settings', k: 'palette', o: 'search' }[event.key.toLowerCase()];
    if (!action) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    window.__roamDesktopAction(action);
  }, true);
})();
