import { defineContentScript } from 'wxt/utils/define-content-script';
import { browser } from 'wxt/browser';
export default defineContentScript({
  matches: ['https://roamresearch.com/*'],
  main() {
    browser.runtime.onMessage.addListener((message) => {
      if (message?.type === 'roam-command' && ['new-page', 'search', 'palette', 'settings'].includes(message.action)) {
        document.dispatchEvent(new CustomEvent('better-roam-command', {detail: message.action}));
      }
    });
  },
});
