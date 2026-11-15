# Fork mobile app

Expo (SDK 58) React Native app for Fork, a daily interactive video story. iOS first.

## Run

```bash
cd mobile
npm install
npx expo run:ios        # needs a Mac with Xcode; the app uses native modules, so Expo Go will not work
```

With no configuration the app runs on the mock provider: a 6-beat street-scene episode from clips bundled in `assets/mock/`, with artificial generation delays (one branch of the first choice takes about 10 seconds, so the waiting state is always reachable).

## Point it at a Convex deployment

Set the deployment URL before bundling. Expo inlines `EXPO_PUBLIC_*` variables at build time.

```bash
echo 'EXPO_PUBLIC_CONVEX_URL=https://<deployment>.convex.cloud' > .env.local
```

When the variable is set, `src/data/index.ts` picks the Convex provider; when it is unset, the mock. The Convex provider calls `home:today`, `runs:startToday`, `runs:view`, `runs:choose` and `runs:answer` by name, with the types in `src/data/types.ts`, so it does not import anything from `backend/`.

## Build a simulator binary (Revyl or any Mac runner)

```bash
npm ci
npx expo prebuild --platform ios --clean
xcodebuild -workspace ios/Fork.xcworkspace -scheme Fork -configuration Release \
  -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath ios/build ARCHS=arm64 ONLY_ACTIVE_ARCH=NO CODE_SIGNING_ALLOWED=NO -quiet
# output: ios/build/Build/Products/Release-iphonesimulator/Fork.app
```

For a Convex build, prefix the prebuild and xcodebuild commands with `EXPO_PUBLIC_CONVEX_URL=...` or commit nothing and write `.env.local` as the first build command.

## Layout

- `App.tsx`: home and player, cross-faded once the first frame is ready.
- `src/screens/Player.tsx`: four stacked video players. One shows the current clip; the others preload each child clip as soon as its URL appears, and a tap swaps to the preloaded player with no black frame.
- `src/components/`: choice outlines and chips, puzzle sheet, ending card, captions, beat dots.
- `src/data/`: the `StoryProvider` interface, the mock and Convex implementations, and the mock episode.
- `src/theme.ts`: colours and type. `colors.glow` is the single accent and is used only for choice targets.

## Checks

```bash
npx tsc --noEmit
```
