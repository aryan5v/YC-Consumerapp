import { afterAll, beforeAll, describe, expect, test } from "vitest";
import {
  buildVideoRequest,
  contentUrl,
  jobIdOf,
  jobStateOf,
  referenceLegend,
} from "../convex/lib/trayUniserve";
import { instanceCount, instanceForSeed, trayJobReference, trayMode } from "../convex/lib/tray";

const FULL = {
  baseUrl: "http://tray:8000",
  apiKey: null,
  model: "fasth3",
  task: "ref2va",
  prompt: "A courier steps off the last bus.",
  seed: 7,
  aspect: "9:16",
  seconds: 5,
  continuityFrameUrl: "https://cdn/frame.jpg",
  continuityVideoUrl: "https://cdn/parent.mp4",
  characterSheetUrl: "https://cdn/character.png",
  styleImageUrl: "https://cdn/style.png",
  voiceRefUrl: "https://cdn/voice.wav",
};

beforeAll(() => {
  delete process.env.FASTH3_SIZE;
  delete process.env.FASTH3_SHORT_EDGE;
  delete process.env.FASTH3_NUM_FRAMES;
  delete process.env.FASTH3_URLS;
  delete process.env.FASTH3_URL;
});

afterAll(() => {
  delete process.env.FASTH3_URLS;
});

describe("the UniServe adapter", () => {
  test("builds the documented /v1/videos body with every consistency anchor", () => {
    const body = buildVideoRequest(FULL);
    expect(body.model).toBe("fasth3");
    expect(body.task).toBe("ref2va");
    expect(body.prompt).toBe(FULL.prompt);
    expect(body.seconds).toBe("5");
    expect(body.seed).toBe(7);
    expect(body.aspect_ratio).toBe("9:16");
    expect(body.short_edge).toBe(768);
    expect(body.image_reference).toEqual([
      { image_url: "https://cdn/character.png" },
      { image_url: "https://cdn/style.png" },
      { image_url: "https://cdn/frame.jpg" },
    ]);
    expect(body.video_reference).toEqual([{ video_url: "https://cdn/parent.mp4" }]);
    expect(body.audio_reference).toEqual([{ audio_url: "https://cdn/voice.wav" }]);
    expect(JSON.stringify(body)).not.toContain("undefined");
  });

  test("drops anchors the episode does not have and honours an explicit size", () => {
    const bare = buildVideoRequest({
      ...FULL,
      continuityFrameUrl: null,
      continuityVideoUrl: null,
      characterSheetUrl: null,
      styleImageUrl: null,
      voiceRefUrl: null,
    });
    expect(bare.image_reference).toBeUndefined();
    expect(bare.video_reference).toBeUndefined();
    expect(bare.audio_reference).toBeUndefined();
    expect(referenceLegend({ ...FULL, characterSheetUrl: null, styleImageUrl: null, continuityFrameUrl: null, continuityVideoUrl: null, voiceRefUrl: null })).toBe("");

    process.env.FASTH3_SIZE = "768x1360";
    const sized = buildVideoRequest(FULL);
    expect(sized.size).toBe("768x1360");
    expect(sized.aspect_ratio).toBeUndefined();
    delete process.env.FASTH3_SIZE;
  });

  test("describes the references in the order they are sent", () => {
    const legend = referenceLegend(FULL);
    expect(legend).toContain("the first image reference is the protagonist");
    expect(legend).toContain("the video reference is the shot immediately before this one");
    expect(legend).toContain("the audio reference is the voice the character speaks with");
  });

  test("reads the job states UniServe reports, including a failed job", () => {
    expect(jobIdOf({ id: "j1" })).toBe("j1");
    expect(jobIdOf({ video_id: "j2" })).toBe("j2");
    expect(jobIdOf({})).toBeNull();

    expect(jobStateOf({ id: "j1", status: "queued" }, "http://tray:8000").status).toBe("queued");
    expect(jobStateOf({ id: "j1", status: "in_progress" }, "http://tray:8000").status).toBe("generating");

    const ready = jobStateOf({ id: "j1", status: "completed" }, "http://tray:8000");
    expect(ready.status).toBe("ready");
    expect(ready.mp4Url).toBe("http://tray:8000/v1/videos/j1/content");
    expect(ready.lastFrameUrl).toBeNull();

    const failed = jobStateOf({ id: "j1", status: "failed", error: { message: "out of memory" } }, "http://tray:8000");
    expect(failed.status).toBe("failed");
    expect(failed.mp4Url).toBeNull();
    expect(failed.error).toBe("out of memory");

    expect(contentUrl("http://tray:8000/", "j 1")).toBe("http://tray:8000//v1/videos/j%201/content");
  });

  test("spreads parallel children across the four instances and remembers which served each", () => {
    expect(trayMode()).toBe("mock");
    expect(instanceForSeed(3)).toBeNull();

    process.env.FASTH3_URLS = "http://a:8000, http://b:8000 ,http://c:8000, http://d:8000";
    expect(instanceCount()).toBe(4);
    expect([0, 1, 2, 3].map((seed) => instanceForSeed(seed))).toEqual([
      "http://a:8000",
      "http://b:8000",
      "http://c:8000",
      "http://d:8000",
    ]);
    expect(trayMode()).toBe("live");
    expect(trayJobReference("job9@http://c:8000")).toEqual({ jobId: "job9", baseUrl: "http://c:8000" });
    expect(trayJobReference("job9")).toEqual({ jobId: "job9", baseUrl: null });

    delete process.env.FASTH3_URLS;
    process.env.FASTH3_URL = "http://single:8000";
    expect(trayMode()).toBe("live");
    expect(instanceCount()).toBe(1);
    expect(instanceForSeed(9)).toBe("http://single:8000");
    delete process.env.FASTH3_URL;
    expect(trayMode()).toBe("mock");
  });
});
