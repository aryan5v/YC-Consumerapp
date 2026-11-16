import { httpAction, internalQuery } from "./_generated/server";
import { envFlag, envNumber } from "./lib/env";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { runOwnedBy } from "./lib/session";
import { readCase as readCaseData } from "./lib/case";

/** Realtime model the page connects to. Pinned; do not follow a newer default. */
export const REALTIME_MODEL = "gpt-realtime-2.1-mini";

const REALTIME_VOICE = "marin";
const SECRET_TTL_SECONDS = 600;
const MAX_QUESTION = 500;
const MAX_CLUES = 12;
const MAX_CLUE = 240;

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type, authorization",
  "access-control-max-age": "86400",
};

export type CaseFields = {
  question: string;
  clues: string[];
  movesLeft: number | null;
  run: string | null;
  device: string | null;
};

function clip(value: string, max: number): string {
  const cleaned = value.replace(/[\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim();
  return cleaned.length > max ? cleaned.slice(0, max) : cleaned;
}

function asString(value: unknown, max: number): string | null {
  if (typeof value === "string") {
    const clipped = clip(value, max);
    return clipped === "" ? null : clipped;
  }
  if (typeof value === "number" && Number.isFinite(value)) return clip(String(value), max);
  return null;
}

/**
 * Reads the case the master is running. An answer field, if a client sends one,
 * is ignored on purpose: the master must never be handed the solution.
 */
export function readCase(body: unknown): CaseFields {
  const row = body !== null && typeof body === "object" && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : {};
  const clues: string[] = [];
  if (Array.isArray(row.clues)) {
    for (const item of row.clues) {
      const text = asString(item, MAX_CLUE);
      if (text !== null) clues.push(text);
      if (clues.length >= MAX_CLUES) break;
    }
  }
  const movesRaw = row.movesLeft;
  const movesLeft = typeof movesRaw === "number" && Number.isFinite(movesRaw)
    ? Math.max(0, Math.floor(movesRaw))
    : typeof movesRaw === "string" && movesRaw.trim() !== "" && Number.isFinite(Number(movesRaw))
      ? Math.max(0, Math.floor(Number(movesRaw)))
      : null;
  return {
    question: asString(row.question, MAX_QUESTION) ?? "",
    clues,
    movesLeft,
    run: asString(row.run, 120),
    device: asString(row.device, 200),
  };
}

/** Session instructions. Nudges only. The answer is never named because it is never included. */
export function masterInstructions(fields: CaseFields): string {
  const question = fields.question === ""
    ? "The case question has not been given yet. Ask what they are trying to figure out. Do not invent a solution."
    : fields.question;
  const clues = fields.clues.length === 0
    ? "The player has found no clues yet. Ask what they noticed in the scene."
    : fields.clues.map((clue, index) => `${index + 1}. ${clue}`).join("\n");
  const moves = fields.movesLeft === null ? "unknown" : String(fields.movesLeft);
  return [
    "You are the game master of a case. Calm, dry, and brief. You run the puzzle. You are not a character in the scene, and you do not play along as one.",
    "Quiz the player on what the clues mean. Give nudges, never the solution. Never name the answer, never confirm a guess that is the solution, and never say the words that would solve the case. If they are close, say they are close and point at which clue to look at again.",
    "Keep every turn under two sentences. Spoken English. No lists, no stage directions.",
    "When the player seems ready, or when they ask how to finish, tell them to press Solve.",
    `Moves left: ${moves}.`,
    `Case question: ${question}`,
    "Clues the player has found:",
    clues,
  ].join("\n");
}

export function safetyIdentifier(device: string | null, run: string | null): string {
  const source = `${device ?? "anonymous"}:${run ?? "norun"}`;
  let hash = 2166136261;
  for (let i = 0; i < source.length; i += 1) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `synqui_${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function respond(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...CORS,
    },
  });
}

function secretValue(payload: unknown): { value: string; expires_at: number | null } | null {
  if (payload === null || typeof payload !== "object") return null;
  const row = payload as Record<string, unknown>;
  const direct = typeof row.value === "string" ? row.value : null;
  const nested = row.client_secret;
  const nestedValue = nested !== null && typeof nested === "object"
    ? (nested as Record<string, unknown>).value
    : null;
  const value = direct ?? (typeof nestedValue === "string" ? nestedValue : null);
  if (value === null || value.trim() === "") return null;
  const expires = typeof row.expires_at === "number" && Number.isFinite(row.expires_at)
    ? row.expires_at
    : null;
  return { value, expires_at: expires };
}

async function readJson(request: Request): Promise<unknown> {
  const text = await request.text();
  if (text.trim() === "") return {};
  return JSON.parse(text) as unknown;
}

/**
 * HTTP action. Not routed in this file. The backend deploy adds both lines to http.ts:
 *   http.route({ path: "/master/token", method: "POST", handler: mint });
 *   http.route({ path: "/master/token", method: "OPTIONS", handler: mint });
 */
export const context = internalQuery({
  args: { runId: v.id("runs"), deviceToken: v.string() },
  handler: async (ctx, { runId, deviceToken }) => {
    const { run } = await runOwnedBy(ctx, runId, deviceToken);
    const bundle = run.caseId === undefined ? null : await ctx.db.get(run.caseId);
    const data = readCaseData(bundle?.data);
    if (data === null) throw new Error("this run is not a case");
    return {
      question: data.question,
      clues: (run.caseClues ?? []).map((id) => data.clues.find((clue) => clue.id === id)?.fact ?? "").filter(Boolean),
      movesLeft: Math.max(0, data.moves - (run.caseClues ?? []).length),
    };
  },
});

export const mint = httpAction(async (ctx, request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }
  if (request.method !== "POST") {
    return respond({ error: "POST only" }, 405);
  }

  const key = envFlag("OPENAI_API_KEY");
  if (key === null) {
    return respond({ error: "OPENAI_API_KEY is not set on this deployment" }, 503);
  }

  let fields: CaseFields;
  try {
    fields = readCase(await readJson(request));
  } catch {
    return respond({ error: "expected a JSON object body" }, 400);
  }
  if (fields.run === null || fields.device === null) return respond({ error: "run and device are required" }, 400);
  try {
    const trusted = await ctx.runQuery(internal.master.context, {
      runId: fields.run as Id<"runs">, deviceToken: fields.device,
    });
    fields = { ...fields, ...trusted };
  } catch {
    return respond({ error: "this case does not belong to this device" }, 403);
  }

  const session = {
    type: "realtime",
    model: REALTIME_MODEL,
    instructions: masterInstructions(fields),
    output_modalities: ["audio"],
    max_output_tokens: 200,
    audio: {
      input: {
        turn_detection: {
          type: "server_vad",
          threshold: 0.5,
          prefix_padding_ms: 300,
          silence_duration_ms: 450,
          create_response: true,
          interrupt_response: true,
        },
      },
      output: { voice: REALTIME_VOICE },
    },
  };

  let upstream: Response;
  try {
    upstream = await fetch(`${(envFlag("OPENAI_BASE_URL") ?? "https://api.openai.com/v1").replace(/\/+$/, "")}/realtime/client_secrets`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
        "OpenAI-Safety-Identifier": safetyIdentifier(fields.device, fields.run),
      },
      body: JSON.stringify({
        expires_after: { anchor: "created_at", seconds: SECRET_TTL_SECONDS },
        session,
      }),
      signal: AbortSignal.timeout(envNumber("OPENAI_TIMEOUT_MS", 20000)),
    });
  } catch {
    return respond({ error: "could not reach OpenAI" }, 502);
  }

  const raw = await upstream.text();
  if (!upstream.ok) {
    return respond({ error: `openai ${upstream.status}` }, 502);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return respond({ error: "openai returned an unreadable secret" }, 502);
  }
  const secret = secretValue(parsed);
  if (secret === null) {
    return respond({ error: "openai returned no client secret" }, 502);
  }
  return respond({ value: secret.value, expires_at: secret.expires_at });
});
