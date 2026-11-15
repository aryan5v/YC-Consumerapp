# Synqui · The other shore

An original, self-contained Three.js coastal world for the Synqui WebView. All geometry, skies, vegetation, water and effects are generated locally. No external assets, fonts, network services, or runtime dependencies beyond Three.js.

```sh
cd world
npm ci
npm run dev
npm run build
```

`dist/` is the production website. Serve its whole directory or bundle it in a WebView with a local HTTP origin. Vite uses `base: './'`, so it works below any URL path. The build does not need network access after loading its local HTML, JS and CSS. Direct `file://` module loading depends on WebView settings; use a local origin rather than assuming it works.

## Controls and world

Drag the left half to walk; drag the right half to look. Two thumbs work simultaneously. Tap without dragging to interact. Desktop: WASD/arrows, Shift to run, drag to look. The world follows a continuous seeded shoreline, with a winding path, inland hills, trees, rocks, and shallow water. Forty-nine terrain chunks surround the player; outgoing chunks and GPU instance buffers are disposed. Deep water stops movement. Render resolution adapts to frame time.

A day is 240 real seconds while running. Dawn, daytime, dusk and night have different sky, fog and light palettes. The world displays only a small day/clock, the active thumb ring and an interaction label. The host owns all other UI.

## Host bridge (version 1)

World-to-host messages are JSON strings through `window.ReactNativeWebView.postMessage` in React Native. In a browser iframe they are objects through `window.parent.postMessage(message, '*')`. The host should validate the source iframe. Do not put credentials in world messages.

Host-to-world accepts a JSON string or object on `window` or `document`'s `message` event. The host may alternatively inject `window.ForkWorld.receive(message)`. Invalid messages are ignored.

| Direction | Message |
| --- | --- |
| World → host | `{ type: 'ready', version: 1, seed }` |
| Host → world | `{ type: 'setSeed', seed: number \| string }` resets terrain and player |
| Host → world | `{ type: 'setTime', timeOfDay: number, day?: number }` uses fractional hours, normalized into 0–24; day is at least 1 |
| Host → world | `{ type: 'pause' }` freezes simulation and clears held inputs |
| Host → world | `{ type: 'resume' }` continues without catching up the paused time |

`window.ForkWorld.getState()` returns diagnostic state for integration tests; no controls or diagnostic UI are shown in the world.

## Verification status

The initial build passes TypeScript and Vite production compilation. Chromium at 390×844 with touch emulation verifies walking and midnight day rollover. Actual iPhone/WKWebView performance is not yet measured; 60 fps is a target, not a verified claim.

## Original work

The castle-valley README was read for high-level techniques (instancing, distance mist, adaptive resolution, split touch controls). No code, assets, textures or models from that unlicensed repository are included.
