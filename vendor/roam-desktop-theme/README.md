# roam desktop theme

Craft-based styling bundled directly into Roam Desktop. No extension runtime or Depot installation.

Fork: https://github.com/wrsrsh/roam-desktop-theme
Upstream: https://github.com/rcvd/RoamStudio (MIT, Alexander Rink).

This directory vendors the CSS needed for Craft Auto and Feather icons. `desktop.css` holds our defaults and overrides. Edit any CSS here and rebuild the app. The Rust build concatenates it into a startup stylesheet; nothing is downloaded at runtime. The upstream extension's JavaScript is not shipped or executed.

Roam Studio styles already installed in a graph are suppressed only inside this app. This does not change the graph or its browser appearance.
