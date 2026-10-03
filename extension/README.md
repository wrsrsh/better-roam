# Better Roam

An unofficial Chrome extension built with WXT. Shares Roam Desktop's Craft theme and UI fixes without adding a frontend framework. Everything is bundled: no Roam Studio or other Roam Depot extension is required.

- Themed new-page prompt and automatic first-block focus.
- Advanced search, command palette, and settings shortcuts.
- Hidden navbar search, sidebar logo, and topbar divider.
- Simple dialog fades and no intermediate command-palette flash.
- The toolbar button reuses an existing Roam tab or creates a pinned one. Chrome remains free to discard inactive tabs.
- External links open in separate tabs. Roam keeps its own login and storage.

## Install

From this directory, run `npm ci` and `npm run build`. Open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select `extension/.output/chrome-mv3`. Reload your Roam tab after installation or updates.

`npm run zip` creates a distributable ZIP in `.output`. It must be extracted before loading unpacked; this is not a Chrome Web Store listing.

## Shortcuts

| Action | Default |
| --- | --- |
| New page | Alt+Shift+N |
| Advanced search | Alt+Shift+O |
| Command palette | Alt+Shift+K |
| Settings | Alt+Shift+S |

On macOS, Alt means Option. Remap at `chrome://extensions/shortcuts`. Chrome reserves browser shortcuts such as Cmd+N and Cmd+O, so the extension cannot promise the desktop app's exact shortcuts. The shared page-level Cmd shortcuts also work when Chrome delivers them to the page.

For search performance, enable Roam Settings → Preferences → **Experimental: Better search**, if available, and disable **Search reference counts**. These are Roam account preferences, not extension defaults; the desktop session already has them configured.

Access is limited to `https://roamresearch.com/*`, for content scripts and finding existing Roam tabs. No analytics, external services, or graph exports. The page-context script uses Roam's own API; it has no privileged extension API bridge. No page cleanup/deletion is performed.

Chrome/Roam retain their normal disk cache and persistent website storage. The extension does not duplicate graph contents, cache authenticated responses, or implement an offline sync engine. Restoring a discarded or closed tab can still require graph loading and network access.

A browser extension cannot keep a graph alive after its tab or Chrome closes, control the macOS Dock, or replace Chrome's window frame. Those remain desktop-only features. Disabling or uninstalling requires reloading Roam to remove injected styles and handlers.

## Development

`npm run dev` starts WXT; `npm run typecheck` checks TypeScript. Generated runtime code is built directly from `../src-tauri/src/controls.js`, `theme-template.js`, and the vendored theme. Do not edit `generated/`.

Roam's name and icon belong to Roam Research. This project is independent and not endorsed by Roam Research. The bundled theme's MIT license is included as `THEME-LICENSE.txt`.
