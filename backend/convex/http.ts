import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { keikiConfigured, secretMatches, toolSecret } from "./lib/keiki";
import { mint } from "./master";
import { MASTER_PAGE } from "./lib/masterPage";
import { media as dreamMedia } from "./dream";

const http = httpRouter();

const JSON_HEADERS = { "content-type": "application/json" };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function authorized(request: Request): boolean {
  const expected = toolSecret();
  if (expected === null) return false;
  const header = request.headers.get("x-keiki-secret");
  if (header !== null && secretMatches(header, expected)) return true;
  const auth = request.headers.get("authorization");
  if (auth === null) return false;
  const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : auth.trim();
  return secretMatches(bearer, expected);
}

async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const parsed = await request.json();
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function optionalString(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim() !== "") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

http.route({
  path: "/keiki/health",
  method: "GET",
  handler: httpAction(async () => {
    return json({
      ok: true,
      keiki: keikiConfigured() ? "live" : "mock",
      tools: toolSecret() === null ? "locked" : "ready",
    });
  }),
});

http.route({
  path: "/keiki/story",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (toolSecret() === null) {
      return json({ error: "KEIKI_TOOL_SECRET is not set on this deployment" }, 503);
    }
    if (!authorized(request)) return json({ error: "unauthorized" }, 401);
    const body = await readBody(request);
    if (body === null) return json({ error: "expected a JSON object body" }, 400);
    const payload = await ctx.runQuery(internal.keiki.storyFor, {
      phone: optionalString(body.phone),
      code: optionalString(body.code),
      text: optionalString(body.text ?? body.message),
    });
    return json(payload);
  }),
});

http.route({
  path: "/keiki/reply",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (toolSecret() === null) {
      return json({ error: "KEIKI_TOOL_SECRET is not set on this deployment" }, 503);
    }
    if (!authorized(request)) return json({ error: "unauthorized" }, 401);
    const body = await readBody(request);
    if (body === null) return json({ error: "expected a JSON object body" }, 400);
    const text = optionalString(body.text ?? body.message ?? body.reply);
    if (text === undefined) return json({ error: "text is required" }, 400);
    const payload = await ctx.runMutation(internal.keiki.recordReply, {
      phone: optionalString(body.phone),
      code: optionalString(body.code),
      text,
      conversationId: optionalString(body.conversationId ?? body.conversation_id),
    });
    return json(payload);
  }),
});

http.route({ path: "/master/token", method: "POST", handler: mint });
http.route({ path: "/master/token", method: "OPTIONS", handler: mint });
http.route({
  path: "/master",
  method: "GET",
  handler: httpAction(async () => new Response(MASTER_PAGE, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  })),
});

http.route({ pathPrefix: "/dream/media/", method: "GET", handler: dreamMedia });

export default http;
