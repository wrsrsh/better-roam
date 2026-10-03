import {createSearchSession, searchGraph} from './palette-search.js';

export function installPalette() {
  if (window.__betterRoamPalette) return;
  let current;
  window.__betterRoamPalette = () => {
    if (current) {current.focus(); return;}
    const api = window.roamAlphaAPI;
    const previous = document.activeElement;
    const scope = () => `${location.hash.split('/').slice(0, 3).join('/')}|${window.roamAlphaAPI?.graph?.name || ''}`;
    const originalScope = scope();
    const dialog = document.createElement('dialog');
    dialog.id = 'better-roam-palette';
    dialog.setAttribute('aria-label', 'Better Roam command palette');
    dialog.innerHTML = `<div class="br-palette-search"><input aria-label="Search Roam" role="combobox" aria-autocomplete="list" aria-expanded="true" aria-controls="br-palette-results" placeholder="Search or create…" autocomplete="off" spellcheck="false"></div><div id="br-palette-results" role="listbox" aria-label="Results"></div><div class="br-status" role="status" aria-live="polite"></div>`;
    const input = dialog.querySelector('input');
    const list = dialog.querySelector('[role="listbox"]');
    const status = dialog.querySelector('[role="status"]');
    let hits = [], items = [], selected = 0, busy = false, closed = false, error = '', loading = false;
    const close = (restoreFocus = true) => {
      if (closed) return;
      closed = true; session.close();
      window.removeEventListener('hashchange', routeChanged);
      dialog.close(); dialog.remove(); current = null;
      if (restoreFocus && previous?.isConnected) previous.focus();
    };
    const routeChanged = () => {if (scope() !== originalScope) close();};
    const action = (label, run, keywords = '') => ({kind: 'action', label, detail: 'Action', run, keywords});
    const actions = [
      action('Create new page', () => window.__betterRoamAction('new-page'), 'new file note'),
      action('Advanced search', () => window.__betterRoamAction('search'), 'find'),
      action('Open settings', () => window.__betterRoamAction('settings'), 'preferences'),
      action('All Roam commands', () => window.__betterRoamAction('roam-palette'), 'native commands'),
    ];
    const add = (label, owner, method, keywords) => {
      if (typeof owner?.[method] === 'function') actions.push(action(label, () => owner[method](), keywords));
    };
    add('Open daily notes', api?.ui?.mainWindow, 'openDailyNotes', 'today journal');
    add('Show left sidebar', api?.ui?.leftSidebar, 'open', 'navigation');
    add('Hide left sidebar', api?.ui?.leftSidebar, 'close', 'navigation');
    add('Show right sidebar', api?.ui?.rightSidebar, 'open', 'split pane');
    add('Hide right sidebar', api?.ui?.rightSidebar, 'close', 'split pane');
    const query = () => input.value.replace(/^>\s*/, '').trim();
    const kind = () => input.value.startsWith('>') ? 'actions' : 'all';
    const select = index => {
      selected = Math.max(0, Math.min(index, items.length - 1));
      [...list.children].forEach((row, i) => row.setAttribute('aria-selected', String(i === selected)));
      const row = list.children[selected];
      if (row) {input.setAttribute('aria-activedescendant', row.id); row.scrollIntoView?.({block: 'nearest'});}
      else input.removeAttribute('aria-activedescendant');
    };
    const activate = async (item, sidebar = false) => {
      if (!item || busy || scope() !== originalScope) return;
      if (item.kind === 'action') {close(); await item.run(); return;}
      busy = true; status.textContent = item.kind === 'create' ? 'Creating page…' : 'Opening…';
      try {
        if (item.kind === 'create') {
          await window.__betterRoamAction('create-page', query());
        } else if (sidebar && api?.ui?.rightSidebar?.addWindow) {
          await api.ui.rightSidebar.addWindow({window: {type: item.kind === 'page' ? 'outline' : 'block', 'block-uid': item.uid}});
        } else if (item.kind === 'page') {
          await api.ui.mainWindow.openPage({page: {uid: item.uid}});
        } else {
          await api.ui.mainWindow.openBlock({block: {uid: item.uid}});
        }
        close(false);
      } catch {
        status.textContent = item.kind === 'create'
          ? 'Could not finish creating the page. Check whether it exists before trying again.'
          : 'Could not open this result. Your graph may still be loading.';
      } finally {busy = false;}
    };
    const render = () => {
      if (closed) return;
      const text = query().toLowerCase(), mode = kind();
      const matches = actions.filter(a => text.split(/\s+/).every(word => `${a.label} ${a.keywords}`.toLowerCase().includes(word)));
      items = mode === 'actions' ? matches : [...hits, ...(mode === 'all' ? matches : [])];
      if (text && mode !== 'actions' && mode !== 'blocks' && !loading && !error && !hits.some(h => h.kind === 'page' && h.label.toLowerCase() === text)) {
        items.push({kind: 'create', label: `Create “${query()}”`, detail: 'New page'});
      }
      list.replaceChildren();
      items.forEach((item, i) => {
        const row = document.createElement('div');
        row.id = `br-result-${i}`; row.className = 'br-result'; row.setAttribute('role', 'option');
        const icon = document.createElement('span'); icon.className = 'br-result-icon'; icon.setAttribute('aria-hidden', 'true');
        icon.textContent = {page: '▤', block: '•', action: '⌘', create: '+'}[item.kind];
        const body = document.createElement('span'); body.className = 'br-result-body';
        const title = document.createElement('span'); title.className = 'br-result-title'; title.textContent = item.label.slice(0, 220);
        const detail = document.createElement('span'); detail.className = 'br-result-detail'; detail.textContent = item.kind === 'block' && item.detail !== 'Block' ? item.detail : '';
        body.append(title, detail); row.append(icon, body);
        row.onmousedown = event => event.preventDefault();
        row.onclick = event => {void activate(item, event.shiftKey).catch(() => {});};
        list.append(row);
      });
      status.textContent = error || (loading ? 'Searching…' : !items.length ? (text ? 'No matches.' : 'Type to search your graph.') : '');
      select(0);
    };
    const session = createSearchSession({scope, search: (text, mode) => searchGraph(api, text, mode),
      deliver(rows, failure) {hits = rows; loading = false; error = failure ? 'Search unavailable. Try Advanced search from Actions.' : ''; render();},
    });
    const refresh = () => {
      if (busy) return;
      hits = []; error = ''; loading = !!query() && kind() !== 'actions';
      session.query(query(), kind()); render();
    };
    input.oninput = () => {if (!input.isComposing) refresh();};
    input.addEventListener('compositionstart', () => {input.isComposing = true;});
    input.addEventListener('compositionend', () => {input.isComposing = false; refresh();});
    input.onkeydown = event => {
      if (event.isComposing) return;
      if (['ArrowDown', 'ArrowUp', 'Enter'].includes(event.key)) {
        event.preventDefault(); event.stopPropagation();
        if (event.key === 'Enter') void activate(items[selected], event.shiftKey).catch(() => {});
        else select((selected + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % (items.length || 1));
      }
    };
    dialog.addEventListener('cancel', event => {event.preventDefault(); if (!busy) close();});
    dialog.addEventListener('click', event => {if (event.target === dialog && !busy) close();});
    window.addEventListener('hashchange', routeChanged);
    current = {focus: () => input.focus()};
    document.body.append(dialog); dialog.showModal(); render(); input.focus();
  };
}
