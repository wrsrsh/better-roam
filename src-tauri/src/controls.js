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

  const openExternal = (url) => {
    if (window.__TAURI__) return window.__TAURI__.core.invoke('open_external', { url });
    window.open(url, '_blank', 'noopener,noreferrer');
    return Promise.resolve();
  };
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
  // Settings/search use a palette command internally. Keep that intermediate
  // palette invisible so opening one dialog does not visibly open two.
  const openDialogCommand = () => {
    document.documentElement?.setAttribute('data-roam-desktop-dialog-command', '');
    openPalette();
  };
  const finishDialogCommand = () => {
    document.documentElement?.removeAttribute('data-roam-desktop-dialog-command');
  };
  // A title prompt keeps page creation explicit; Roam remains the data owner.
  const newPage = () => {
    if (document.getElementById('roam-desktop-new-page')) return;
    const dialog = document.createElement('dialog');
    dialog.id = 'roam-desktop-new-page';
    dialog.setAttribute('aria-labelledby', 'roam-desktop-new-page-title');
    dialog.innerHTML = '<form><h2 id="roam-desktop-new-page-title">New page</h2><label for="roam-desktop-page-title">Page title</label><input id="roam-desktop-page-title" name="title" placeholder="Give your page a name" required autocomplete="off"><p role="status"></p><footer><button type="button">Cancel</button><button type="submit">Create page <span aria-hidden="true">↵</span></button></footer></form>';
    const close = () => dialog.remove();
    dialog.addEventListener('cancel', close);
    dialog.querySelector('button[type="button"]').onclick = close;
    let busy = false;
    dialog.querySelector('form').onsubmit = async event => {
      event.preventDefault();
      if (busy) return;
      const title = dialog.querySelector('input').value.trim();
      if (!title) return;
      const api = window.roamAlphaAPI;
      if (!api?.util || !api?.ui?.mainWindow) {
        dialog.querySelector('[role="status"]').textContent = 'Wait for your graph to finish loading.';
        return;
      }
      busy = true;
      try {
        const uid = api.util.generateUID();
        const create = api.data?.page?.create || api.createPage;
        await create.call(api.data?.page || api, {page: {title, uid}});
        const createBlock = api.data?.block?.create || api.createBlock;
        await createBlock.call(api.data?.block || api, {location: {'parent-uid': uid, order: 0}, block: {uid: api.util.generateUID(), string: ''}});
        await api.ui.mainWindow.openPage({page: {uid}});
        close();
        focusContent(uid);
      } catch (error) {
        dialog.querySelector('[role="status"]').textContent = 'Could not create this page. Check whether the title already exists before trying again.';
      } finally { busy = false; }
    };
    document.body.append(dialog);
    dialog.showModal();
    dialog.querySelector('input').focus();
  };

  // Roam mounts its textarea asynchronously after navigation. Request editor
  // focus through its API and verify actual DOM focus before finishing.
  let focusGeneration = 0;
  const focusContent = (uid) => {
    const generation = ++focusGeneration;
    let attempts = 0;
    let arrived = false;
    const attempt = () => {
      if (generation !== focusGeneration) return;
      if (!location.hash.endsWith('/page/' + uid)) {
        if (!arrived && ++attempts < 40) setTimeout(attempt, 75);
        return;
      }
      arrived = true;
      const editor = document.querySelector('.roam-article textarea.rm-block-input, .roam-article textarea.rm-block__input');
      if (editor) { editor.focus(); return; }
      try { window.roamAlphaAPI?.ui?.mainWindow?.focusFirstBlock(); } catch (_) {}
      if (++attempts < 40) setTimeout(attempt, 75);
    };
    attempt();
  };
  let focusedPage = null;
  const focusEmptyPage = () => {
    const uid = location.hash.match(/\/page\/([^/?]+)/)?.[1];
    const page = document.querySelector('.roam-article .rm-title-display');
    if (!uid || !page || uid === focusedPage || document.getElementById('roam-desktop-new-page')) return;
    const blocks = document.querySelectorAll('.roam-article .roam-block');
    if (blocks.length !== 1 || blocks[0].textContent.trim()) return;
    if (document.activeElement?.matches?.('textarea, [contenteditable="true"]')) return;
    focusedPage = uid;
    focusContent(uid);
  };
  if (typeof MutationObserver !== 'undefined') {
    const observer = new MutationObserver(focusEmptyPage);
    const observe = () => {
      observer.observe(document.body, {childList: true, subtree: true});
      focusEmptyPage();
    };
    if (document.body) observe();
    else document.addEventListener('DOMContentLoaded', observe, {once: true});
  }
  window.__roamDesktopAction = (action) => {
    if (action === 'new-page') { newPage(); return; }
    if (action === 'palette') { openPalette(); return; }
    if (action === 'search') {
      const existing = document.querySelector('#rm-find-or-create-modal-input');
      if (existing) { existing.focus(); existing.select(); return; }
      openDialogCommand();
      let attempts = 0;
      const chooseSearch = () => {
        const entry = [...document.querySelectorAll('.rm-command-palette__menu .rm-menu-item')]
          .find(el => el.textContent.trim().startsWith('Open advanced search'));
        if (entry) {
          try { entry.click(); } finally { setTimeout(finishDialogCommand, 150); }
          return;
        }
        if (++attempts < 20) setTimeout(chooseSearch, 50);
        else { finishDialogCommand(); console.warn('Roam advanced search command not available yet'); }
      };
      chooseSearch();
      return;
    }
    if (action === 'settings') {
      if (document.querySelector('.rm-settings')) return;
      openDialogCommand();
      let attempts = 0;
      const chooseSettings = () => {
        const entry = [...document.querySelectorAll('.rm-command-palette__menu .rm-menu-item')]
          .find(el => el.textContent.trim() === 'Open settings');
        if (entry) {
          try { entry.click(); } finally { setTimeout(finishDialogCommand, 150); }
          return;
        }
        if (++attempts < 20) setTimeout(chooseSettings, 50);
        else { finishDialogCommand(); console.warn('Roam settings command not available yet'); }
      };
      chooseSettings();
    }
  };
  // Capture before Roam's editor shortcuts (Cmd+K normally inserts a link).
  window.addEventListener('keydown', event => {
    if (!event.isTrusted || !event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
    const action = { ',': 'settings', k: 'palette', o: 'search', n: 'new-page' }[event.key.toLowerCase()];
    if (!action) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    window.__roamDesktopAction(action);
  }, true);
})();
