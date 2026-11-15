# Synqui · The other shore

An original, self-contained Three.js coastal world for the Synqui app's WebView. Everything is generated locally: terrain, trees, rocks, sea, sky, landmarks and sound. The only bundled asset is the Paper Mono typeface (SIL Open Font License, `src/fonts/OFL.txt`, shipped next to the font files in `dist/assets`). The only runtime dependency is Three.js. Nothing is fetched from the network.

```sh
cd world
npm ci
npm run dev      # http://localhost:5173
npm run build    # writes dist/
```

`dist/` is the whole production site. It uses relative URLs (`base: './'`), so it works below any path or from a local origin inside the app bundle. If you load it over `file://`, the WebView must allow file access for module scripts (`allowFileAccess` / `allowingReadAccessToURL`). A local origin is the safest choice.

## What the player sees

- Endless seeded coast: hills, a winding path, sea, trees, rocks and grass. The world is built from 48 m chunks, a 7×7 grid around the player that is created and disposed as they move. Deep water blocks walking.
- Touch: drag the left half to walk (a glass thumb ring appears) and the right half to look. Both thumbs work at the same time. A tap with no drag interacts. Desktop: WASD or arrow keys to walk, Shift to run, drag the mouse to look, click to interact.
- The camera eases its turns and its speed, with a gentle head bob and sway tied to the steps.
- Render resolution drops when frames run over 22 ms and climbs back when they're under 17 ms.
- Time of day: one game day lasts 240 real seconds, starting at dusk. A painted sky with soft clouds, a sun, a large moon, stars, haze mountains, fog and light colour change through dawn, day, dusk and night. The theme lives in `src/theme.ts`: Moonstone (#E8EEF1) for light, outlines and text, Lagoon (#0E2C36 to #071A21) for water and night depth, and Blossom (#FF8E9E) only for the selection fill and one small warm light per landmark. Wind-blown grass, pale flowers and drifting motes fill the near field.
- Overlays, in Paper Mono, styled as minimal glass: the day and clock pill, the thumb ring, and the name pill of the thing in reach. Nothing else.
- Things, placed by the seed along the path and repeated every 192 m: lantern, cloaked stranger (turns to face you), well, stone arch, cabin, rowboat at the shore, lighthouse. Within reach (about 5.5 m beyond the thing's radius), a thing gets a Moonstone silhouette outline. A tap fills it with a Blossom-to-Moonstone gradient for 300 ms, then the world sends `interact`.
- Sound, all synthesised with WebAudio: wind in gusts, footsteps that change with the ground (path, grass, rock, shore), surf near the shore, night insects, and a quiet drone chord that shifts with the time of day. Audio starts on the first touch, because iOS requires a user gesture.

## Host bridge (version 1)

**World → host.** Messages are sent as JSON strings through `window.ReactNativeWebView.postMessage` inside React Native, and as objects through `window.parent.postMessage(message, '*')` otherwise.

| Message | When |
| --- | --- |
| `{ type: 'ready', version: 1, seed }` | First frame rendered |
| `{ type: 'clock', timeOfDay, day }` | Once per second while running. `timeOfDay` is in fractional hours, 0–24 |
| `{ type: 'interact', thingId, name, description, screenshot, timeOfDay, day, position: {x,y,z}, seed }` | 300 ms after a tap on a thing in reach |
| `{ type: 'error', code: 'capture_failed', message }` | Capture threw |
| `{ type: 'configured', preset, seed, timeOfDay }` | After a `configure` |

`screenshot` is a `data:image/jpeg;base64,…` URL, 1280 px wide, at the current aspect ratio (about 1280×2770 on an iPhone in portrait). It is rendered straight from the scene, so it never contains the outline, the selection fill, the ASCII effect, the clock, the name pill or the touch ring.

`thingId` is stable for a given seed: `<seed>:<sector>:<kind>`, for example `8741:0:stranger`. Kinds are `lighthouse`, `arch`, `boat`, `cabin`, `lantern`, `well` and `stranger`.

**Host → world.** The world accepts a JSON string or an object, from `message` events on `window` or `document`, or directly through `window.SynquiWorld.receive(message)` (from `injectJavaScript`). Invalid messages are ignored.

| Message | Effect |
| --- | --- |
| `{ type: 'setSeed', seed: number \| string }` | Rebuilds the world and returns the player to the start |
| `{ type: 'setTime', timeOfDay: number, day?: number }` | Jumps the clock. `timeOfDay` is in hours and wraps to 0–24. `day` must be 1 or more |
| `{ type: 'pause' }` / `{ type: 'resume' }` | Freezes or continues simulation and input. Pause silences all audio |
| `{ type: 'setAscii', amount: 0..1, durationMs?: number }` | Eases between the normal picture (0) and full Paper Mono ASCII (1), sweeping from the top down. Default 600 ms |
| `{ type: 'setSound', on: boolean }` | Ambience and footsteps |
| `{ type: 'setMusic', on: boolean }` | Music bed |
| `{ type: 'mute', muted: boolean }` | Both of the above |
| `{ type: 'applyOutcome', thingId, change }` | Changes a thing after a scene. `change` keys: `lit: boolean` (lanterns, windows, lighthouse), `doorOpen: boolean` (cabin, lighthouse), `gone: boolean` (hides it, for example the boat), `position: {x?,y?,z?}` in world metres (for example the stranger moved). Outcomes persist while the seed is unchanged, including when chunks reload |
| `{ type: 'configure', preset?, seed?, timeOfDay?, palette?: { sky?, fog?, ground?, water?, accentLight? }, weather?, landmarks?: [{ slot, name, description }] }` | Restyles the world without a reload. See below |

### configure (Dream a world)

Each `configure` is a complete restyle. Fields you leave out go back to the defaults, unknown fields are ignored, and invalid values are dropped.

- `preset`: one of `misty-dawn-coast`, `golden-meadow`, `moonlit-snow` or `cloud-sea`. Other fields in the same message override the preset. The same presets load from the URL, for example `index.html?preset=cloud-sea`, so a world can be shown without the backend.
- `seed`: rebuilds the terrain and resets the player, as `setSeed` does. `timeOfDay`: hours, wrapped to 0–24.
- `palette`: `#rgb` or `#rrggbb` colours only. Each colour is clamped so the world stays readable: sky lightness 0.14–0.8 and saturation at most 0.45, fog lightness 0.2–0.95, water lightness 0.06–0.95, accent light lightness 0.45–0.95. `sky` tints the zenith, horizon, ambient light and far mountains. `fog` tints the haze, the horizon and the clouds. `ground` tints the terrain, grass and leaves (a very light ground, such as snow, tints strongly). `water` sets the sea's deep colour. `accentLight` tints the sunlight and moonlight. Sky and fog tints are weaker at night, so nights stay dark. Blossom stays reserved for the selection fill.
- `weather`: `clear` (fewer clouds), `cloudy`, `mist` (thick haze), `rain` (overcast with haze) or `snow` (falling snow, pale ground at night).
- `landmarks`: `slot` is a landmark kind (`lighthouse`, `arch`, `boat`, `cabin`, `lantern`, `well`, `stranger`). `name` (up to 60 characters) and `description` (up to 280) replace what the name pill shows and what `interact` sends, for every instance of that kind. Slots you don't list keep their built-in names.

The world answers with `{ type: 'configured', preset, seed, timeOfDay }`.

`window.SynquiWorld.getState()` returns diagnostics for integration tests: position, yaw, time, seed, paused, ASCII amount, audio state, chunk count, pixel ratio, and every thing with its screen position and reachability. It shows nothing on screen.

Typical scene flow: `interact` → host sends `setAscii {amount:1}` while the clip generates → `pause` while the video plays → `applyOutcome` → `resume` → `setAscii {amount:0}`.

## Verification status

- TypeScript and the Vite production build pass.
- Chromium at 390×844 with touch emulation, driven through CDP: left-thumb walking, right-thumb look, a tap on the stranger delivering `interact` with a clean 1280-wide JPEG, the ASCII dissolve, `applyOutcome` hiding the boat, pause stopping audio, and midnight rollover.
- Not yet verified on a real iPhone or in WKWebView: frame rate, audio output, and touch feel. 60 fps is the design target, and adaptive resolution is the fallback.

## Original work

The castle-valley README was read for high-level techniques only: instancing, distance mist, adaptive resolution and split-screen touch. No code, assets, textures or models from that unlicensed repository are included.
