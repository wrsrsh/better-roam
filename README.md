# roam desktop

a little macOS wrapper for [roam research](https://roamresearch.com). built with tauri and the Mac's own webview. no title bar, just your graph and a `⋯` menu.

closing the window or pressing `⌘Q` keeps your graph running in the background and hides the Dock icon. open the app again to pick up where you left off. `⇧⌘Q` quits completely.

it still uses memory while hidden. a reboot or full quit means loading the graph again. macOS 14+ keeps the background webview awake; older versions may suspend it.

## install

[download the DMG](https://github.com/wrsrsh/roamdesktop/releases/latest), open it, and drag Roam Desktop into Applications. Apple Silicon, macOS 12+.

it's ad-hoc signed, not Apple-notarized. if macOS blocks it and you trust the app, use **System Settings → Privacy & Security → Open Anyway**.

## dev

requires Node.js, Rust, and Xcode Command Line Tools.

```sh
npm install
npm run dev
npm run build # builds the app and DMG
```

unofficial. Roam Research's name and logo belong to their owner.
