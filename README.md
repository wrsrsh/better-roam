# Better Roam

Better Roam is a Chrome extension for Roam Research.

Here’s what we add to [Roam Research](https://roamresearch.com):

- Light and dark themes with less visual clutter.
- A compact command palette for pages, blocks, and commands. Opening a page
  puts the cursor at the end of its last block, so Enter continues the page.
- Advanced search with page, reference, and text filters.
- Quick page creation and keyboard shortcuts.
- On graph load, delete empty pages with no mentions. Whitespace-only blocks
  count as empty; embeds, properties, and references to child blocks preserve a
  page. Pages being edited are skipped until a later load.

## Development

Requires Node.js 24+.

```sh
npm ci
npm run dev
```

Load `extension/.output/chrome-mv3` in Chrome. Run `npm test` and `npm run typecheck` to check changes; `npm run zip` packages a release.
