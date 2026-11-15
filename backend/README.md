# Fork backend (Convex)

Story state, the DeepSeek director, the prefetch loop, character voice and the Keiki text thread for
Fork, a daily interactive video story. This directory is the whole backend: it is a Convex project of
its own and it does not touch `mobile/`.

**Deployment the app should talk to:** `https://reliable-opossum-456.convex.cloud`
(site URL for HTTP tools: `https://reliable-opossum-456.convex.site`)

```
convex/
  schema.ts          users, sessions, episodes, runs, beats, clips, storyMessages, streaks
  home.ts            home.today()
  runs.ts            runs.startToday / view / choose / answer / speak / speakUploadUrl
  session.ts         anonymous identity, named accounts
  users.ts           users.setPhone, users.me
  episodes.ts        today's episode, seeds the days ahead
  director.ts        the DeepSeek action (validated, one retry, fixture fallback)
  speech.ts          OpenAI text to speech per spoken line, stored in Convex file storage
  tray.ts            tray actions: generate, poll, detect, cancel
  keiki.ts           the two agent tools, and the outbound character text
  http.ts            /keiki/story, /keiki/reply, /keiki/health
  clips.ts beats.ts  internal writes for the orchestration
  crons.ts           keeps the next days of episodes created
  lib/               tray adapter, director schema and prompt, speech matcher, mock clips
docs/tray-api.md     what the FastVideo UniServe tray needs to provide
docs/keiki-agent.md  how to wire the Keiki agent, its prompt and its two tools
tests/               a full episode end to end in mock mode, the tray adapter, the speech matcher
```

## The shared contract with the app

```ts
query    home.today()                        -> { episode: { id, date, title, tagline, posterUrl }, streak: number, run: { id, status: "active" | "ended" } | null }
mutation runs.startToday()                   -> runId
query    runs.view({ runId })                -> RunView
mutation runs.choose({ runId, optionId })    -> null
mutation runs.answer({ runId, answer })      -> { correct: boolean }
mutation runs.speakUploadUrl()               -> uploadUrl
action   runs.speak({ runId, audioStorageId }) -> { transcript, matchedOptionId, correct, reply, replyAudioUrl }
mutation users.setPhone({ phone })           -> normalized number | null
query    session.whoami()                    -> { userId, name, anonymous } | null
mutation session.signInAnonymously() / session.signInAs({ name }) / session.signOut() -> userId
```

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
        options: [{ id, label, box: { x, y, w, h } | null,
                    childStatus: "generating" | "ready", childClipUrl: string | null }] }
    | { kind: "puzzle"
        spokenLine: string
        spokenAudioUrl: string | null
        question, answerType: "pick" | "number" | "text", choices: string[] | null,
        outcomes: { success: { status, clipUrl }, failure: { status, clipUrl } } }
  ending: null | { title, summary, path: string[],
                   text?: { character: string, number: string | null, prompt: string } }
}
```

Boxes are fractions of the frame, 0 to 1, origin top left. A `null` box means draw a labelled chip.

Notes the app thread needs:

* **`runs.speak` is an action, not a mutation.** It calls OpenAI, and only an action can do that in
  Convex. Call it with `useAction` and `api.runs.speak`. Upload the recording first: call the mutation
  `runs.speakUploadUrl()`, POST the bytes to that URL, then pass the returned storage id as
  `audioStorageId`.
* **Voice is optional and independent of tapping.** When `stop.spokenAudioUrl` is `null` there is no
  audio for that line — show the caption and hide the microphone. With no `OPENAI_API_KEY` on the
  deployment, `spokenAudioUrl` is always null and `runs.speakUploadUrl` / `runs.speak` throw a clear
  error instead of half-working.
* **`ending.text`** is what to show on the ending card so the player can answer the character:
  `character` is who is texting, `number` is the line to text (null when the character has already
  texted them), and `prompt` is the line to show.
* `stop` stays populated while `current.status` is `"generating"`, so keep looping the parent frame
  under a progress ring on the chosen target rather than showing a black screen. `status` flips to
  `"ended"` only once the final clip is playable, and `ending` arrives with it.

## How the app drives it

1. `home.today()` for the poster, the streak and whether a run is already live.
2. `runs.startToday()` once, then subscribe to `runs.view({ runId })` — it is a reactive query, so
   clips turning ready, spoken audio, glued outlines and the ending all arrive without polling.
3. On a choice stop, `runs.choose({ runId, optionId })`. On a puzzle stop, `runs.answer({ runId,
   answer })`. Or speak: `runs.speak({ runId, audioStorageId })`, which advances the run exactly as
   `choose` or `answer` would when it understands.
4. Show `stop.spokenLine` as a caption always, and play `stop.spokenAudioUrl` when the player has
   character voice on.

## Environment variables

Runtime variables live on the Convex deployment (`npx convex env set NAME value`). Mock mode is what
happens when the relevant pair is unset — it is not a misconfiguration.

| Variable | Default | Purpose |
| --- | --- | --- |
| `FASTH3_URLS` | unset (mock) | Comma-separated tray base URLs. Parallel children are spread across them. |
| `FASTH3_URL` | unset | Single tray base URL, kept for convenience. |
| `FASTH3_API_KEY` | unset | Sent as `Authorization: Bearer <key>` to the tray. |
| `FASTH3_MODEL` | `fasth3` | Model id the tray serves. |
| `FASTH3_TASK` | `ref2va` | Task field; `none` omits it so the server infers. |
| `FASTH3_SIZE` | unset | Explicit canvas, for example `768x1360`. Overrides `aspect_ratio`. |
| `FASTH3_SHORT_EDGE` | `768` | Short edge for the 480p/768p canvas selection. |
| `FASTH3_NUM_FRAMES` | unset | Explicit `num_frames`; omitted so the server resolves `seconds * fps`. |
| `FASTH3_SUBMIT_TIMEOUT_MS` | `120000` | Timeout for the submit call. |
| `DETECT_URL` / `DETECT_API_KEY` | unset | Optional open-vocabulary detector. Unset means chips, never an error. |
| `DEEPSEEK_API_KEY` | unset (fixture) | Director LLM key. |
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
| `TRAY_POLL_MS` | `1200` | Interval between job polls. |
| `TRAY_MAX_POLLS` | `150` | Polls before a clip is marked failed (about three minutes). |
| `MOCK_LATENCY_MS` | `1200` | Artificial delay before a mock clip is returned. |
| `EPISODE_BEATS` | `7` | Beats in an episode, ending included. |
| `EPISODE_SECONDS` | `5` | Requested clip length. |
| `EPISODE_ASPECT` | `9:16` | Requested aspect ratio. |
| `STYLE_IMAGE_URL`, `CHARACTER_SHEET_URL`, `VOICE_REF_URL` | placeholders | The three fixed anchors, one set per deployment. |

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

The app has no auth screen and no token. The backend keeps one row in `sessions` naming the active
player, defaulting to a shared anonymous user. Named accounts sit on top without changing any contract
function: `session.signInAs({ name })`. This is deliberately the simplest thing that works on one phone
at a demo table; streaks and today's run follow the signed-in player.

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
```

`npm run smoke` is the fastest way to tell whether the director and the tray are healthy: it starts a
run, waits for each stop, picks the first option or answers each puzzle, and prints the ending, the
path and the text block. Add `-- --prod` to target the linked production deployment, or
`-- --answer 4187` to force an answer. When a beat never produces a stop it says so, which is what a
rejected director key or an unreachable tray looks like from the outside.

## Known gaps

* Nothing has been exercised against a real tray, a real Keiki agent or the OpenAI speech APIs; those
  calls are written to the published contracts and are the first things to confirm with real keys.
* FastVideo UniServe offers no last-frame extraction, so `last_frame_url` is null and the continuity
  anchor is the parent clip's mp4. Outlines need a frame-extracting sidecar and a detector.
* `runs.speak` cannot be covered end to end without network access from the test runtime; the
  deterministic matcher, the grading and the clean-failure path are covered instead.
