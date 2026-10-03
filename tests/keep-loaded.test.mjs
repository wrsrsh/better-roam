import test from 'node:test';
import assert from 'node:assert/strict';
import {createTabKeeper} from '../extension/runtime/keep-loaded.js';
function fixture() {
  const tabs = new Map([
    [1, {id: 1, windowId: 10, url: 'https://roamresearch.com/', autoDiscardable: true}],
    [2, {id: 2, windowId: 10, url: 'https://roamresearch.com/#/app/test', autoDiscardable: true}],
  ]);
  const session = {};
  const updates = []; const created = [];
  const api = {
    storage: {session: {
      get: async () => ({...session}),
      set: async values => Object.assign(session, values),
      remove: async key => {delete session[key];},
    }},
    tabs: {
      get: async id => {if (!tabs.has(id)) throw Error('closed'); return {...tabs.get(id)};},
      query: async () => [...tabs.values()].filter(t => t.url.startsWith('https://roamresearch.com/')).map(t => ({...t})),
      update: async (id, change) => {assert.ok(tabs.has(id)); updates.push([id, change]); Object.assign(tabs.get(id), change);},
      create: async options => {created.push(options); const tab = {id: 3, windowId: 10, autoDiscardable: true, ...options}; tabs.set(3, tab); return tab;},
    },
    windows: {update: async () => {}},
  };
  return {api, tabs, updates, created, keeper: createTabKeeper(api)};
}
test('protects only one graph and recovers ownership across worker restarts', async () => {
  const f = fixture();
  await Promise.all([f.keeper.reconcile(), f.keeper.reconcile()]);
  assert.equal(f.tabs.get(2).autoDiscardable, false);
  assert.equal(f.tabs.get(1).autoDiscardable, true);
  await createTabKeeper(f.api).reconcile();
  assert.equal(f.updates.length, 1);
});
test('toolbar focuses retained tab without navigation or reload', async () => {
  const f = fixture(); await f.keeper.open();
  assert.equal(f.tabs.get(2).active, true);
  assert.equal(f.created.length, 0);
  assert.ok(f.updates.every(([, patch]) => !('url' in patch)));
});
test('navigation away restores discardability and selects another Roam tab', async () => {
  const f = fixture(); await f.keeper.reconcile();
  f.tabs.get(2).pendingUrl = 'https://example.com/';
  await f.keeper.reconcile();
  assert.equal(f.tabs.get(2).autoDiscardable, true);
  assert.equal(f.tabs.get(1).autoDiscardable, false);
});
test('closing tabs never recreates them until toolbar clicked', async () => {
  const f = fixture(); await f.keeper.reconcile();
  f.tabs.clear(); await f.keeper.reconcile();
  assert.equal(f.created.length, 0);
  await f.keeper.open(); assert.equal(f.created.length, 1);
  assert.equal(f.tabs.get(3).autoDiscardable, false);
});
test('preserves a preexisting non-discardable setting when releasing ownership', async () => {
  const f = fixture(); f.tabs.get(2).autoDiscardable = false;
  await f.keeper.reconcile(); f.tabs.get(2).url = 'https://example.com/';
  await f.keeper.reconcile(); assert.equal(f.tabs.get(2).autoDiscardable, false);
});
test('prefers loaded tabs and does not force a discarded tab to reload', async () => {
  const f = fixture(); f.tabs.get(2).discarded = true;
  await f.keeper.reconcile(); assert.equal(f.tabs.get(1).autoDiscardable, false);
  assert.equal(f.tabs.get(2).autoDiscardable, true);
});
