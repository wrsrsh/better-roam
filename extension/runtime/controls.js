(() => {
  if (window.top !== window || location.origin !== 'https://roamresearch.com') return;
  if (window.__betterRoamAction) return;
  const openExternal = (url) => {
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
    const root = document.querySelector('.roam-body');
    const active = document.activeElement;
    // React delegates shortcuts inside Roam's root, not on document.body.
    const target = root && !root.contains(active) ? root : active || document.body;
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
    document.documentElement?.setAttribute('data-better-roam-dialog-command', '');
    openPalette();
  };
  const finishDialogCommand = () => {
    document.documentElement?.removeAttribute('data-better-roam-dialog-command');
  };
  const createPage = async title => {
    title = title.trim();
    if (!title) throw new Error('A page title is required.');
    const api = window.roamAlphaAPI;
    const graph = location.hash.split('/').slice(0, 3).join('/');
    const checkGraph = () => {
      if (window.roamAlphaAPI !== api || location.hash.split('/').slice(0, 3).join('/') !== graph)
        throw new Error('Graph changed.');
    };
    const owner = api?.data?.async?.pull ? api.data.async : api?.data?.pull ? api.data : api;
    if (!owner?.pull || !api?.util || !api?.ui?.mainWindow) throw new Error('Graph not ready.');
    const existing = await owner.pull('[:block/uid]', [':node/title', title]);
    checkGraph();
    const existingUid = existing?.[':block/uid'] || existing?.uid;
    if (existingUid) {await openPageAtEnd(existingUid); return;}
    const uid = api.util.generateUID();
    const create = api.data?.page?.create || api.createPage;
    await create.call(api.data?.page || api, {page: {title, uid}});
    checkGraph();
    const createBlock = api.data?.block?.create || api.createBlock;
    await createBlock.call(api.data?.block || api, {location: {'parent-uid': uid, order: 0}, block: {uid: api.util.generateUID(), string: ''}});
    checkGraph();
    await api.ui.mainWindow.openPage({page: {uid}});
    focusContent(uid);
  };
  // A title prompt keeps page creation explicit; Roam remains the data owner.
  const newPage = () => {
    if (document.getElementById('better-roam-new-page')) return;
    const dialog = document.createElement('dialog');
    dialog.id = 'better-roam-new-page';
    dialog.setAttribute('aria-labelledby', 'better-roam-new-page-title');
    dialog.innerHTML = '<form><h2 id="better-roam-new-page-title">New page</h2><label for="better-roam-page-title">Page title</label><input id="better-roam-page-title" name="title" placeholder="Give your page a name" required autocomplete="off"><p role="status"></p><footer><button type="button">Cancel</button><button type="submit">Create page <span aria-hidden="true">↵</span></button></footer></form>';
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
        await createPage(title);
        close();
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
      try { Promise.resolve(window.roamAlphaAPI?.ui?.mainWindow?.focusFirstBlock()).catch(() => {}); } catch (_) {}
      if (++attempts < 40) setTimeout(attempt, 75);
    };
    attempt();
  };
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  // The last visible block in document order, skipping collapsed children.
  const lastBlock = node => {
    const children = [...(node?.[':block/children'] || node?.children || [])]
      .sort((a, b) => (a[':block/order'] ?? a.order ?? 0) - (b[':block/order'] ?? b.order ?? 0));
    const last = children[children.length - 1];
    if (!last) return null;
    const open = last[':block/open'] ?? last.open ?? true;
    return (open && lastBlock(last)) || {
      uid: last[':block/uid'] || last.uid,
      length: (last[':block/string'] ?? last.string ?? '').length
    };
  };
  // Opening an existing page lands the caret after its last block so Enter
  // continues the page instead of editing its first line.
  let pendingEnd = null;
  const focusEnd = async uid => {
    const generation = ++focusGeneration;
    const arrived = () => location.hash.endsWith('/page/' + uid);
    const live = () => generation === focusGeneration;
    for (let i = 0; i < 40 && live() && !arrived(); i++) await delay(75);
    if (!live() || !arrived()) return;
    const api = window.roamAlphaAPI;
    const owner = api?.data?.async?.pull ? api.data.async : api?.data?.pull ? api.data : api;
    let target = null;
    try {
      target = lastBlock(await owner?.pull?.('[:block/uid :block/string :block/order :block/open {:block/children ...}]', [':block/uid', uid]));
    } catch (_) {}
    if (!live() || !arrived()) return;
    if (!target?.uid || typeof api?.ui?.setBlockFocusAndSelection !== 'function') { pendingEnd = null; focusContent(uid); return; }
    const selection = {start: target.length, end: target.length};
    for (let i = 0; i < 10 && live() && arrived(); i++) {
      try { await api.ui.setBlockFocusAndSelection({location: {'block-uid': target.uid, 'window-id': 'main-window'}, selection}); } catch (_) {}
      await delay(75);
      if (live() && document.activeElement?.matches?.('textarea')) break;
    }
    if (live()) pendingEnd = null;
  };
  const openPageAtEnd = async uid => {
    pendingEnd = uid;
    await window.roamAlphaAPI.ui.mainWindow.openPage({page: {uid}});
    // The hashchange handler may already have started this; whichever runs
    // last wins and user input cancels either.
    if (pendingEnd === uid) focusEnd(uid).catch(() => {});
  };
  // Only inspect after navigation, never in response to editor DOM mutations.
  let pageFocusTimer;
  let navigationGeneration = 0;
  const cancelAutoFocus = () => {
    navigationGeneration++;
    focusGeneration++;
    clearTimeout(pageFocusTimer);
  };
  const schedulePageFocus = () => {
    cancelAutoFocus();
    const generation = navigationGeneration;
    const uid = location.hash.match(/\/page\/([^/?]+)/)?.[1];
    if (!uid) return;
    if (pendingEnd === uid) { focusEnd(uid).catch(() => {}); return; }
    let attempts = 0;
    const check = () => {
      if (generation !== navigationGeneration) return;
      // Check the active editor before any document traversal.
      if (document.activeElement?.matches?.('textarea, input, [contenteditable="true"]')) return;
      const page = document.querySelector('.roam-article .rm-title-display');
      if (page && !document.getElementById('better-roam-new-page')) {
        const blocks = document.querySelectorAll('.roam-article .roam-block');
        if (blocks.length) {
          if (blocks.length === 1 && !blocks[0].textContent.trim()) focusContent(uid);
          return;
        }
      }
      if (++attempts < 20) pageFocusTimer = setTimeout(check, 100);
    };
    pageFocusTimer = setTimeout(check, 100);
  };
  const userInput = () => { pendingEnd = null; cancelAutoFocus(); };
  window.addEventListener('hashchange', schedulePageFocus);
  document.addEventListener('keydown', userInput, true);
  document.addEventListener('pointerdown', userInput, true);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', schedulePageFocus, {once: true});
  else schedulePageFocus();
  window.__betterRoamAction = (action, value) => {
    if (action === 'create-page') return createPage(value);
    if (action === 'open-page') return openPageAtEnd(value);
    if (action === 'roam-palette') { openPalette(); return; }
    if (action === 'new-page') { newPage(); return; }
    if (action === 'palette') { window.__betterRoamPalette?.(); return; }
    if (action === 'search') { window.__betterRoamPalette?.(); return; }
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
  // Handle the palette here rather than reserving Cmd/Ctrl+K across Chrome.
  // Capture before Roam's editor shortcuts (Cmd+K normally inserts a link).
  window.addEventListener('keydown', event => {
    if (!event.isTrusted || event.altKey || event.shiftKey) return;
    const key = event.key.toLowerCase();
    const palette = key === 'k' && !!event.metaKey !== !!event.ctrlKey;
    const action = palette ? 'palette' : event.metaKey && !event.ctrlKey
      ? { ',': 'settings', o: 'search', n: 'new-page' }[key] : undefined;
    if (!action) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    window.__betterRoamAction(action);
  }, true);
})();
