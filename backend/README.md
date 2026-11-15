# Fork backend (Convex)

Story state, the DeepSeek director and the FastH3 Omni prefetch loop for Fork, a daily interactive
video story. This directory is the whole backend: it is a Convex project of its own and it does not
touch `mobile/`.

```
convex/
  schema.ts          users, sessions, episodes, runs, beats, clips, streaks
  home.ts            home.today()
  runs.ts            runs.startToday() / view() / choose() / answer()
  session.ts         anonymous identity, named accounts
  episodes.ts        today's episode, seeds the days ahead
  director.ts        the DeepSeek action (validated, one retry, fixture fallback)
  tray.ts            tray actions: generate, poll, detect, cancel
  clips.ts beats.ts  internal writes for the orchestration
  crons.ts           keeps the next days of episodes created
  lib/               tray + DeepSeek clients, director schema and prompt, the fixture episode
docs/tray-api.md     the HTTP contract for the FastH3 wrapper you host
tests/episode.test.ts  plays a full episode end to end in mock mode
```

## The shared contract with the app

Exactly these four functions, all in `convex/`:

```ts
query    home.today()                        -> { episode: { id, date, title, tagline, posterUrl }, streak: number, run: { id, status: "active" | "ended" } | null }
mutation runs.startToday()                   -> runId
query    runs.view({ runId })                -> RunView
mutation runs.choose({ runId, optionId })    -> null
mutation runs.answer({ runId, answer })      -> { correct: boolean }
```

```ts
RunView = {
  status: "active" | "ended"
  beatIndex: number
  beatsTotal: number
  current: { beatId, clipUrl: string | null, narration: string, status: "generating" | "ready" }
  stop: null
    | { kind: "choice"
        options: [{ id, label, box: { x, y, w, h } | null,
                    childStatus: "generating" | "ready", childClipUrl: string | null }] }
    | { kind: "puzzle"
        question, answerType: "pick" | "number" | "text", choices: string[] | null,
        outcomes: { success: { status, clipUrl }, failure: { status, clipUrl } } }
  ending: null | { title, summary, path: string[] }
}
```

Boxes are fractions of the frame, 0 to 1, origin top left. A `null` box means draw a labelled chip.

How the app drives it:

1. `home.today()` for the poster, the streak and whether a run is already live.
2. `runs.startToday()` once, then subscribe to `runs.view({ runId })`. It is a reactive query: clips
   turning ready, glued outlines and the ending all arrive without polling.
3. On a choice stop, `runs.choose({ runId, optionId })`. On a puzzle stop, `runs.answer({ runId,
   answer })`. After either call `runs.view` points `current` at the shot you preloaded from
   `childClipUrl`, so play it immediately. `stop` stays populated while `current.status` is
   `"generating"`, so keep looping the parent frame under a progress ring on the chosen target rather
   than showing a black screen.
4. `status` flips to `"ended"` only once the final clip is playable, and `ending` arrives with it.
   Prior to that, `status` is `"active"` and `stop` may be `null` for a beat or two while the
   director is still writing it - hold the previous frame.
5. `episodes.ensureToday` is a public mutation if you ever want to force today's episode to exist.

## Environment variables

Runtime variables live on the Convex deployment (`npx convex env set NAME value`). `FASTH3_URL` and
`DEEPSEEK_API_KEY` being unset is the mock mode described below, not a misconfiguration.

| Variable | Default | Purpose |
| --- | --- | --- |
| `FASTH3_URL` | unset (mock) | Base URL of your FastH3 Omni HTTP wrapper. See `docs/tray-api.md`. |
| `FASTH3_API_KEY` | unset | Bearer token for the tray. |
| `DEEPSEEK_API_KEY` | unset (fixture) | Director LLM key. |
| `DEEPSEEK_BASE_URL` | `https://api.deepseek.com` | Override for the OpenAI-compatible endpoint. |
| `DEEPSEEK_MODEL` | `deepseek-chat` | Director model. |
| `DIRECTOR_TIMEOUT_MS` | `60000` | DeepSeek request timeout. |
| `TRAY_POLL_MS` | `1200` | Interval between `GET /jobs/:id` polls. |
| `TRAY_MAX_POLLS` | `150` | Polls before a clip is marked failed (about three minutes). |
| `MOCK_LATENCY_MS` | `1200` | Artificial delay before a mock clip is handed back. |
| `EPISODE_BEATS` | `7` | Beats in an episode, ending included. The plan allows 6 to 8. |
| `EPISODE_SECONDS` | `5` | Requested clip length. |
| `EPISODE_ASPECT` | `9:16` | Requested aspect ratio. |
| `STYLE_IMAGE_URL` | placeholder | Style reference image, one per deployment. |
| `CHARACTER_SHEET_URL` | placeholder | Character sheet, one per deployment. |
| `VOICE_REF_URL` | placeholder | Voice reference, one per deployment. |

`CONVEX_DEPLOY_KEY` is only needed to deploy (`npx convex deploy`); it is never a runtime variable and
must never be committed.

## Deploying

```bash
npx convex deploy                          # needs CONVEX_DEPLOY_KEY in the environment
npx convex run episodes:seed '{"days":8}'  # creates today's episode and the next eight days
```

The seed step matters: a query cannot create rows, so `home.today()` needs today's episode to already
exist. The hourly cron `episodes.ensureAhead` keeps nine days of episodes alive after that, and
`runs.startToday()` creates today's episode if it is somehow missing.

## Identity

The app has no auth screen and no token. The backend keeps one row in `sessions` naming the active
player, defaulting to a shared anonymous user. Named accounts sit on top without changing any of the
four contract functions:

```ts
query    session.whoami()                  -> { userId, name: string | null, anonymous: boolean } | null
mutation session.signInAnonymously()       -> userId
mutation session.signInAs({ name })        -> userId
mutation session.signOut()                 -> userId
```

This is deliberately the simplest thing that works on one phone at a demo table: streaks and today's
run follow the signed-in player, and two phones share one backend. Wiring per-device accounts means
adding a real auth provider later.

## Mock mode

With `FASTH3_URL` unset the tray client returns stock public mp4 clips after `MOCK_LATENCY_MS` and
`null` boxes; with `DEEPSEEK_API_KEY` unset the director serves a hand-written seven-beat episode
from `convex/lib/fixture.ts` (a wet street: go into the store, walk down the street, talk to the man).
Both together make the whole loop playable with no keys and no tray, which is what the test plays.

## Checks

```bash
npm run typecheck   # tsc --noEmit
npm test            # vitest: the end-to-end mock playthrough plus unit tests
npm run e2e         # just the playthrough, printing the beat-by-beat transcript
```

The playthrough test starts a run, drains the prefetch scheduler, then picks an option or answers each
puzzle until the run ends, asserting the shape of every stop on the way: three options with boxes,
preloaded child clips, a one-level-deep prefetch tree, cancelled siblings, the ending card and the
streak.

## Known gaps

* The live tray path is untested against a real server. Everything past `docs/tray-api.md` is written
  against the mock.
* Recaps, share cards and past episodes are on the app side; the backend only exposes `ending.path`.
* Free-text puzzle answers are graded deterministically (normalised match, then token overlap). An LLM
  grader for short free text is not wired in, because `runs.answer` is a mutation and cannot call out.
