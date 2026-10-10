// A page title is not page content. Whitespace-only blocks count as empty;
// embeds, punctuation, properties, and references keep their page intact.
export const emptyPagesQuery = `[:find ?uid
  :where
  [?page :node/title]
  [?page :block/uid ?uid]
  (not [?source :block/refs ?page])
  (not-join [?page]
    [?block :block/page ?page]
    [?block :block/string ?text]
    [(re-pattern "\\\\S") ?nonempty]
    [(re-find ?nonempty ?text)])
  :timeout 5000]`;

const eligiblePageQuery = emptyPagesQuery.replace(':where', ':in $ ?uid :where');
const pagePattern = '[* {:block/children ...} {:block/_refs [:block/uid]}]';

function emptyTree(page) {
  if (!page || typeof page[':node/title'] !== 'string') return false;
  const pending = [page], seen = new Set();
  while (pending.length) {
    const node = pending.pop();
    const uid = node[':block/uid'];
    if (typeof uid !== 'string' || seen.has(uid)) return false;
    seen.add(uid);
    if (node !== page && typeof node[':block/string'] !== 'string') return false;
    if (node[':block/string']?.trim()) return false;
    if (node[':block/props'] && Object.keys(node[':block/props']).length) return false;
    if (node[':block/refs']?.length || node[':block/_refs']?.length) return false;
    const children = node[':block/children'] ?? [];
    if (!Array.isArray(children)) return false;
    pending.push(...children);
  }
  return true;
}

export async function purgeEmptyPages(api, isCurrent = () => true) {
  const reader = api?.data?.async?.q ? api.data.async : api?.data?.q ? api.data : api;
  const sync = api?.data?.q && api?.data?.pull ? api.data : api;
  const writer = api?.data?.page?.delete ? api.data.page : api;
  const remove = writer?.delete ?? api?.deletePage;
  // Final validation and issuing the delete share one synchronous turn. Never
  // delete on the strength of a stale async result or an incomplete API.
  if (!reader?.q || !sync?.q || !sync?.pull || typeof remove !== 'function') return 0;
  const candidates = await reader.q(emptyPagesQuery);
  if (!isCurrent()) return 0;
  if (!Array.isArray(candidates)) throw new Error('Invalid empty-page query result.');
  let deleted = 0;
  for (const [uid] of candidates) {
    if (!isCurrent()) break;
    if (typeof uid !== 'string') continue;
    const eligible = sync.q(eligiblePageQuery, uid);
    if (!Array.isArray(eligible) || !eligible.some(row => row[0] === uid)) continue;
    const page = sync.pull(pagePattern, [':block/uid', uid]);
    if (!emptyTree(page) || !isCurrent()) continue;
    // An editor can contain text that Roam has not saved to the graph yet.
    if (typeof api.ui?.getFocusedBlock === 'function') {
      const focused = api.ui.getFocusedBlock();
      if (focused?.['block-uid']) {
        const block = sync.pull('[:block/page]', [':block/uid', focused['block-uid']]);
        if (block?.[':block/page']?.[':db/id'] === page[':db/id']) continue;
      }
    }
    const result = await remove.call(writer, {page: {uid}});
    if (result?.deleted !== false) deleted++;
  }
  return deleted;
}

export function installPageCleanup() {
  if (window.top !== window || location.origin !== 'https://roamresearch.com'
    || window.__betterRoamPageCleanupInstalled) return;
  window.__betterRoamPageCleanupInstalled = true;
  let graph, generation = 0, timer;
  const routeGraph = () => {
    const name = location.hash.match(/^#\/app\/([^/?]+)/)?.[1];
    return name ? decodeURIComponent(name) : null;
  };
  const navigate = () => {
    const next = routeGraph();
    if (next === graph) return;
    graph = next;
    clearTimeout(timer);
    const token = ++generation;
    if (!graph) return;
    let attempts = 0;
    const ready = () => {
      if (token !== generation) return;
      const api = window.roamAlphaAPI;
      const sync = api?.data?.q && api?.data?.pull ? api.data : api;
      // API availability alone does not mean the graph has finished loading.
      if (api?.graph?.name === graph && typeof sync?.q === 'function'
        && typeof sync?.pull === 'function'
        && (typeof api.data?.page?.delete === 'function' || typeof api.deletePage === 'function')
        && document.querySelector('.roam-sidebar-content')
        && !document.querySelector('.loading-astrolabe')) {
        void purgeEmptyPages(api, () => token === generation
          && routeGraph() === graph && window.roamAlphaAPI === api
          && api.graph.name === graph).catch(error => {
          console.warn('Better Roam could not finish empty-page cleanup.', error);
        });
        return;
      }
      // Bounded startup checks; no graph subscriptions or ongoing polling.
      if (++attempts < 300) timer = setTimeout(ready, 1000);
    };
    ready();
  };
  window.addEventListener('hashchange', navigate);
  navigate();
}
