import { describe, expect, it } from "vitest";
import { buildDreamPrompt } from "../convex/dream";

describe("buildDreamPrompt", () => {
  it("puts the player's words first and does not default a misty harbour to sunlight", () => {
    const scene = "A misty harbour lantern festival";
    const prompt = buildDreamPrompt(scene);
    const description = prompt.split("overall_soundscape:")[0] ?? "";
    expect(prompt.startsWith("integrated_multimodal_description:")).toBe(true);
    expect(description.indexOf(scene)).toBeLessThan(description.indexOf("If a person is in frame"));
    expect(description).not.toMatch(/natural sunlight/);
    expect(description).toMatch(/lantern and firelight/);
    expect(description).toMatch(/no daylight sun/);
  });

  it("keeps a sunlit scene in daylight when the player asked for sun", () => {
    const prompt = buildDreamPrompt("A sunlit harbour workshop with a brass lamp");
    expect(prompt).toContain("A sunlit harbour workshop with a brass lamp");
    expect(prompt).toMatch(/natural sunlight/);
  });
});
