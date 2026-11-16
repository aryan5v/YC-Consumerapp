# Synqui voice game master

A single page. No build step. It runs in iOS Safari and in a WKWebView. The OpenAI key stays on the server. The page only ever sees a short-lived client secret, and it never writes that secret into the page.

While a clip is paused, the player taps the button and talks. The master answers at once, quizzes on the clues, and never names the answer.

## What the page expects

```
master/index.html?token=<mint-url>&run=<runId>&device=<deviceToken>
```

`token` is the mint URL below. Encode it with `encodeURIComponent` if it has its own query string. A mint URL with no query string can be pasted raw, as long as it comes before `run` and `device`.

Optional, sent with the mint request so the master knows the case on the first turn:

- `question` the case question
- `clues` a JSON array, or a `|`-separated list. Repeat `clue` for one clue at a time.
- `movesLeft` an integer

After the session is open, the host can push a clue the player just saw:

```javascript
window.postMessage({ type: "context", text: "The player just saw a torn ticket in the gutter." }, "*");
```

From native code, evaluate that script in the web view. The page forwards the text as a system note. It does not speak the note aloud by itself.

## 1. Register the route

`backend/convex/master.ts` is the HTTP action. It is not wired in `http.ts` yet, because another thread deploys the backend. Add these two routes next to the existing ones in `backend/convex/http.ts`:

```ts
import { mint } from "./master";

http.route({
  path: "/master/token",
  method: "POST",
  handler: mint,
});

http.route({
  path: "/master/token",
  method: "OPTIONS",
  handler: mint,
});
```

The import sits with the other imports. The routes sit on the same `http` router, before `export default http`.

## 2. Deploy

From `backend/`, with `OPENAI_API_KEY` already set on the Convex deployment (Dashboard, or `npx convex env set OPENAI_API_KEY` — do not commit the value):

```bash
cd backend
npx convex deploy
```

The mint URL is the deployment's site origin, not the cloud origin:

```
https://<deployment>.convex.site/master/token
```

The current deployment name is `reliable-opossum-456`, so the URL is:

```
https://reliable-opossum-456.convex.site/master/token
```

Confirm with `npx convex deployment` if that name has moved. A POST of `{}` returns `{ "value": "ek_…", "expires_at": <unix> }`. The value starts with `ek_` and expires in 10 minutes. It is only good for opening a session. The session itself keeps running after that.

The body may also carry the case:

```json
{
  "question": "Who left the ticket?",
  "clues": ["a torn ticket in the gutter", "the clock is twenty minutes fast"],
  "movesLeft": 2,
  "run": "run_123",
  "device": "device_token"
}
```

`answer` is ignored if a client sends it. The master is never given the solution.

## 3. Open it on a phone

Serve the page over HTTPS. Microphone and WebRTC both refuse a plain `http://` page that is not localhost, and a `file://` URL often blocks the mint fetch.

From a laptop on the same network, for a quick check:

```bash
npx --yes serve master
```

Then open the printed URL on the phone. For a judge on venue Wi-Fi, host the file on any HTTPS static host, or load it from the app.

Phone URL, with the mint URL pasted in `token`:

```
https://<your-host>/index.html?token=https://reliable-opossum-456.convex.site/master/token&run=demo&device=demo&question=Who%20left%20the%20ticket%3F&clues=torn%20ticket%7Cclock%20is%20fast&movesLeft=2
```

Tap the button. Allow the microphone. He listens, then answers when you speak. Tap again to mute, tap again to talk. The line under the title is what he just said. A failure (bad mint URL, refused mic, dropped call) replaces the button label with Try again and prints the reason in pink. The reason never includes the secret.

## WKWebView

The host app has to allow the microphone and inline playback, or the tap does nothing useful:

- `NSMicrophoneUsageDescription` in Info.plist.
- `allowsInlineMediaPlayback = true`
- `mediaTypesRequiringUserActionForPlayback = []`
- Grant the web view's media capture prompt when it asks.

Load the page with the query string above. When the player uncovers a clue, evaluate the `postMessage` call from the section above. Do not put `OPENAI_API_KEY` in the app, the page, or the query string.
