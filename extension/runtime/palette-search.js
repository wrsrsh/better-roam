import {parseSearch, advancedSearch} from './advanced-search.js';
// Use Roam's bounded search, preferably its async/search-worker API. No local
// graph mirror, subscriptions, background indexing, or persistent result cache.
export async function searchGraph(api, text, kind = 'all') {
  if (!text.trim()) return [];
  const spec = parseSearch(text);
  if (spec.advanced) return advancedSearch(api, spec);
  const owner = typeof api?.data?.async?.search === 'function' ? api.data.async : api?.data;
  if (typeof owner?.search !== 'function') throw new Error('Search is unavailable until this graph finishes loading.');
  const rows = await owner.search({
    'search-str': text.trim(), 'search-pages': kind !== 'blocks',
    'search-blocks': kind !== 'pages', limit: 40,
    pull: '[:block/uid :node/title :block/string {:block/page [:node/title]}]',
  });
  const seen = new Set();
  return (Array.isArray(rows) ? rows : []).flatMap(row => {
    const uid = row[':block/uid'] ?? row.uid;
    const title = row[':node/title'] ?? row.title;
    const text = row[':block/string'] ?? row.string;
    if (typeof uid !== 'string' || seen.has(uid)) return [];
    seen.add(uid);
    if (typeof title !== 'string' && typeof text !== 'string') return [];
    const page = typeof title === 'string';
    if ((kind === 'pages' && !page) || (kind === 'blocks' && page)) return [];
    return [{uid, kind: page ? 'page' : 'block', label: page ? title : text,
      detail: page ? 'Page' : row[':block/page']?.[':node/title'] || 'Block'}];
  }).slice(0, 40);
}

// At most one search runs at a time. A new query replaces pending work; stale
// results (including graph changes) are never delivered. Closing drops all work.
export function createSearchSession({search, scope, deliver, schedule = setTimeout, cancel = clearTimeout}) {
  let revision = 0, timer, queued, running = false, closed = false;
  const pump = async () => {
    if (running || closed || !queued) return;
    const job = queued; queued = null; running = true;
    try {
      const rows = await search(job.text, job.kind);
      if (!closed && job.revision === revision && job.scope === scope()) deliver(rows, null);
    } catch (error) {
      if (!closed && job.revision === revision && job.scope === scope()) deliver([], error);
    } finally { running = false; if (queued && !closed) void pump(); }
  };
  return {
    query(text, kind) {
      revision++; cancel(timer); queued = null;
      if (closed || !text.trim() || kind === 'actions') return;
      const job = {text, kind, revision, scope: scope()};
      timer = schedule(() => {queued = job; void pump();}, 140);
    },
    close() {closed = true; revision++; cancel(timer); queued = null;},
  };
}
