# better roam

a faster, cleaner [Roam Research](https://roamresearch.com) experience in Chrome. built with [WXT](https://wxt.dev). no Roam Depot extensions needed.

Craft light/dark theme, a compact unified command palette, quick page creation with caret focus, advanced search shortcuts, and less visual clutter. no analytics or separate graph sync engine.

## install

[download the extension](https://github.com/wrsrsh/betterroam/releases/latest), unzip it, then open `chrome://extensions`. enable **Developer mode**, click **Load unpacked**, and select the extracted folder. reload Roam.

## shortcuts

| action | shortcut |
| --- | --- |
| new page | Alt+Shift+N |
| advanced search | Alt+Shift+O |
| command palette | ⌘K (Mac) / Ctrl+K |
| settings | Alt+Shift+S |

Alt is Option on Mac. customize at `chrome://extensions/shortcuts`; Chrome reserves shortcuts like Cmd+N and Cmd+O.

⌘K searches pages and block text. type `>` to show only commands. press Enter to open a result, Shift+Enter for the sidebar, or choose **Create** to make a page. settings, daily notes, sidebars, and Roam's full command menu are also available.

Search runs only while the palette is open, with debouncing, at most one request at a time, and up to 40 graph results. it uses Roam's async search when available; no extra graph index or background sync.

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
