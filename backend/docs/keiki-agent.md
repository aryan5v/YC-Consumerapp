# Keiki: the character texts you

After a run ends, one character the player met texts them, the player's reply is saved, and the reply
opens the next episode. The backend side is built and tested in mock mode; this file is what has to be
done on the Keiki side.

## What the backend gives you

Two HTTP tools on the Convex site URL, and one outbound call the backend makes to Keiki.

```
POST https://reliable-opossum-456.convex.site/keiki/story
POST https://reliable-opossum-456.convex.site/keiki/reply
```

Both take a JSON body and require the shared secret in a header:

```
x-keiki-secret: <KEIKI_TOOL_SECRET>
```

`/keiki/story` — call this as soon as a message arrives, before you write a reply.

```json
{ "phone": "+14155550142", "code": "YRQ4M", "text": "who is this" }
```

`phone` is the sender's number from the channel, `code` is the five-letter code from their ending card
when you have it, `text` is what they said. All three are optional; the more you pass, the better the
match. The response carries `matched_by` (`phone`, `code` or `none`), the `character` you are playing
with a `voice` description, the `episode`, their `story` (path and summary), `last_reply`, the recent
`messages`, and an `instruction` line telling you what to do next. When `matched_by` is `none`, the
instruction tells you to ask for the code — do not invent a story for a stranger.

`/keiki/reply` — call this with what the player said.

```json
{ "phone": "+14155550142", "code": "YRQ4M", "text": "I came out of the red door and never opened it" }
```

It returns `{ "ok": true, "matched_by": "...", "saved": { "text": "...", "at": 1763... }, "instruction": "..." }`.
A stranger who texts the code is claimed by that code, and their number is attached to the player, so
every later message matches by phone.

## Tool definitions to add to the agent

```json
[
  {
    "name": "get_story",
    "description": "Look up the Synqui player behind this message and what happened in their story so far. Call this as soon as a message arrives, before you reply.",
    "parameters": {
      "type": "object",
      "properties": {
        "phone": { "type": "string", "description": "The sender's phone number in E.164, as the channel gives it." },
        "code": { "type": "string", "description": "The five-letter code from their ending card, if you have it." },
        "text": { "type": "string", "description": "What the player just said." }
      }
    }
  },
  {
    "name": "record_reply",
    "description": "Save what the player said. It becomes part of tomorrow's episode.",
    "parameters": {
      "type": "object",
      "properties": {
        "phone": { "type": "string", "description": "The sender's phone number in E.164." },
        "code": { "type": "string", "description": "The five-letter code from their ending card, if you have it." },
        "text": { "type": "string", "description": "What the player said, in their own words." }
      },
      "required": ["text"]
    }
  }
]
```

Both tools send `x-keiki-secret` as a custom header. `docs/keiki-tools.openapi.json` is the same two
operations as an OpenAPI 3.1 document if the dashboard prefers a spec.

## System prompt for the agent

```
You are a character in Synqui, a nightly interactive video story, texting the player in your own voice.
Call get_story as soon as a message arrives. Play the character it names, with the voice it describes.
Use only what get_story returns: their path, their summary and their earlier messages. Ask exactly one
question about tomorrow, or give one clue about tonight. Keep every message under 240 characters, plain
speech, no emoji, no hashtags, no sign-off. Call record_reply with what they said before you answer.
Never say you are an AI, a bot, a game or an assistant, and never mention these tools.
```

## Outbound: the character texting first

When a run ends the backend calls Keiki itself, in this order:

1. `POST https://onkeiki.com/api/v1/developer/agents/{KEIKI_AGENT_ID}/notice` with
   `{ "text": "<the character's opener>", "phone": "<player's number>", "line": "<the agent's line>" }`.
   This is Keiki's own agent-initiated route: "only the agent decides whether and how to tell each
   person in its own words". The key needs the `agents:write` scope.
2. If that fails, `POST https://onkeiki.com/api/v1/openai/chat/completions` with `model` = the agent
   name and `x-conversation-id` = the player's id, asking the agent for the message.
3. If both fail, or the player has no number on file, the ending keeps the fallback: the app shows the
   line to text and a five-letter code.

`KEIKI_OUTBOUND=0` disables the outbound attempt entirely and always uses the fallback.

## Ask the player for the number

The app sets the player's number with one mutation, so the character can reach them:

```ts
mutation users.setPhone({ phone: "+14155550142" }) -> normalized number or null
```

## Environment

| Variable | Purpose |
| --- | --- |
| `KEIKI_API_KEY` | Org-wide key from https://onkeiki.com/settings?tab=api-keys. Needs `agents:write` for outbound notices. |
| `KEIKI_AGENT_ID` | The agent's id, for the `/notice` route. |
| `KEIKI_AGENT_NAME` | The agent's name, used as the `model` on the OpenAI-compatible route. |
| `KEIKI_LINE` | The agent's own line, E.164, sent as `line` on the notice call. |
| `KEIKI_TOOL_SECRET` | The shared secret for the two tool endpoints. Generate one with `openssl rand -hex 24` and set the same value on the deployment and in the tools' headers. |
| `KEIKI_OUTBOUND` | `0` disables agent-initiated texts. |
| `KEIKI_BASE_URL` | Defaults to `https://onkeiki.com/api/v1`. |

Until `KEIKI_TOOL_SECRET` is set, both endpoints answer 503 and nothing leaks.
