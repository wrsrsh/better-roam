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
  function mount() {
    if (document.getElementById('roam-desktop-controls')) return;
    const host = document.createElement('div');
    host.id = 'roam-desktop-controls';
    host.style.cssText = 'position:fixed;top:6px;right:8px;z-index:2147483647';
    const root = host.attachShadow({ mode: 'closed' });
    root.innerHTML = `
      <style>
        :host { color-scheme: light dark; }
        button { font: 13px -apple-system,BlinkMacSystemFont,sans-serif; cursor:pointer; color:inherit; border:0; }
        .trigger { width:32px; height:28px; border-radius:7px; background:light-dark(#f5f5f5e8,#292929e8); color:light-dark(#555,#ccc); font-size:21px; line-height:20px; box-shadow:0 1px 4px #0001; }
        .trigger:hover { background:light-dark(#e7e7e7,#444); }
        .panel { position:absolute; right:0; top:34px; width:184px; padding:5px; border-radius:10px; background:light-dark(#fafafa,#242424); color:light-dark(#222,#eee); box-shadow:0 8px 32px #0003; border:1px solid #8883; }
        .panel[hidden] { display:none; }
        .panel button { display:block; width:100%; text-align:left; background:transparent; padding:8px 10px; border-radius:5px; }
        .panel button:hover,.panel button:focus-visible { background:#3982ed; color:white; outline:0; }
        hr { border:0; border-top:1px solid #8883; margin:4px; }
        .hint { font:11px -apple-system,sans-serif; opacity:.6; padding:7px 10px; }
        .error { font:12px -apple-system,sans-serif; color:#d55; padding:7px 10px; }
      </style>
      <button class="trigger" aria-label="Window options; drag to move window" aria-expanded="false" title="Window options · drag to move">⋯</button>
      <div class="panel" hidden>
        <button data-action="back">Back</button>
        <button data-action="reload">Reload <span style="float:right;opacity:.5">⌘R</span></button>
        <hr>
        <button data-action="fullscreen">Toggle Full Screen</button>
        <button data-action="minimize">Minimize</button>
        <button data-action="hide">Close Window <span style="float:right;opacity:.5">⌘W</span></button>
        <div class="hint">Closing or ⌘Q keeps Roam running.<br>Use ⇧⌘Q to quit completely.</div>
        <div class="error" hidden></div>
      </div>`;
    const trigger = root.querySelector('.trigger');
    const panel = root.querySelector('.panel');
    const setOpen = (open) => { panel.hidden = !open; trigger.setAttribute('aria-expanded', String(open)); };
    let start = null;
    let dragged = false;
    trigger.addEventListener('pointerdown', e => { if(e.button === 0) { start = [e.clientX,e.clientY]; dragged = false; } });
    trigger.addEventListener('pointermove', async e => {
      if(!start || !(e.buttons & 1)) return;
      if(Math.hypot(e.clientX-start[0], e.clientY-start[1]) > 4) {
        start = null; dragged = true;
        try { await window.__TAURI__.window.getCurrentWindow().startDragging(); } catch (error) { console.error(error); }
      }
    });
    trigger.addEventListener('pointerup', () => { start = null; });
    trigger.addEventListener('click', () => { if(!dragged) setOpen(panel.hidden); dragged = false; });
    document.addEventListener('pointerdown', e => { if(!e.composedPath().includes(host)) setOpen(false); });
    document.addEventListener('keydown', e => { if(e.key === 'Escape' && !panel.hidden) { setOpen(false); trigger.focus(); } });
    root.querySelectorAll('[data-action]').forEach(button => button.addEventListener('click', async () => {
      try {
        const action = button.dataset.action;
        if(action === 'back') history.back();
        else if(action === 'reload') location.reload();
        else {
          const win = window.__TAURI__.window.getCurrentWindow();
          if(action === 'fullscreen') await win.setFullscreen(!(await win.isFullscreen()));
          else await win[action]();
        }
        setOpen(false);
      } catch(error) {
        const message = root.querySelector('.error');
        message.hidden = false;
        message.textContent = 'Could not perform window action.';
        console.error(error);
      }
    }));
    document.documentElement.appendChild(host);
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
  else mount();
})();
