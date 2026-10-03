import { defineBackground } from 'wxt/utils/define-background';
import { browser } from 'wxt/browser';
export default defineBackground(() => {
  browser.action.onClicked.addListener(async () => {
    const tabs = await browser.tabs.query({url: 'https://roamresearch.com/*'});
    const tab = tabs.find(t => !t.discarded) || tabs[0];
    if (tab?.id != null) {
      await browser.tabs.update(tab.id, {active: true});
      await browser.windows.update(tab.windowId, {focused: true});
    } else {
      await browser.tabs.create({url: 'https://roamresearch.com/', pinned: true});
    }
  });
  browser.commands.onCommand.addListener(async (action) => {
    const [tab] = await browser.tabs.query({active: true, currentWindow: true});
    if (tab?.id != null) {
      // Only Roam tabs have a receiver; no tab history or broad host permission.
      await browser.tabs.sendMessage(tab.id, {type: 'roam-command', action}).catch(() => {});
    }
  });
});
