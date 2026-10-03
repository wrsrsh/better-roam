import { defineContentScript } from 'wxt/utils/define-content-script';
// @ts-ignore Generated from the desktop sources before every build.
import { install } from '../generated/shared.js';
export default defineContentScript({
  matches: ['https://roamresearch.com/*'],
  world: 'MAIN',
  runAt: 'document_start',
  main() {
    install();
    document.addEventListener('better-roam-command', (event) => {
      const action = (event as CustomEvent).detail;
      if (['new-page', 'search', 'palette', 'settings'].includes(action)) {
        (window as any).__betterRoamAction?.(action);
      }
    });
  },
});
