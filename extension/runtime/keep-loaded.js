// No graph reads, page scripts, polling, or service-worker keepalive.
const KEY = 'betterRoamLoadedTab';
const isRoam = tab => /^https:\/\/roamresearch\.com\//.test(tab?.pendingUrl || tab?.url || '');

export function createTabKeeper(api) {
  let queue = Promise.resolve();
  const serialize = fn => {
    const result = queue.then(fn);
    queue = result.catch(() => {});
    return result;
  };
  async function reconcile() {
    let owned = (await api.storage.session.get(KEY))[KEY];
    let selected;
    if (owned) {
      const tab = await api.tabs.get(owned.id).catch(() => null);
      if (tab && isRoam(tab)) selected = tab;
      else {
        if (tab) await api.tabs.update(tab.id, {autoDiscardable: owned.previous});
        await api.storage.session.remove(KEY);
        owned = null;
      }
    }
    if (!selected) {
      const tabs = await api.tabs.query({url: 'https://roamresearch.com/*'});
      // Prefer an already constructed graph over a discarded tab or landing page.
      selected = tabs.filter(isRoam).sort((a, b) =>
        Number(!!a.discarded) - Number(!!b.discarded) ||
        Number(!a.url?.includes('#/app/')) - Number(!b.url?.includes('#/app/')) ||
        Number(!!b.active) - Number(!!a.active)
      )[0];
      if (!selected?.id) return null;
      owned = {id: selected.id, previous: selected.autoDiscardable !== false};
      // Record ownership before updating so a worker restart can recover it.
      await api.storage.session.set({[KEY]: owned});
    }
    if (selected.autoDiscardable !== false) {
      await api.tabs.update(selected.id, {autoDiscardable: false});
    }
    return selected;
  }
  return {
    reconcile: () => serialize(reconcile),
    open: () => serialize(async () => {
      let tab = await reconcile();
      if (!tab) {
        tab = await api.tabs.create({url: 'https://roamresearch.com/', pinned: true});
        await reconcile();
      } else await api.tabs.update(tab.id, {active: true});
      await api.windows.update(tab.windowId, {focused: true});
    }),
  };
}
