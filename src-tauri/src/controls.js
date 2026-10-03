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
})();
