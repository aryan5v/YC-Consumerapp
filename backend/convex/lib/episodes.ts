import { MutationCtx } from "../_generated/server";
import { Doc } from "../_generated/dataModel";
import {
  characterSheetUrl,
  episodeAspect,
  episodeBeats,
  episodeSeconds,
  styleImageUrl,
  voiceRefUrl,
} from "./config";
import { STYLE_BIBLE } from "./style";
import { voiceFor } from "./openai";
import { dayIndex } from "./pacific";

export type CatalogEntry = {
  title: string;
  tagline: string;
  premise: string;
  poster: string;
  character: { name: string; voice: string };
  tone: string;
};

export const TONE = "light mystery";

export const CATALOG: CatalogEntry[] = [
  {
    title: "The Humming Parcel",
    tagline: "One street, one parcel, three ways out.",
    premise:
      "A courier steps off the midnight tram onto a rain-swept cobblestone corner carrying a sealed brass parcel that hums softly against the ribs. The man in the grey coat watches from beneath a sagging awning while the corner shop shutters rattle in the wind. Find the recipient before the humming stops, or the contents will ruin your only chance out of the city.",
    poster: "fork-parcel",
    character: {
      name: "the man in the grey coat",
      voice:
        "Flat and tired, he speaks in short questions, never raises his voice or names his employer, and wants whatever is humming inside your satchel.",
    },
    tone: TONE,
  },
  {
    title: "The Shuttered Depot",
    tagline: "The clerk has been expecting your footsteps since Tuesday.",
    premise:
      "A courier ducks into the twenty-four-hour parcel depot out of the pouring rain, carrying an unlabelled ledger wrapped in oilcloth. Behind the brass counter, the clerk in the green visor counts change under flickering fluorescent tubes while the man in the grey coat lingers outside the fogged window. Hand over the ledger before midnight strikes, or your route through the city will be permanently revoked.",
    poster: "fork-depot",
    character: {
      name: "the clerk in the green visor",
      voice:
        "Fast and dryly polite, he clips his words while tallying coins, never reveals who owns the store, and wants the receipt signed before you leave.",
    },
    tone: TONE,
  },
  {
    title: "The Red Door",
    tagline: "The red door was unlocked before your fingers touched the brass.",
    premise:
      "A courier walks down a dark residential alley on the wettest night of the month, looking for an address scratched onto a paper slip. Every townhouse is shuttered against the storm except for one glowing red door standing ajar. Slip the wax-sealed envelope across the threshold before the streetlights cut out, or the watchers in the shadows will intercept it.",
    poster: "fork-reddoor",
    character: {
      name: "the woman behind the red door",
      voice:
        "Quiet and measured, she speaks in guarded whispers through the door chain, never uses your name aloud, and wants proof that the grey coat did not follow you.",
    },
    tone: TONE,
  },
  {
    title: "The Midnight Bus",
    tagline: "The route ended three stops ago, but the engine never died.",
    premise:
      "A courier boards the city's last outbound bus in the freezing drizzle, holding a wooden lockbox with a loose latch. The bus driver watches through the misted rear-view mirror as the red door and the depot slip away into the dark. Reach the terminal stop without letting the lid spring open, or whatever is trapped inside will spill onto the floorboards.",
    poster: "fork-bus",
    character: {
      name: "the midnight bus driver",
      voice:
        "Low and unhurried, he talks like a man with nowhere left to drive, never looks directly into the rear-view mirror, and wants your ticket punched before the rain floods the road.",
    },
    tone: TONE,
  },
  {
    title: "The Canal Bridge",
    tagline: "Tolls across the black canal are never settled in ordinary coin.",
    premise:
      "A courier races along the cobblestone embankment in the driving rain, carrying a stamped metal cylinder meant for the docks. The canal bridge watchman bars the turnstile with a heavy iron chain, listening to the midnight bus rumble past in the distance. Hand over the required toll before the canal locks open, or the lower district will be cut off until dawn.",
    poster: "fork-bridge",
    character: {
      name: "the canal bridge watchman",
      voice:
        "Gruff and gravelly, he barks questions over the rushing water, never apologizes for lowering the iron gate, and wants the brass token that clears your crossing.",
    },
    tone: TONE,
  },
  {
    title: "The Basement Archive",
    tagline: "Every lost delivery in this city leaves an ink stain in the vault.",
    premise:
      "A courier descends the slippery stone stairs into the municipal records vault while thunder rattles the pavement overhead, searching for a route manifest that was never logged. The basement archivist inspects your wet courier badge by oil lamp, having already turned away the clerk in the green visor an hour earlier. Locate the unredacted delivery file before the water pumps fail, or your name will be erased from the courier union.",
    poster: "fork-archive",
    character: {
      name: "the basement archivist",
      voice:
        "Hushed and pedantic, she mutters under her breath while thumbing ledger cards, never speaks above a library whisper, and wants the missing carbon slip returned to file.",
    },
    tone: TONE,
  },
  {
    title: "The Midnight Relay",
    tagline: "The dispatch radio only crackles when someone missed their turn.",
    premise:
      "A courier reaches the rooftop telephone relay box above the flooded city square, carrying a reel of perforated cipher tape soaked in rain. The night dispatcher crackles through the receiver, demanding to know why the man in the grey coat reported a breach at the canal bridge. Transmit the cipher before the storm topples the antenna, or all courier communication across the city goes dead.",
    poster: "fork-relay",
    character: {
      name: "the night dispatcher",
      voice:
        "Crackly and sharp, she snaps orders through the static receiver, never repeats delivery coordinates twice, and wants your route cleared before the morning shift arrives.",
    },
    tone: TONE,
  },
];

export const SEEDS: CatalogEntry[] = CATALOG;

export function hashString(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

if (process.env.KEIKI_LINE === "NA") {
  delete process.env.KEIKI_LINE;
}

const DEMO_START_DATE = "2026-11-15";

export function catalogEntry(date: string): CatalogEntry {
  const offset = dayIndex(date) - dayIndex(DEMO_START_DATE);
  const index = ((offset % CATALOG.length) + CATALOG.length) % CATALOG.length;
  return CATALOG[index];
}

export function episodeSeed(date: string): number {
  return hashString(`fork:${date}`) % 1000000;
}

export async function ensureEpisode(ctx: MutationCtx, date: string): Promise<Doc<"episodes">> {
  const existing = await ctx.db
    .query("episodes")
    .withIndex("by_date", (q) => q.eq("date", date))
    .unique();
  if (existing !== null) return existing;
  const entry = catalogEntry(date);
  const seed = episodeSeed(date);
  const id = await ctx.db.insert("episodes", {
    date,
    dayIndex: dayIndex(date),
    seed,
    title: entry.title,
    tagline: entry.tagline,
    premise: entry.premise,
    character: entry.character,
    voiceId: voiceFor(entry.character.name),
    styleBible: STYLE_BIBLE,
    styleImageUrl: styleImageUrl(),
    characterSheetUrl: characterSheetUrl(),
    voiceRefUrl: voiceRefUrl(),
    posterUrl: `https://picsum.photos/seed/${entry.poster}-${date}/1080/1920`,
    beatsTotal: episodeBeats(),
    aspect: episodeAspect(),
    seconds: episodeSeconds(),
    createdAt: Date.now(),
  });
  const created = await ctx.db.get(id);
  if (created === null) throw new Error("episode insert failed");
  return created;
}
