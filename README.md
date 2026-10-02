# Roam Desktop

An unofficial, independent macOS Tauri app that loads Roam Research directly in the system WebKit view. No bundled Chromium, frontend framework, title bar, or toolbar.

## Run

Requires Node.js, Rust, and Xcode Command Line Tools.

```sh
npm install
npm run dev
```

Build a macOS app:

```sh
npm run build
```

The app is written to `src-tauri/target/release/bundle/macos/Roam Desktop.app`; the drag-to-Applications DMG is in `src-tauri/target/release/bundle/dmg/`. Builds use free ad-hoc signing.

## Install

Download the DMG from [GitHub Releases](https://github.com/wrsrsh/roamdesktop/releases), open it, and drag Roam Desktop into Applications. Requires macOS 12 or later. The initial release is Apple Silicon (arm64); Intel users must build from source on an Intel Mac.

This app is **ad-hoc signed, not Developer ID signed or Apple-notarized**. macOS may block a downloaded copy. After reviewing the source and trusting the release, use macOS System Settings → Privacy & Security → Open Anyway if offered. Do not disable Gatekeeper globally.

Release assets include SHA-256 checksums. Verify a download with `shasum -a 256 <downloaded-file.dmg>` and compare it to `SHA256SUMS.txt`.

## Signing and releases

`bundle.macOS.signingIdentity` is set to `-` for ad-hoc signing. No Apple credentials are required. Verify the app using:

```sh
codesign --verify --deep --strict --verbose=2 'src-tauri/target/release/bundle/macos/Roam Desktop.app'
```

Apple-trusted distribution needs a Developer ID certificate and notarization through an eligible Apple Developer Program membership. Ad-hoc signing does not provide that trust. See [Apple Developer ID](https://developer.apple.com/developer-id/).

A manually triggered GitHub Actions workflow can build another installer. It is not run automatically; macOS runner use may consume paid minutes on private repositories. Local builds avoid GitHub runner costs. Auto-updates are not configured; install newer release DMGs manually.

## Window behavior

- Native macOS rounded corners and window shadow, with the title and traffic-light buttons hidden.
- The top-right `⋯` opens Back, Reload, Full Screen, Minimize, and Close Window.
- Drag the `⋯` button to move the window.
- Close Window / Cmd+W hides the window, retaining the loaded graph and webview in memory.
- Open Roam Desktop from Applications or Spotlight to bring it back.
- Cmd+Q / Keep Roam in Background hides the window without destroying the webview or loaded graph. The process continues using memory, but its Dock icon and app-switcher entry disappear while hidden.
- Shift+Cmd+Q / Quit Completely exits the process and releases its memory.
- Launching the running app brings back the same window without reloading it.
- macOS shutdown/restart and Force Quit still terminate the app; this does not keep a graph alive across reboot.
- Standard Edit menu actions support copy/paste and text editing.

## Persistence

WebKit's normal persistent website storage holds cookies and whatever local data Roam itself stores. The wrapper also remembers the last `#/app/…` route. It does not copy graph contents, intercept Roam's network requests, or implement a separate sync engine.

On macOS 14+, background webview suspension is disabled to keep the hidden graph ready (this can use more energy). On older macOS versions, WebKit may suspend hidden content. A hidden window normally avoids rebuilding the page on reopen. A full quit, restart, webview crash, or logout can still require loading/authentication/network access. This is not a guarantee of offline graph access. Roam controls its data caching and sync. Sign-in and graph loading should be checked with your own account, including any provider-specific popup flow.

Only a short list of window-control permissions is granted to `https://roamresearch.com/*`; no filesystem, shell, or process permissions are exposed to the website.

## External-browser login limitation

Google/Apple sign-in currently follows Roam's own in-app flow. The inspected Roam Google OAuth flow returns to `https://roamresearch.com/__/auth/handler`. Opening that URL in a separate browser does not establish a session in this app's WebKit storage. A complete browser-to-app login needs a supported Roam authentication handoff (or an authorized OAuth integration with a registered return URI). No external redirect or placeholder callback is enabled, since that would leave the app signed out.

## App icon

Uses Roam’s official 512px app icon from https://roamresearch.com/assets/astro-512.png, listed in its web app manifest. Source asset: `assets/roam-logo.png`; macOS icon: `src-tauri/icons/icon.icns`.

Roam Research’s name and icon belong to their respective owner. This wrapper is not affiliated with or endorsed by Roam Research. No license to the Roam service or branding is granted by this repository.
