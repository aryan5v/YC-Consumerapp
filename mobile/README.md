# Fork mobile app

Expo (SDK 58) React Native app for Fork, a daily interactive video story. iOS first.

## Run

```bash
cd mobile
npm install
npx expo run:ios        # needs a Mac with Xcode; the app uses native modules, so Expo Go will not work
```

## Story source: Convex or the offline demo

`mobile/.env` sets `EXPO_PUBLIC_CONVEX_URL` to the deployed backend (`https://reliable-opossum-456.convex.cloud`). Expo inlines `EXPO_PUBLIC_*` variables at bundle time, so a build plays the live story by default. To point at another deployment, change that line or put an override in `.env.local`.

Settings (the glyph at the top right of home, or in the player's controls) has a **Demo story** switch. It plays a bundled 6-beat street episode from `assets/mock/`, with artificial generation delays: "Cut under the overpass" at the first stop takes about 10 seconds, so the waiting state is always reachable. Without `EXPO_PUBLIC_CONVEX_URL` the app only has the demo.

The Convex provider calls `home:today`, `runs:startToday`, `runs:view`, `runs:choose`, `runs:answer`, `runs:speakUploadUrl`, `runs:speak` (an action) and `users:setPhone` by name, with the types in `src/data/types.ts`. It imports nothing from `backend/`.

## Voice

- **Character voice:** when a stop has `spokenAudioUrl` and the setting is on, the line plays over the held scene and the clip audio ducks. `spokenLine` always shows as the caption.
- **Microphone:** hold the mic at a stop to answer out loud. The recording is uploaded through `runs.speakUploadUrl` and sent to `runs.speak`. The control is hidden when the stop has no spoken audio, when the setting is off, when permission is denied, or after `runs.speak` fails. Tapping always works.

## Build a simulator binary (Revyl or any Mac runner)

```bash
npm ci
npx expo prebuild --platform ios --clean
xcodebuild -workspace ios/Fork.xcworkspace -scheme Fork -configuration Release \
  -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath ios/build ARCHS=arm64 ONLY_ACTIVE_ARCH=NO CODE_SIGNING_ALLOWED=NO -quiet
# output: ios/build/Build/Products/Release-iphonesimulator/Fork.app
```

## Layout

- `App.tsx`: picks the story provider from settings, then home and player, cross-faded once the first frame is ready.
- `src/screens/Player.tsx`: four stacked video players. One shows the current clip; the others preload each child clip as soon as its URL appears, and a tap swaps to the preloaded player with no black frame. A 16:9 clip letterboxes over a blurred frame of itself.
- `src/components/`: choice outlines and chips, puzzle sheet, ending card, captions, beat dots, mic, settings.
- `src/data/`: the `StoryProvider` interface, the mock and Convex implementations, and the mock episode.
- `src/theme.ts`: every color, gradient, glow value, radius, type size and motion duration. `colors.glow` is the single accent and is used only for choice targets.

## Checks

```bash
npx tsc --noEmit
npx expo-doctor
```
