# Better Roam

Here’s what we add to [Roam Research](https://roamresearch.com):

- Light and dark themes with less visual clutter.
- A compact command palette for pages, blocks, and commands.
- Advanced search with page, reference, and text filters.
- Quick page creation and keyboard shortcuts.

## Development

Requires Node.js 24+.

```sh
npm ci
npm run dev
```

Load `extension/.output/chrome-mv3` in Chrome. Run `npm test` and `npm run typecheck` to check changes; `npm run zip` packages a release.
