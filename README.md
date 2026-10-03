# better roam

a faster, cleaner [Roam Research](https://roamresearch.com) experience in Chrome. built with [WXT](https://wxt.dev). no Roam Depot extensions needed.

Craft light/dark theme, a compact unified command palette, quick page creation with caret focus, advanced search shortcuts, and less visual clutter. no analytics or separate graph sync engine.

## install

[download the extension](https://github.com/wrsrsh/better-roam/releases/latest), unzip it, then open `chrome://extensions`. enable **Developer mode**, click **Load unpacked**, and select the extracted folder. reload Roam.

## shortcuts

| action | shortcut |
| --- | --- |
| new page | Alt+Shift+N |
| advanced search | Alt+Shift+O |
| command palette | ⌘K (Mac) / Ctrl+K |
| settings | Alt+Shift+S |

Alt is Option on Mac. customize at `chrome://extensions/shortcuts`; Chrome reserves shortcuts like Cmd+N and Cmd+O.

⌘K searches pages and block text. type `>` to show only commands. press Enter to open a result, Shift+Enter for the sidebar, or choose **Create** to make a page. settings, daily notes, sidebars, and Roam's full command menu are also available.

Advanced search is built into the same field: `"exact phrase"`, `in:"Page name"`, `ref:"Tag"`, `-exclude`, and `type:page` or `type:block`. Terms combine with AND; `ref:` matches direct references. Type `advanced` for an in-place filter suggestion.

Search runs only while the palette is open, with debouncing, at most one request at a time, and up to 40 graph results. ordinary search uses Roam's async search when available; advanced filters require its async query API and have a two-second query timeout; no extra graph index or background sync.

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

The animated startup astrolabe is replaced with a small static loading message. This is a visual change, not a cold-start cache or a promise of faster graph loading.

Better Roam keeps one Roam tab protected from Chrome’s automatic discarding. click the extension icon to return to that tab. keep it open to retain the loaded graph in RAM; closing the tab, quitting Chrome, crashes, or forced discards still require loading again. this is not a disk cache. no background graph polling.

Roam manages graph storage and sync. this is a Chrome extension only; old desktop releases remain historical.

unofficial. Roam's name and logo belong to Roam Research. theme derived from Alexander Rink's MIT-licensed Roam Studio; [license](vendor/theme/LICENSE).
