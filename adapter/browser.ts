import { RoamAdapter } from './adapter';
import { createWebviewTransport } from './transport';
import type { Request } from './types';

declare global {
  interface Window {
    roamAlphaAPI?: unknown;
    __roamDesktopAPI?: { version: 1; request: (request: Request) => ReturnType<RoamAdapter['request']> };
  }
}
if (window.top === window && location.origin === 'https://roamresearch.com' && !window.__roamDesktopAPI) {
  const transport = createWebviewTransport(() => window.roamAlphaAPI, () => {
    const match = location.hash.match(/^#\/app\/([^/]+)/);
    try { return match?.[1] ? decodeURIComponent(match[1]) : null; } catch { return null; }
  });
  const adapter = new RoamAdapter(transport, {
    onEvent: event => window.dispatchEvent(new CustomEvent('roam-desktop:entity-changed', { detail: event })),
  });
  window.__roamDesktopAPI = Object.freeze({ version: 1, request: (request: Request) => adapter.request(request) });
  window.addEventListener('hashchange', () => adapter.status());
  window.addEventListener('pagehide', event => { if (event.persisted) adapter.invalidate(); else void adapter.dispose(); });
}
