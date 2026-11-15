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
import { dayIndex } from "./pacific";

type CatalogEntry = { title: string; tagline: string; premise: string; poster: string };

const CATALOG: CatalogEntry[] = [
  {
    title: "The Humming Parcel",
    tagline: "One street, one parcel, three ways out.",
    premise:
      "A courier gets off the last bus at midnight carrying a sealed parcel that hums. The street is short, the shop is shuttered and a man in a grey coat is watching from the corner.",
    poster: "fork-parcel",
  },
  {
    title: "Four Wet Blocks",
    tagline: "The city is short tonight, and someone is waiting.",
    premise:
      "The last bus drops a courier four blocks from a delivery address that does not exist on any map, on the wettest night of the year.",
    poster: "fork-blocks",
  },
  {
    title: "The Grey Coat",
    tagline: "He counted your lies before you told them.",
    premise:
      "A man in a grey coat has been on the same corner every night this week, and tonight he steps off it and follows the courier instead of watching.",
    poster: "fork-coat",
  },
  {
    title: "Last Bus Home",
    tagline: "You got off at the wrong stop on purpose.",
    premise:
      "A courier rides the last bus past their own stop and gets off where the lights end, carrying something they were told not to open.",
    poster: "fork-bus",
  },
  {
    title: "The Red Door",
    tagline: "It was open before you touched it.",
    premise:
      "Every door on this street is shuttered for the night except one red door, which is standing open with the light on inside.",
    poster: "fork-reddoor",
  },
  {
    title: "One Hour Before Rain",
    tagline: "Everyone here wants the same parcel.",
    premise:
      "The rain is one hour out and three people on one street are all waiting for the same courier to make a mistake.",
    poster: "fork-rain",
  },
  {
    title: "The Store That Never Closes",
    tagline: "The clerk has been waiting since Tuesday.",
    premise:
      "A corner store is open at midnight with one clerk behind the counter who has been expecting this exact courier for a week.",
    poster: "fork-store",
  },
  {
    title: "A Coin and Two Doors",
    tagline: "Pick the door you can explain.",
    premise:
      "There is a coin on the wet pavement and two doors, and whoever picks up the coin has to explain which door they came out of.",
    poster: "fork-coin",
  },
];

export function hashString(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

export function catalogEntry(date: string): CatalogEntry {
  return CATALOG[hashString(date) % CATALOG.length];
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
