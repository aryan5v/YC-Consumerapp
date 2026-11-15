/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import schema from "../convex/schema";
import {
  CATALOG,
  SEEDS,
  TONE,
  catalogEntry,
  ensureEpisode,
  episodeSeed,
  hashString,
} from "../convex/lib/episodes";
import { addDays, dayIndex, pacificDate } from "../convex/lib/pacific";

const rawModules = import.meta.glob("../convex/**/*.*s");
const modules = Object.fromEntries(
  Object.entries(rawModules).map(([path, loader]) => [path.replace("../convex/", "./"), loader]),
);

function newBackend() {
  return convexTest(schema, modules);
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function countSentences(text: string): number {
  const matches = text.trim().match(/[^.!?]+[.!?]+/g);
  return matches ? matches.length : 0;
}

describe("the seven episode seeds", () => {
  test("holds exactly seven seeds in the weekly rotation", () => {
    expect(SEEDS).toHaveLength(7);
    expect(CATALOG).toHaveLength(7);
    expect(CATALOG).toBe(SEEDS);
  });

  test("the seven seeds are all distinct in title, premise and character", () => {
    const titles = SEEDS.map((s) => s.title);
    expect(new Set(titles).size).toBe(7);

    const premises = SEEDS.map((s) => s.premise);
    expect(new Set(premises).size).toBe(7);

    const characterNames = SEEDS.map((s) => s.character.name);
    expect(new Set(characterNames).size).toBe(7);

    const characterVoices = SEEDS.map((s) => s.character.voice);
    expect(new Set(characterVoices).size).toBe(7);
  });

  test("every seed has a non-empty title, tagline, premise, character name and voice", () => {
    for (const seed of SEEDS) {
      expect(seed.title.trim().length).toBeGreaterThan(0);
      expect(seed.tagline.trim().length).toBeGreaterThan(0);
      expect(seed.premise.trim().length).toBeGreaterThan(0);
      expect(seed.character.name.trim().length).toBeGreaterThan(0);
      expect(seed.character.voice.trim().length).toBeGreaterThan(0);

      // Title must be three or four words
      const words = countWords(seed.title);
      expect(words).toBeGreaterThanOrEqual(3);
      expect(words).toBeLessThanOrEqual(4);

      // Tagline is one sentence
      expect(countSentences(seed.tagline)).toBe(1);

      // Premise is two or three sentences
      const premiseSentences = countSentences(seed.premise);
      expect(premiseSentences).toBeGreaterThanOrEqual(2);
      expect(premiseSentences).toBeLessThanOrEqual(3);

      // Character voice is one sentence
      expect(countSentences(seed.character.voice)).toBe(1);

      // Same protagonist premise (courier) in all seven
      expect(seed.premise.toLowerCase()).toContain("courier");
    }
  });

  test("the seven days today..today+6 map to seven different seeds", () => {
    const today = pacificDate();
    const week = Array.from({ length: 7 }, (_, i) => catalogEntry(addDays(today, i)));

    const titles = week.map((entry) => entry.title);
    expect(new Set(titles).size).toBe(7);

    const characters = week.map((entry) => entry.character.name);
    expect(new Set(characters).size).toBe(7);

    // Consecutive days are always different
    for (let i = 0; i < 6; i += 1) {
      expect(week[i].title).not.toBe(week[i + 1].title);
      expect(week[i].character.name).not.toBe(week[i + 1].character.name);
    }
  });

  test("the week repeats (day 0 and day 7 map to the same seed)", () => {
    const today = pacificDate();
    const day0 = catalogEntry(today);
    const day7 = catalogEntry(addDays(today, 7));
    expect(day7).toEqual(day0);

    for (let i = 0; i < 14; i += 1) {
      const original = catalogEntry(addDays(today, i));
      const nextWeek = catalogEntry(addDays(today, i + 7));
      expect(nextWeek).toEqual(original);
    }
  });

  test("every seed's text is governed by the single TONE constant", () => {
    expect(typeof TONE).toBe("string");
    expect(TONE).toBe("light mystery");

    for (const seed of SEEDS) {
      expect(seed.tone).toBe(TONE);
    }

    for (let i = 0; i < 7; i += 1) {
      const entry = catalogEntry(addDays(pacificDate(), i));
      expect(entry.tone).toBe(TONE);
    }
  });

  test("hashString and episodeSeed remain exported and stable", () => {
    const date = "2026-11-15";
    const seed1 = episodeSeed(date);
    const seed2 = episodeSeed(date);
    expect(seed1).toBe(seed2);
    expect(typeof seed1).toBe("number");
    expect(seed1).toBeGreaterThanOrEqual(0);
    expect(seed1).toBeLessThan(1000000);

    const h1 = hashString("fork-test");
    const h2 = hashString("fork-test");
    expect(h1).toBe(h2);
    expect(typeof h1).toBe("number");
  });
});

describe("ensureEpisode database persistence", () => {
  test("creates a row with every required field for seven consecutive dates", async () => {
    const t = newBackend();
    const today = pacificDate();

    for (let i = 0; i < 7; i += 1) {
      const date = addDays(today, i);
      const row = await t.run(async (ctx) => {
        return await ensureEpisode(ctx, date);
      });

      expect(row).toBeDefined();
      expect(row.date).toBe(date);
      expect(row.dayIndex).toBe(dayIndex(date));
      expect(typeof row.seed).toBe("number");

      expect(typeof row.title).toBe("string");
      expect(row.title.trim().length).toBeGreaterThan(0);

      expect(typeof row.tagline).toBe("string");
      expect(row.tagline.trim().length).toBeGreaterThan(0);

      expect(typeof row.premise).toBe("string");
      expect(row.premise.trim().length).toBeGreaterThan(0);

      expect(row.character).toBeDefined();
      expect(typeof row.character.name).toBe("string");
      expect(row.character.name.trim().length).toBeGreaterThan(0);
      expect(typeof row.character.voice).toBe("string");
      expect(row.character.voice.trim().length).toBeGreaterThan(0);

      expect(typeof row.voiceId).toBe("string");
      expect(row.voiceId.trim().length).toBeGreaterThan(0);

      expect(typeof row.styleBible).toBe("string");
      expect(row.styleBible.trim().length).toBeGreaterThan(0);

      expect(typeof row.styleImageUrl).toBe("string");
      expect(row.styleImageUrl).toMatch(/^https:\/\//);

      expect(typeof row.characterSheetUrl).toBe("string");
      expect(row.characterSheetUrl).toMatch(/^https:\/\//);

      expect(typeof row.voiceRefUrl).toBe("string");
      expect(row.voiceRefUrl).toMatch(/^https:\/\//);

      expect(typeof row.posterUrl).toBe("string");
      expect(row.posterUrl).toContain(date);

      expect(typeof row.beatsTotal).toBe("number");
      expect(row.beatsTotal).toBeGreaterThan(0);

      expect(typeof row.aspect).toBe("string");
      expect(row.aspect.length).toBeGreaterThan(0);

      expect(typeof row.seconds).toBe("number");
      expect(row.seconds).toBeGreaterThan(0);

      expect(typeof row.createdAt).toBe("number");
      expect(row.createdAt).toBeGreaterThan(0);
    }
  });

  test("ensureEpisode is idempotent for a given date", async () => {
    const t = newBackend();
    const date = pacificDate();

    const first = await t.run(async (ctx) => {
      return await ensureEpisode(ctx, date);
    });

    const second = await t.run(async (ctx) => {
      return await ensureEpisode(ctx, date);
    });

    expect(second._id).toBe(first._id);
    expect(second.seed).toBe(first.seed);
    expect(second.title).toBe(first.title);
    expect(second.character.name).toBe(first.character.name);
  });
});
