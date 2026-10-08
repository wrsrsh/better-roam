import {defineBackground} from 'wxt/utils/define-background';
import {browser} from 'wxt/browser';

export default defineBackground(() => {
  browser.action.onClicked.addListener(() => {
    void browser.tabs.create({url: 'https://roamresearch.com/'}).catch(console.warn);
  });
  browser.commands.onCommand.addListener(async action => {
    const [tab] = await browser.tabs.query({active: true, currentWindow: true});
    if (tab?.id != null) {
      await browser.tabs.sendMessage(tab.id, {type: 'roam-command', action}).catch(() => {});
    }
  });
});
