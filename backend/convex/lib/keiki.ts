import { envFlag, envNumber } from "./env";

export const MOCK_SHARED_LINE = "+15551234567";
export const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const QUESTIONS = [
  "which door did you come out of, the red one or the back one?",
  "did you open the parcel, or are you still carrying it?",
  "who else saw you on that street tonight?",
  "what did you leave behind in there?",
];

function hash(text: string): number {
  let value = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    value ^= text.charCodeAt(i);
    value = Math.imul(value, 16777619);
  }
  return Math.abs(value);
}

export function displayName(name: string): string {
  if (name === "") return name;
  return name[0].toUpperCase() + name.slice(1);
}

export function makeCode(seed: string, attempt = 0): string {
  let value = hash(attempt === 0 ? seed : `${seed}:${attempt}`);
  let out = "";
  for (let i = 0; i < 5; i += 1) {
    out += CODE_ALPHABET[value % CODE_ALPHABET.length];
    value = Math.floor(value / CODE_ALPHABET.length) + hash(`${seed}:${i}`);
  }
  return out;
}

export function normalizePhone(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const digits = trimmed.replace(/[^0-9]/g, "");
  if (digits.length < 7) return null;
  if (trimmed.startsWith("+")) return `+${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return digits;
}

export function phoneKey(raw: string | null): string | null {
  if (raw === null) return null;
  const digits = raw.replace(/[^0-9]/g, "");
  if (digits.length < 7) return null;
  return digits.slice(-10);
}

export function characterQuestion(seed: string): string {
  return QUESTIONS[hash(seed) % QUESTIONS.length];
}

export function openerText(args: {
  characterName: string;
  lastAction: string | null;
  question: string;
}): string {
  const who = displayName(args.characterName);
  const action = args.lastAction === null ? "" : ` You ${args.lastAction.toLowerCase()}, and I have been thinking about it all night.`;
  return `${who} here.${action} Tomorrow the street is not the same. Tell me one thing before then: ${args.question}`;
}

export function endingPrompt(args: { characterName: string; code: string; line: string | null }): string {
  const who = displayName(args.characterName);
  if (args.line === null) return `${who} will text you when the street goes quiet.`;
  return `Text ${args.code} to ${args.line} and ${who} will answer.`;
}

function usableLine(raw: string | null): string | null {
  if (raw === null) return null;
  const trimmed = raw.trim();
  if (trimmed === "" || trimmed.startsWith("@")) return trimmed === "" ? null : trimmed;
  return normalizePhone(trimmed);
}

export function sharedLine(): string | null {
  const configured = usableLine(envFlag("KEIKI_LINE"));
  if (configured !== null) return configured;
  return keikiConfigured() ? null : MOCK_SHARED_LINE;
}

export function keikiConfigured(): boolean {
  return envFlag("KEIKI_API_KEY") !== null;
}

export function keikiOutboundEnabled(): boolean {
  const flag = envFlag("KEIKI_OUTBOUND");
  if (flag !== null) return flag !== "0" && flag.toLowerCase() !== "false" && flag.toLowerCase() !== "off";
  return keikiConfigured();
}

export function keikiAgentId(): string | null {
  return envFlag("KEIKI_AGENT_ID");
}

export function keikiBaseUrl(): string {
  return (envFlag("KEIKI_BASE_URL") ?? "https://onkeiki.com/api/v1").replace(/\/+$/, "");
}

export function toolSecret(): string | null {
  return envFlag("KEIKI_TOOL_SECRET");
}

export function secretMatches(given: string | null, expected: string | null): boolean {
  if (expected === null || given === null) return false;
  if (given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) {
    diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

export type KeikiResult = { ok: boolean; text: string | null; error?: string };

export async function keikiNotice(args: {
  text: string;
  phone: string | null;
  line: string | null;
}): Promise<KeikiResult> {
  const key = envFlag("KEIKI_API_KEY");
  const agentId = keikiAgentId();
  if (key === null) return { ok: false, text: null, error: "KEIKI_API_KEY is not set" };
  if (agentId === null) return { ok: false, text: null, error: "KEIKI_AGENT_ID is not set" };
  const body: Record<string, unknown> = { text: args.text };
  if (args.phone !== null) body.phone = args.phone;
  if (args.line !== null) body.line = args.line;
  try {
    const res = await fetch(`${keikiBaseUrl()}/developer/agents/${encodeURIComponent(agentId)}/notice`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(envNumber("DIRECTOR_TIMEOUT_MS", 60000)),
    });
    const raw = await res.text();
    if (!res.ok) return { ok: false, text: null, error: `notice ${res.status}: ${raw.slice(0, 300)}` };
    const parsed = JSON.parse(raw) as { ok?: boolean; results?: { outcome?: string }[] };
    const outcomes = (parsed.results ?? []).map((entry) => entry.outcome);
    const unusable = outcomes.length > 0 && outcomes.every((outcome) => outcome === "unavailable");
    if (unusable) return { ok: false, text: null, error: `notice unavailable: ${raw.slice(0, 300)}` };
    return { ok: true, text: args.text };
  } catch (error) {
    return { ok: false, text: null, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function keikiTurn(args: { conversationId: string; instruction: string }): Promise<KeikiResult> {
  const key = envFlag("KEIKI_API_KEY");
  if (key === null) return { ok: false, text: null, error: "KEIKI_API_KEY is not set" };
  const model = envFlag("KEIKI_AGENT_NAME");
  if (model === null) return { ok: false, text: null, error: "KEIKI_AGENT_NAME is not set" };
  try {
    const res = await fetch(`${keikiBaseUrl()}/openai/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${key}`,
        "x-conversation-id": args.conversationId,
      },
      body: JSON.stringify({ model, messages: [{ role: "user", content: args.instruction }] }),
      signal: AbortSignal.timeout(envNumber("DIRECTOR_TIMEOUT_MS", 60000)),
    });
    const raw = await res.text();
    if (!res.ok) return { ok: false, text: null, error: `turn ${res.status}: ${raw.slice(0, 300)}` };
    const parsed = JSON.parse(raw) as { choices?: { message?: { content?: unknown } }[] };
    const content = parsed.choices?.[0]?.message?.content;
    if (typeof content !== "string" || content.trim() === "") return { ok: false, text: null, error: "empty turn" };
    return { ok: true, text: content.trim() };
  } catch (error) {
    return { ok: false, text: null, error: error instanceof Error ? error.message : String(error) };
  }
}

export function outboundInstruction(args: {
  characterName: string;
  opener: string;
  playerName: string | null;
}): string {
  return [
    `Send one text message to the player as ${displayName(args.characterName)}, the character you play.`,
    args.playerName === null ? "" : `They are called ${args.playerName}.`,
    `Keep it under 240 characters, in the character's voice, no emoji, no hashtags, no sign-off.`,
    `Say it in your own words, close to this: "${args.opener}"`,
  ]
    .filter((line) => line !== "")
    .join(" ");
}
