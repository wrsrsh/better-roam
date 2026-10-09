# Better Roam extension

See the [project README](../README.md) for installation, shortcuts, and development.

WXT entrypoints live in `entrypoints/`. Page controls and theme injection live in
`runtime/`. `scripts/prepare-shared.mjs` bundles them with `../vendor/theme` before
each build; do not edit `generated/`.

Access is limited to `https://roamresearch.com/*`. External links open in new tabs.
No analytics, graph exports, custom IndexedDB cache, or separate sync engine.
Reload Roam after updating, disabling, or uninstalling the extension.

The background service worker only handles toolbar clicks and keyboard shortcuts.
It does not run startup jobs, poll graphs, intercept navigation, or retain tabs.
`runtime/loading.css` centers Roam's native loading astrolabe and makes it 15%
smaller while preserving its animation.
