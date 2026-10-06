# betterX

Chrome MV3 extension for `https://x.com` and `https://twitter.com`.

## Features

- Automatically hides timeline tweets that contain X/Twitter video players.
- Adds a bottom-right manager button, following the floating panel style used by `BiliPocketReader`.
- Stores preferences with `chrome.storage.local`.
- Supports temporarily revealing hidden video tweets without losing detected state.
- On a `/status/...` detail page, detects every image, animated GIF, and video in the
  current post. Images are converted locally to standard sRGB PNG, animated GIFs
  are converted locally from X's MP4 source to real GIF files, and videos use the
  highest-bitrate MP4 variant.
- Saves media directly under `Downloads/betterX/` using
  `<account>_<tweet-id>_<number>_<type>.<ext>` filenames.

## Install

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Choose **Load unpacked**.
4. Select this `betterX` folder.

## Download media

1. Open an X/Twitter status page, for example `https://x.com/user/status/123...`.
2. Click the floating **X** button in the lower-right corner.
3. In **下载本帖媒体**, click **下载全部**.

X delivers animated GIFs as MP4 files, so betterX decodes and re-encodes them
locally. GIF output is capped at 640 px on its longest edge (480 px for longer
animations), 150 frames, and the first 30 seconds; longer/larger animations are
reduced to keep browser memory bounded.
If a video has not been discovered yet, play it once and click **重新识别媒体**.

The bundled `gif.js` 0.2.0 encoder is distributed under the MIT license; its
license is included under `vendor/gif.js-0.2.0/LICENSE`.

## Code structure

The isolated-world scripts load in the order listed in `manifest.json`. They
share a small `globalThis.BetterX` namespace; each page service owns its state.

| File | Responsibility |
| --- | --- |
| `media.js` | Status parsing, trusted media URLs, original image URLs, deduplication identities, video variants and filenames. |
| `timeline.js` | Tweet detection, hiding/restoring cells, counts and debounced observation. |
| `downloads.js` | Page/API media discovery, download state, runtime requests and conversion progress. |
| `manager.js` | Floating button, panel, setting controls and user messages. |
| `content.js` | Settings storage and composition of the page services. |
| `page-observer.js` | Main-world API response observation; sends metadata over the validated page-message bridge. |
| `background.js` | Revalidates download requests and coordinates direct downloads and offscreen conversion. |
| `offscreen.js` | Local PNG/GIF conversion and temporary blob URLs. |

Page services communicate through callbacks supplied by `content.js`. The
main-world observer and extension worker stay in their separate execution
contexts. URL validation in the worker remains the final download boundary.

The entrypoint exposes `BetterX.contentApp.init()` and `destroy()` for explicit
lifecycle management. Initialization is idempotent and discards late storage
reads after destruction. Failed settings reads use defaults; queued saves retain
their order and restore persisted settings after failure. Final page exits remove
observers, listeners, UI and hidden-tweet markers; cached pages retain services
for browser restoration.

Run the tests from the repository root with:

```powershell
node --test betterX/tests/*.test.js
```
