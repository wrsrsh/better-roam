import '../runtime/loading.css';
import { defineContentScript } from 'wxt/utils/define-content-script';
// @ts-ignore Generated from the extension runtime and vendored theme before every build.
import {installPalette} from '../runtime/palette.js';
// @ts-ignore Runtime module is covered by the Node test suite.
import {installPageCleanup} from '../runtime/page-cleanup.js';
import { install } from '../generated/shared.js';
export default defineContentScript({
  matches: ['https://roamresearch.com/*'],
  world: 'MAIN',
  runAt: 'document_start',
  main() {
    installPalette();
    install();
    installPageCleanup();
    document.addEventListener('better-roam-command', (event) => {
      const action = (event as CustomEvent).detail;
      if (['new-page', 'search', 'palette', 'settings'].includes(action)) {
        (window as any).__betterRoamAction?.(action);
      }
    });
  },
});
