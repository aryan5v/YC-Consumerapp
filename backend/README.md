# Synqui backend (Convex)

Story state, the director loop, character voice and the Keiki text thread for
Synqui, a daily interactive video story. This directory is the whole backend: it is a Convex project of
its own and it does not touch `mobile/`.

**Deployment the app should talk to:** `https://reliable-opossum-456.convex.cloud`
(site URL for HTTP tools: `https://reliable-opossum-456.convex.site`)

```
convex/
  schema.ts          users, sessions, episodes, runs, beats, clips, storyMessages, streaks
  home.ts            home.today()
  runs.ts            runs.startToday / view / choose / answer / speak / speakUploadUrl
  session.ts         guest, named and Clerk identities
  users.ts           users.setPhone, users.me
  auth.config.ts     the Clerk issuer Convex verifies tokens against
  episodes.ts        today's episode, seeds the days ahead
  director.ts        the director action: one shot, then the objects in that shot (validated, one retry, fixture fallback)
  custom.ts          "Dream a world": writes an episode seed from a typed description
  speech.ts          OpenAI text to speech per spoken line, stored in Convex file storage
  tray.ts            tray actions: claim an attempt, generate, poll on the accepting instance, segment, cancel
  keiki.ts           the two agent tools, and the outbound character text
  http.ts            /keiki/story, /keiki/reply, /keiki/health
  clips.ts beats.ts  internal writes for the orchestration
  world.ts           the open world: describe, direct, interact
  crons.ts           keeps the next days of episodes created
  lib/               tray adapter, H3 prompt builder, director schema and prompts, speech matcher, segmenter client, mock clips
docs/tray-api.md     the FastH3 video API this backend actually calls, and what it still needs
docs/keiki-agent.md  how to wire the Keiki agent, its prompt and its two tools
docs/clerk.md        the Clerk application, the dashboard steps and the client wiring
tests/               a full episode end to end in mock mode, the tray adapter, the speech matcher, the Clerk account model
```

## The shared contract with the app

```ts
query    home.today({ deviceToken })                       -> { episode: { id, date, title, tagline, posterUrl }, streak, run: { id, status } | null }
mutation runs.startToday({ deviceToken })                  -> runId
mutation runs.startCustom({ deviceToken, prompt })         -> runId   // "Dream a world", prompt <= 240 chars
query    runs.view({ runId, deviceToken })                 -> RunView
mutation runs.choose({ runId, expectedBeatId, optionId, actionId?, deviceToken }) -> null
mutation runs.answer({ runId, expectedBeatId, answer, deviceToken }) -> { correct: boolean }
mutation runs.speakUploadUrl({ runId, expectedBeatId, deviceToken }) -> uploadUrl
action   runs.speak({ runId, expectedBeatId, audioStorageId, deviceToken }) -> { transcript, matchedOptionId, correct, reply, replyAudioUrl }
mutation users.setPhone({ phone, deviceToken })            -> normalized number | null
query    users.me({ deviceToken })                         -> { id, name, phone, anonymous } | null
query    session.whoami({ deviceToken })                   -> { userId, name, anonymous } | null
mutation session.signInAnonymously({ deviceToken }) / signInAs({ name, deviceToken }) / signOut({ deviceToken }) -> userId
```

**`deviceToken` is how the backend knows which phone is which.** The app generates one opaque token
per install the first time it starts (6 to 128 characters of letters, digits, `.`, `:`, `_` or `-`),
stores it, and sends it on every call above. Each token gets its own player, its own streak and its own
run, so several phones at the table never share a story, and a run id that belongs to one token is
refused for another. `session.signInAs` still just puts a display name on the device's own player.

**Clerk is how the backend knows which person is which.** When a call carries a Clerk token — the app
attaches one automatically through `ConvexProviderWithClerk` — `ctx.auth.getUserIdentity()` names the
account, and that account's player is the one the call reads and writes, on whatever device it signed
in from. `deviceToken` stays required and unchanged; it is the install's own player for guests. See
[Clerk accounts](#clerk-accounts) and `docs/clerk.md`.

**`expectedBeatId` is how a late request is ignored.** Every advance names the beat it is answering.
If that beat is no longer current — the player tapped twice, or a speech result arrived after the story
moved on — the call is a no-op instead of advancing the wrong beat. Pass the `beatId` from the
`runs.view` you are reacting to.

```ts
RunView = {
  status: "active" | "ended"
  beatIndex: number
  beatsTotal: number
  current: { beatId, clipUrl: string | null, narration: string, status: "generating" | "ready" }
  stop: null
    | { kind: "choice"
        spokenLine: string
        spokenAudioUrl: string | null
        options: [{
          id: string
          label: string
          region: null | { centroid: { x, y }, polygon: [number, number][][] | null, maskUrl: string | null }
          actions: [{ id, label, childStatus: "generating" | "ready", childClipUrl: string | null }]
        }] }
    | { kind: "puzzle"
        spokenLine: string
        spokenAudioUrl: string | null
        question, answerType: "pick" | "number" | "text", choices: string[] | null,
        outcomes: { success: { status, clipUrl }, failure: { status, clipUrl } } }
  ending: null | { title, summary, path: string[],
                   text?: { character: string, number: string | null, prompt: string } }
}
```

An option is an **object the player can reach in the finished shot**, and its `actions` are the ways
to touch it; today there is exactly one action per object, so pass the option's first action id or
leave `actionId` out. Coordinates are fractions of the frame from 0 to 1, origin top left, and
`polygon` is **always an array of rings** — one ring for a whole object, several when the segmenter
found it split — with each ring capped at about 200 points. `region` is `null` until the segmentation
service is configured, and the app then draws a labelled chip in its place, exactly as it did for the
old `box`.

**Every clip URL is a Convex storage URL.** The finished MP4 is downloaded from the model server
inside the backend and copied into Convex file storage, so the app plays it with no credentials, and
range requests work (verified: `200` unauthenticated, `206` on `Range: bytes=0-1023`), which is what
iOS needs.

## How the app drives it

1. `home.today()` for the poster, the streak and whether a run is already live.
2. `runs.startToday()` once, then subscribe to `runs.view({ runId })` — it is a reactive query, so
   clips turning ready, spoken audio, glued outlines and the ending all arrive without polling.
3. On a choice stop, `runs.choose({ runId, expectedBeatId, optionId, actionId })`. On a puzzle stop,
   `runs.answer({ runId, expectedBeatId, answer })`. Or speak:
   `runs.speak({ runId, expectedBeatId, audioStorageId })`, which advances the run exactly as `choose`
   or `answer` would when it understands.
4. Show `stop.spokenLine` as a caption always, and play `stop.spokenAudioUrl` when the player has
   character voice on.

## Environment variables

Runtime variables live on the Convex deployment (`npx convex env set NAME value`). Mock mode is what
happens when the relevant pair is unset — it is not a misconfiguration.

| Variable | Default | Purpose |
| --- | --- | --- |
| `CLERK_JWT_ISSUER_DOMAIN` | unset (guests only) | The Clerk app's Frontend API URL, for example `https://verb-noun-00.clerk.accounts.dev`. Convex verifies every Clerk token against this issuer. Unset means the deployment takes no tokens and only guests play. `CLERK_FRONTEND_API_URL` is accepted as a fallback name. |
| `FASTH3_URLS` | unset (mock) | Comma-separated tray base URLs. Parallel children are spread across them. |
| `FASTH3_URL` | unset | Single tray base URL, kept for convenience. |
| `FASTH3_API_KEY` | unset | Sent as `Authorization: Bearer <key>` to the tray. |
| `FASTH3_MODEL` | `FastH3-Omni` | Model id the tray serves. |
| `FASTH3_TASK` | `ref2va` | Task field. `ref2va` is the only task the server accepts. |
| `FASTH3_SHORT_EDGE` | `768` | Short edge for the 480p/768p canvas selection. |
| `FASTH3_SUBMIT_TIMEOUT_MS` | `120000` | Timeout for the submit call. |
| `DETECT_URL` / `DETECT_API_KEY` | unset | Optional open-vocabulary detector. Unset means chips, never an error. |
| `DIRECTOR_PROVIDER` | `deepseek` | `openai` sends the OpenAI-shaped body (`max_completion_tokens`, no temperature). |
| `DIRECTOR_API_KEY` | falls back to `DEEPSEEK_API_KEY` | Director LLM key. Any key the endpoint accepts. |
| `DIRECTOR_BASE_URL` | per provider | Endpoint override, for example `https://api.openai.com/v1`. |
| `DIRECTOR_MODEL` | per provider | Director model, for example `gpt-5.4`. |
| `DEEPSEEK_API_KEY` | unset (fixture) | Director LLM key when the provider is DeepSeek. |
| `DEEPSEEK_BASE_URL` | `https://api.deepseek.com` | OpenAI-compatible endpoint override. |
| `DEEPSEEK_MODEL` | `deepseek-chat` | Director model. |
| `DIRECTOR_TIMEOUT_MS` | `60000` | DeepSeek request timeout. |
| `OPENAI_API_KEY` | unset (no audio) | Character voice: text to speech and transcription. |
| `OPENAI_TTS_MODEL` | `gpt-4o-mini-tts` | Speech model, 13 built-in voices. |
| `OPENAI_STT_MODEL` | `gpt-transcribe` | Transcription model. |
| `OPENAI_BASE_URL` | `https://api.openai.com/v1` | Endpoint override. |
| `OPENAI_TIMEOUT_MS` | `60000` | Speech and transcription timeout. |
| `KEIKI_API_KEY` | unset | Keiki org key; needed only for the character texting first. |
| `KEIKI_AGENT_ID` | unset | Agent id for Keiki's `/notice` route. |
| `KEIKI_AGENT_NAME` | unset | Agent name, used as the `model` on the OpenAI-compatible route. |
| `KEIKI_LINE` | unset | The agent's own line, E.164. |
| `KEIKI_TOOL_SECRET` | unset | Shared secret for the two tool endpoints. Unset means they answer 503. |
| `KEIKI_OUTBOUND` | follows the key | `0` disables agent-initiated texts. |
| `TRAY_POLL_MS` | `250` | Interval between job polls. |
| `TRAY_MAX_POLLS` | `150` | Polls before a clip is marked failed (about three minutes). |
| `MOCK_LATENCY_MS` | `1200` | Artificial delay before a mock clip is returned. |
| `EPISODE_BEATS` | `7` | Beats in an episode, ending included. |
| `EPISODE_SECONDS` | `5` | Requested clip length. |
| `EPISODE_ASPECT` | `9:16` | Requested aspect ratio. |
| `STYLE_IMAGE_URL`, `CHARACTER_SHEET_URL`, `VOICE_REF_URL` | placeholders | The fixed anchors, one set per deployment. |
| `LASTFRAME_URL`, `LASTFRAME_API_KEY` | unset | The gateway's `POST {LASTFRAME_URL}/gateway/last-frame` with `{"url": ...}` and a bearer token, returning a PNG. Unset means continuity falls back to the parent clip as a video reference, which is far too slow to inline, so keyframes are off. |
| `SEGMENT_URL`, `SEGMENT_API_KEY` | unset | The CONS-10 segmentation service: `POST {SEGMENT_URL}/segment` with `{ frame_url, targets }` and a bearer token, returning `{ results: [{ target, found, score, region }] }`. Unset means `region` is null and the app draws chips. |
| `OBJECTS_PER_BEAT` | `3` | How many reachable objects a choice beat offers. |
| `ACTIONS_PER_OBJECT` | `1` | How many ways to touch each object. Three objects fit the four model instances in one wave. |
| `CUSTOM_RUNS_PER_HOUR` | `6` | Per-device cap on `runs.startCustom`. |
| `MAX_ACTIVE_RUNS` | `12` | Deployment-wide cap on live runs. A run older than `ACTIVE_RUN_TTL_MS` stops counting and is ended. |
| `ACTIVE_RUN_TTL_MS` | `2700000` | How long a silent run keeps its slot. |
| `SPEECH_ATTEMPTS_PER_BEAT` | `4` | How many recordings one beat accepts. |
| `MAX_UPLOAD_BYTES` | `4000000` | Largest accepted recording. |
| `FASTH3_CONTINUITY_VIDEO` | on | `off` stops sending the parent clip as a `video` reference. |

`CONVEX_DEPLOY_KEY` is only needed to deploy (`npx convex deploy`); it is never a runtime variable and
must never be committed.

## The characters

Every beat ends with the character speaking. The director writes `spoken_line`, the backend generates
its audio with OpenAI text to speech in `convex/speech.ts` at the same moment the clip is requested,
stores it in Convex file storage and exposes it as `stop.spokenAudioUrl`. Each character has one fixed
voice per episode, derived from their name, and the character's own description is passed as the
delivery instruction. Clips carry ambient sound only — dialogue never goes into the video prompt.

The character who texts through Keiki is the same character, from `episode.character`, and what the
player texted is fed to the director when it writes the next episode's first beat, so the reply shows
up in that character's first line.

## Deploying

```bash
npx convex deploy                          # needs CONVEX_DEPLOY_KEY in the environment
npx convex run episodes:seed '{"days":8}'  # creates today's episode and the next eight days
```

The seed step matters: a query cannot create rows, so `home.today()` needs today's episode to already
exist. The hourly cron `episodes.ensureAhead` keeps nine days alive after that, and `runs.startToday()`
creates today's episode if it is somehow missing.

## Identity

Two layers, and the account wins when it is there.

**The install.** Each install generates one opaque `deviceToken` and stores it; the backend maps that
token to a player row in `users` (with the token kept in `sessions`), creates it on first sight, and
checks ownership of every run against it. One token, one guest player, one live run — which is what
makes several phones at the same table independent.

**The account.** With `CLERK_JWT_ISSUER_DOMAIN` set, a call that carries a Clerk token resolves to the
player with that Clerk user id, whichever device it came from, and the player is created on the first
signed-in call. `users.clerkUserId` is Clerk's `sub`, and `users.kind` is `clerk` for those players.
Everything else in the contract is unchanged: the same queries and mutations, the same `deviceToken`
argument, and `anonymous: false` from `session.whoami` and `users.me` for a signed-in player.

## Clerk accounts

The app signs in with Clerk; the backend never sees a password and never asks for one. What the
backend does with the token is in `convex/auth.config.ts` (issuer), `convex/lib/session.ts` (which
player a call belongs to) and `convex/schema.ts` (`users.clerkUserId`). `docs/clerk.md` has the
dashboard steps and the client wiring.

* **Signing in adopts the guest.** The first signed-in call on a device whose player is still a guest
  turns that player into the account's, so the streak and the live run follow the player in. The guest
  name they typed is kept unless Clerk has one.
* **One account, one player.** A second device that signs in with the same Clerk user lands on the same
  player and the same streak.
* **Signing out settles the device on a fresh guest player**, and the account keeps its streak and its
  runs. Do call `session.signOut({ deviceToken })` when Clerk signs out; it is what returns the device
  to a guest player instead of leaving it with none.
* **A guest can never reach an account's player.** A call with no verified token on a device whose
  player belongs to an account reads nothing (`users.me` and `session.whoami` answer `null`) and a
  mutation refuses with `sign in again, or call session.signInAnonymously to play as a guest` rather
  than writing to the wrong player. `session.signInAnonymously` is the call that says "this device is a
  guest now".
* **The device token is a session credential.** While it is bound to a signed-in player it reaches that
  account, so the app must keep it where it keeps secrets (iOS Keychain / `expo-secure-store`), not in
  plain `AsyncStorage`.
* **`session.signInAs`** still sets the story name. On a signed-in player it only changes the name and
  leaves the account link alone.

## Mock mode

Everything plays with no keys: with the tray unset the client returns stock public mp4 clips after
`MOCK_LATENCY_MS` and no boxes; with `DEEPSEEK_API_KEY` unset the director serves a hand-written
seven-beat street episode from `convex/lib/fixture.ts`; with `OPENAI_API_KEY` unset there is simply no
spoken audio and the app shows captions; with `KEIKI_API_KEY` unset the ending uses the text-and-code
fallback.

## Checks

```bash
npm run typecheck   # tsc --noEmit
npm test            # vitest: the playthrough, the tray adapter, the speech matcher, Keiki tools
npm run e2e         # just the playthrough, printing the beat-by-beat transcript
npm run smoke       # plays a whole episode against the deployed backend and prints the transcript
npm run custom -- "a floating market above the clouds at dawn"
                    # starts a run from a typed description and prints each clip URL as it becomes ready
```

`npm run smoke` is the fastest way to tell whether the director and the tray are healthy: it starts a
run, waits for each stop, picks the first option or answers each puzzle, and prints the ending, the
path and the text block. Add `-- --prod` to target the linked production deployment, or
`-- --answer 4187` to force an answer. When a beat never produces a stop it says so, which is what a
rejected director key or an unreachable tray looks like from the outside.

## Known gaps

* Continuity is weaker than it should be: FastH3 returns no last frame and the gateway exposes no frame
  route yet, so a continuing shot sends the parent clip as a `video` reference instead of a keyframe
  image. Inlining that video is too slow (a 7.6 MB body took 103 s to be accepted), so `FASTH3_CONTINUITY_VIDEO=off`
  is the honest default until `LASTFRAME_URL` exists. With it off, shots share the character sheet and
  the style anchor but not the exact frame.
* `region` is always null until `SEGMENT_URL` is set, so options arrive as chips.
* `runs.speak` cannot be covered end to end without network access from the test runtime; the
  deterministic matcher, the grading and the clean-failure path are covered instead. The same is true
  of the OpenAI and FastH3 calls themselves: they are exercised against the live services by
  `npm run smoke` and `npm run custom`, not by the unit suite.
* The 9:16 request comes back as 768x1344 (4:7) because the server rounds the long edge to a multiple
  of 16. Portrait and playable, not exactly 9:16.
