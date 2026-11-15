import { v } from "convex/values";
import { QueryCtx, internalAction, internalMutation, internalQuery } from "./_generated/server";
import { Doc } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import {
  CODE_ALPHABET,
  displayName,
  keikiConfigured,
  keikiNotice,
  keikiOutboundEnabled,
  keikiTurn,
  normalizePhone,
  outboundInstruction,
  phoneKey,
  sharedLine,
  keikiAgentId,
} from "./lib/keiki";

type Resolution = { user: Doc<"users"> | null; matchedBy: "phone" | "code" | "none" };

export function extractCode(text: string): string | null {
  const upper = text.toUpperCase();
  for (const token of upper.split(/[^A-Z0-9]+/)) {
    if (token.length !== 5) continue;
    let clean = true;
    for (const character of token) {
      if (!CODE_ALPHABET.includes(character)) clean = false;
    }
    if (clean) return token;
  }
  return null;
}

async function resolvePlayer(
  ctx: QueryCtx,
  args: { phone?: string; code?: string; text?: string },
): Promise<Resolution> {
  const phone = args.phone === undefined ? null : normalizePhone(args.phone);
  if (phone !== null) {
    const exact = await ctx.db
      .query("users")
      .withIndex("by_phone", (q) => q.eq("phone", phone))
      .first();
    if (exact !== null) return { user: exact, matchedBy: "phone" };
    const key = phoneKey(phone);
    if (key !== null) {
      const candidates = await ctx.db.query("users").take(200);
      const found = candidates.find((candidate) => phoneKey(candidate.phone ?? null) === key);
      if (found !== undefined) return { user: found, matchedBy: "phone" };
    }
  }
  const code = args.code ?? (args.text === undefined ? null : extractCode(args.text));
  if (code !== null) {
    const message = await ctx.db
      .query("storyMessages")
      .withIndex("by_code", (q) => q.eq("code", code.toUpperCase()))
      .order("desc")
      .first();
    if (message !== null) {
      const user = await ctx.db.get(message.userId);
      if (user !== null) return { user, matchedBy: "code" };
    }
  }
  return { user: null, matchedBy: "none" };
}

export const storyFor = internalQuery({
  args: {
    phone: v.optional(v.string()),
    code: v.optional(v.string()),
    text: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user, matchedBy } = await resolvePlayer(ctx, args);
    if (user === null) {
      return {
        matched_by: "none",
        player: null,
        character: null,
        episode: null,
        story: null,
        last_reply: null,
        messages: [],
        instruction:
          "You do not know this number yet. Ask them for the five-letter code printed on their ending card, then call get_story again with that code as \"code\". Do not invent a story for them.",
      };
    }
    const runs = await ctx.db
      .query("runs")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(5);
    const ended = runs.find((run) => run.status === "ended") ?? null;
    const latest = runs[0] ?? null;
    const source = ended ?? latest;
    const episode = source === null ? null : await ctx.db.get(source.episodeId);
    const recent = await ctx.db
      .query("storyMessages")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(12);
    const inbound = recent.find((message) => message.direction === "inbound") ?? null;
    const character = episode?.character ?? null;

    const path = ended?.path ?? [];
    const summary = ended?.ending?.summary ?? null;
    const instruction =
      character === null
        ? "You have no story for this player yet. Say nothing about a story and ask them to play today's episode first."
        : [
            `You are ${character.name}. ${character.voice}`,
            summary === null ? "" : `They finished tonight's episode: ${summary}`,
            path.length === 0 ? "" : `Their path: ${path.join(" then ")}.`,
            inbound === null
              ? "They have not replied yet."
              : `They already replied: "${inbound.text}"`,
            `Reply as ${displayName(character.name)} in one or two sentences, under 240 characters, in character.`,
            "Ask them exactly one question about tomorrow's episode or give them one clue about tonight.",
            "Never mention being an AI, a game, a bot or a tool. No emoji, no hashtags.",
          ]
            .filter((line) => line !== "")
            .join(" ");

    return {
      matched_by: matchedBy,
      player: { id: user._id, name: user.name ?? null, phone: user.phone ?? null },
      character,
      episode:
        episode === null
          ? null
          : { date: episode.date, title: episode.title, tagline: episode.tagline, premise: episode.premise },
      story:
        ended === null
          ? null
          : { path: ended.path, summary, ended_at: ended.endedAt ?? null, beats: ended.beatsSeen },
      last_reply: inbound?.text ?? null,
      messages: recent
        .slice()
        .reverse()
        .map((message) => ({ direction: message.direction, text: message.text, at: message.createdAt })),
      instruction,
    };
  },
});

export const recordReply = internalMutation({
  args: {
    phone: v.optional(v.string()),
    code: v.optional(v.string()),
    text: v.string(),
    conversationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const text = args.text.trim().slice(0, 2000);
    if (text === "") return { ok: false, matched_by: "none", player: null, saved: null };
    const resolved = await resolvePlayer(ctx, args);
    let user = resolved.user;
    let matchedBy = resolved.matchedBy;
    const phone = args.phone === undefined ? null : normalizePhone(args.phone);
    if (user === null && phone !== null) {
      const created = await ctx.db.insert("users", { kind: "anonymous", phone, createdAt: Date.now() });
      user = await ctx.db.get(created);
      matchedBy = "phone";
    }
    if (user === null) {
      return {
        ok: false,
        matched_by: "none",
        player: null,
        saved: null,
        instruction:
          "You still do not know who this is. Ask for the five-letter code from their ending card and call record_reply again with that code.",
      };
    }
    if (phone !== null && user.phone === undefined) {
      await ctx.db.patch(user._id, { phone });
    }
    const run = await ctx.db
      .query("runs")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .first();
    const episode = run === null ? null : await ctx.db.get(run.episodeId);
    const createdAt = Date.now();
    await ctx.db.insert("storyMessages", {
      userId: user._id,
      episodeId: episode?._id,
      runId: run?._id,
      character: episode?.character.name ?? "",
      direction: "inbound",
      text,
      phone: phone ?? user.phone ?? undefined,
      conversationId: args.conversationId,
      createdAt,
    });
    return {
      ok: true,
      matched_by: matchedBy,
      player: { id: user._id, name: user.name ?? null, phone: user.phone ?? phone },
      saved: { text, at: createdAt },
      instruction:
        "Saved. It will show up in tomorrow's episode. Reply as the character in one or two sentences and ask them one question about tomorrow.",
    };
  },
});

export const outbound = internalQuery({
  args: { runId: v.id("runs") },
  handler: async (ctx, { runId }) => {
    const run = await ctx.db.get(runId);
    if (run === null) return null;
    const messages = await ctx.db
      .query("storyMessages")
      .withIndex("by_run", (q) => q.eq("runId", runId))
      .order("desc")
      .take(4);
    const pending = messages.find((message) => message.direction === "outbound") ?? null;
    if (pending === null) return null;
    const user = await ctx.db.get(run.userId);
    if (user === null) return null;
    const episode = await ctx.db.get(run.episodeId);
    return {
      messageId: pending._id,
      text: pending.text,
      code: pending.code ?? null,
      phone: user.phone ?? null,
      playerName: user.name ?? null,
      characterName: episode?.character.name ?? "",
      line: sharedLine(),
      conversationId: run.userId,
    };
  },
});

export const markDelivery = internalMutation({
  args: {
    messageId: v.id("storyMessages"),
    runId: v.id("runs"),
    delivery: v.union(v.literal("sent"), v.literal("queued"), v.literal("failed"), v.literal("fallback")),
    error: v.optional(v.string()),
    text: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { messageId, runId, delivery, error, text }) => {
    const patch: { delivery: typeof delivery; error?: string; text?: string } = { delivery };
    if (error !== undefined) patch.error = error;
    if (text !== undefined) patch.text = text;
    await ctx.db.patch(messageId, patch);
    const run = await ctx.db.get(runId);
    if (run === null || run.ending === undefined) return null;
    if (delivery !== "sent") return null;
    const who = displayName(run.ending.text?.character ?? "the character");
    await ctx.db.patch(runId, {
      ending: {
        ...run.ending,
        text: {
          character: run.ending.text?.character ?? who,
          number: null,
          prompt: `${who} has texted you already. Answer there, and it will change tomorrow.`,
        },
      },
    });
    return null;
  },
});

export const sendOpener = internalAction({
  args: { runId: v.id("runs") },
  returns: v.null(),
  handler: async (ctx, { runId }) => {
    const data = await ctx.runQuery(internal.keiki.outbound, { runId });
    if (data === null) return null;
    if (!keikiConfigured() || !keikiOutboundEnabled()) return null;
    if (data.phone === null) {
      await ctx.runMutation(internal.keiki.markDelivery, {
        messageId: data.messageId,
        runId,
        delivery: "fallback",
        error: "the player has no phone number on file yet",
      });
      return null;
    }
    const notice = await keikiNotice({ text: data.text, phone: data.phone, line: data.line });
    if (notice.ok) {
      await ctx.runMutation(internal.keiki.markDelivery, { messageId: data.messageId, runId, delivery: "sent" });
      return null;
    }
    const agentId = keikiAgentId();
    if (agentId !== null) {
      const turn = await keikiTurn({
        conversationId: data.conversationId,
        instruction: outboundInstruction({
          characterName: data.characterName,
          opener: data.text,
          playerName: data.playerName,
        }),
      });
      if (turn.ok) {
        await ctx.runMutation(internal.keiki.markDelivery, {
          messageId: data.messageId,
          runId,
          delivery: "sent",
          text: turn.text ?? undefined,
        });
        return null;
      }
      await ctx.runMutation(internal.keiki.markDelivery, {
        messageId: data.messageId,
        runId,
        delivery: "fallback",
        error: `${notice.error ?? "notice failed"}; ${turn.error ?? "turn failed"}`,
      });
      return null;
    }
    await ctx.runMutation(internal.keiki.markDelivery, {
      messageId: data.messageId,
      runId,
      delivery: "fallback",
      error: notice.error ?? "the notice call failed",
    });
    return null;
  },
});
