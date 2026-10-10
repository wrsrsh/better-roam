import test from 'node:test';
import assert from 'node:assert/strict';
import d from 'datascript';
import {installPageCleanup, purgeEmptyPages} from '../extension/runtime/page-cleanup.js';

const schema = Object.fromEntries([':block/page', ':block/children', ':block/refs'].map(key =>
  [key, {':db/valueType': ':db.type/ref', ...(key === ':block/page' ? {} : {':db/cardinality': ':db.cardinality/many'})}]));
schema[':block/uid'] = {':db/unique': ':db.unique/identity'};
const edn = value => value.replace(/ :timeout \d+/g, '')
  .replace(/:(?:block|node)\/[\w_-]+/g, attr => JSON.stringify(attr));
function fixture() {
  let db = d.db_with(d.empty_db(schema), [
    {':db/id': 1, ':block/uid': 'empty', ':node/title': 'Empty'},
    {':db/id': 2, ':block/uid': 'whitespace', ':node/title': 'Whitespace', ':block/children': [20]},
    {':db/id': 20, ':block/uid': 'blank-block', ':block/page': 2, ':block/string': ' \n\t', ':block/children': [21]},
    {':db/id': 21, ':block/uid': 'nested-blank', ':block/page': 2, ':block/string': ''},
    {':db/id': 3, ':block/uid': 'content', ':node/title': 'Content', ':block/children': [30]},
    {':db/id': 30, ':block/uid': 'text', ':block/page': 3, ':block/string': 'Words'},
    {':db/id': 4, ':block/uid': 'mentioned', ':node/title': 'Mentioned'},
    {':db/id': 31, ':block/uid': 'mention', ':block/page': 3, ':block/string': '[[Mentioned]]', ':block/refs': [4]},
    {':db/id': 5, ':block/uid': 'embedded', ':node/title': 'Embedded', ':block/children': [50]},
    {':db/id': 50, ':block/uid': 'image', ':block/page': 5, ':block/string': '![](https://example.com/photo.png)'},
    {':db/id': 6, ':block/uid': 'properties', ':node/title': 'Properties', ':block/props': {custom: 'value'}},
    {':db/id': 7, ':block/uid': 'block-ref', ':node/title': 'Referenced child', ':block/children': [70]},
    {':db/id': 70, ':block/uid': 'referenced-blank', ':block/page': 7, ':block/string': ''},
    {':db/id': 32, ':block/uid': 'block-mention', ':block/page': 3, ':block/string': '((referenced-blank))', ':block/refs': [70]},
    // Even a missing :block/page relation must not conceal nested content.
    {':db/id': 8, ':block/uid': 'nested', ':node/title': 'Nested content', ':block/children': [80]},
    {':db/id': 80, ':block/uid': 'nested-content', ':block/string': 'Keep me'},
  ]);
  const deleted = [];
  const q = (query, ...args) => d.q(edn(query), db, ...args);
  const pull = (pattern, lookup) => d.pull(db, edn(pattern), lookup);
  const api = {graph: {name: 'test'}, data: {q, pull, async: {q: async (...args) => q(...args)}, page: {
    delete: async ({page: {uid}}) => {deleted.push(uid); db = d.db_with(db, [[':db.fn/retractEntity', [':block/uid', uid]]]); return {deleted: true};},
  }}};
  return {api, deleted, transact: tx => {db = d.db_with(db, tx);}};
}

test('purges only empty unmentioned pages, including nested whitespace', async () => {
  const x = fixture();
  assert.equal(await purgeEmptyPages(x.api), 2);
  assert.deepEqual(x.deleted.sort(), ['empty', 'whitespace']);
});

test('rechecks content and mentions after candidate discovery', async () => {
  const x = fixture(), query = x.api.data.async.q;
  x.api.data.async.q = async (...args) => {
    const candidates = await query(...args);
    x.transact([
      {':db/id': 100, ':block/uid': 'new-content', ':block/page': 1, ':block/string': 'Just typed'},
      {':db/id': 101, ':block/uid': 'new-mention', ':block/page': 3, ':block/string': '[[Whitespace]]', ':block/refs': [2]},
    ]);
    return candidates;
  };
  assert.equal(await purgeEmptyPages(x.api), 0);
  assert.deepEqual(x.deleted, []);
});

test('preserves a page with an active editor and stops on graph changes', async () => {
  const x = fixture();
  x.api.ui = {getFocusedBlock: () => ({'block-uid': 'blank-block'})};
  assert.equal(await purgeEmptyPages(x.api), 1);
  assert.deepEqual(x.deleted, ['empty']);
  const y = fixture();
  let current = true;
  const remove = y.api.data.page.delete;
  y.api.data.page.delete = async args => {const result = await remove(args); current = false; return result;};
  await purgeEmptyPages(y.api, () => current);
  assert.equal(y.deleted.length, 1);
});

test('does no writes after stale discovery or failed queries', async () => {
  const x = fixture();
  assert.equal(await purgeEmptyPages(x.api, () => false), 0);
  x.api.data.async.q = async () => {throw Error('Graph unavailable');};
  await assert.rejects(purgeEmptyPages(x.api), /Graph unavailable/);
  assert.deepEqual(x.deleted, []);
});

test('supports legacy writes and refuses APIs without synchronous validation', async () => {
  const x = fixture();
  x.api.deletePage = x.api.data.page.delete;
  delete x.api.data.page;
  assert.equal(await purgeEmptyPages(x.api), 2);
  const y = fixture();
  delete y.api.data.pull;
  assert.equal(await purgeEmptyPages(y.api), 0);
  assert.deepEqual(y.deleted, []);
});

test('waits for graph readiness, runs once per load, and ignores page navigation', async () => {
  const previous = {window: globalThis.window, document: globalThis.document, location: globalThis.location,
    setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout};
  const x = fixture(), callbacks = {}, timers = new Map();
  let loading = true, id = 0;
  globalThis.window = {roamAlphaAPI: x.api, addEventListener: (name, fn) => {callbacks[name] = fn;}};
  window.top = window;
  globalThis.location = {origin: 'https://roamresearch.com', hash: '#/app/test'};
  globalThis.document = {querySelector: selector => selector === '.loading-astrolabe' ? (loading ? {} : null) : {}};
  globalThis.setTimeout = fn => {timers.set(++id, fn); return id;};
  globalThis.clearTimeout = key => timers.delete(key);
  try {
    installPageCleanup();
    installPageCleanup();
    assert.equal(timers.size, 1);
    assert.deepEqual(x.deleted, []);
    loading = false;
    const ready = [...timers.values()][0]; timers.clear(); ready();
    // Drain the async query and sequential deletes without actual timers.
    for (let i = 0; i < 15; i++) await Promise.resolve();
    assert.deepEqual(x.deleted.sort(), ['empty', 'whitespace']);
    location.hash = '#/app/test/page/content'; callbacks.hashchange();
    assert.equal(timers.size, 0);
    assert.equal(x.deleted.length, 2);
    location.hash = '#/app/other'; callbacks.hashchange();
    assert.equal(timers.size, 1);
    assert.equal(x.deleted.length, 2);
  } finally {Object.assign(globalThis, previous);}
});
