# Synqui mobile app

Expo (SDK 58) React Native app for Synqui, a daily interactive video story. iOS first.

## Run

```bash
cd mobile
npm install
npx expo run:ios        # needs a Mac with Xcode; the app uses native modules, so Expo Go will not work
```

## Story source: Convex or the offline demo

`mobile/.env` sets `EXPO_PUBLIC_CONVEX_URL` to the deployed backend (`https://reliable-opossum-456.convex.cloud`). Expo inlines `EXPO_PUBLIC_*` variables at bundle time, so a build plays the live story by default. To point at another deployment, change that line or put an override in `.env.local`.

Settings (the glyph at the top right of home, or in the player's controls) has a **Demo story** switch. It plays a bundled 6-beat street episode from `assets/mock/`, with artificial generation delays: "Cut under the overpass" at the first stop takes about 10 seconds, so the waiting state is always reachable. Without `EXPO_PUBLIC_CONVEX_URL` the app only has the demo.

The Convex provider calls `home:today`, `runs:startToday`, `runs:view`, `runs:choose`, `runs:answer`, `runs:speakUploadUrl`, `runs:speak` (an action), `users:setPhone` and `session:signOut` by name, with the types in `src/data/types.ts`. It imports nothing from `backend/`.

## Accounts

Sign-in is Clerk, and it is optional: without `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` the app is guest-only and behaves exactly as before. `mobile/.env` carries the Synqui application's publishable key (public by design), and `src/data/convexProvider.tsx` mounts `ClerkProvider` with `tokenCache` from `@clerk/expo/token-cache` around `ConvexProviderWithClerk`, so Convex attaches the Clerk token to every call.

Settings → **Account** has **Sign in**, which opens `src/components/SignInSheet.tsx`: one email field, one code field. The address is tried as a sign-in first; an address that has no account yet becomes a sign-up with the same kind of code. When a signed-in person taps **Sign out**, the app calls `session:signOut` first (this device goes back to a guest player) and Clerk's sign-out second.

A guest keeps playing without ever signing in. Signing in adopts the guest player on that device, so the streak and any live run come along, and signing in again on another device lands on the same player. `backend/docs/clerk.md` has the whole model, the dashboard steps and how to verify a token end to end.

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

`npx expo lint` is not set up in this repo: there is no eslint config, and the command tries to install
`eslint` and `eslint-config-expo` first, which currently fails on a peer-dependency conflict.
