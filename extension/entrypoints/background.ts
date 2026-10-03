import { defineBackground } from 'wxt/utils/define-background';
import { browser } from 'wxt/browser';
import { createTabKeeper } from '../runtime/keep-loaded.js';
export default defineBackground(() => {
  const keeper = createTabKeeper(browser);
  const refresh = () => { void keeper.reconcile().catch(console.warn); };
  browser.action.onClicked.addListener(() => { void keeper.open().catch(console.warn); });
  browser.tabs.onCreated.addListener(refresh);
  browser.tabs.onRemoved.addListener(refresh);
  browser.tabs.onReplaced.addListener(refresh);
  browser.tabs.onUpdated.addListener((_id, change) => {
    if (change.url || change.status === 'complete' || change.discarded !== undefined || change.autoDiscardable === true) refresh();
  });
  browser.runtime.onStartup.addListener(refresh);
  browser.runtime.onInstalled.addListener(refresh);
  refresh();
  browser.commands.onCommand.addListener(async (action) => {
    const [tab] = await browser.tabs.query({active: true, currentWindow: true});
    if (tab?.id != null) {
      // Only Roam tabs have a receiver; no tab history or broad host permission.
      await browser.tabs.sendMessage(tab.id, {type: 'roam-command', action}).catch(() => {});
    }
  });
});
