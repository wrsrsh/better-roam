# better roam

a faster, cleaner [Roam Research](https://roamresearch.com) experience in Chrome. built with [WXT](https://wxt.dev). no Roam Depot extensions needed.

Craft light/dark theme, quick page creation with caret focus, advanced search shortcuts, simpler dialogs, and less visual clutter. no analytics or separate graph sync engine.

## install

[download the extension](https://github.com/wrsrsh/betterroam/releases/latest), unzip it, then open `chrome://extensions`. enable **Developer mode**, click **Load unpacked**, and select the extracted folder. reload Roam.

## shortcuts

| action | shortcut |
| --- | --- |
| new page | Alt+Shift+N |
| advanced search | Alt+Shift+O |
| command palette | Alt+Shift+K |
| settings | Alt+Shift+S |

Alt is Option on Mac. customize at `chrome://extensions/shortcuts`; Chrome reserves shortcuts like Cmd+N and Cmd+O.

## develop

requires Node.js 24+.

```sh
npm ci
npm run dev
npm test
npm run typecheck
npm run build
npm run zip
```

load `extension/.output/chrome-mv3` for local builds. customize `vendor/theme/better-roam.css` and rebuild.

Roam manages graph storage and sync. closed or discarded tabs may need to load again. this is a Chrome extension only; old desktop releases remain historical.

unofficial. Roam's name and logo belong to Roam Research. theme derived from Alexander Rink's MIT-licensed Roam Studio; [license](vendor/theme/LICENSE).
