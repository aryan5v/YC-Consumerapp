import { afterAll, beforeAll, describe, expect, test } from "vitest";
import {
  buildVideoRequest,
  contentUrl,
  inlineConditions,
  jobIdOf,
  jobStateOf,
  submitVideo,
} from "../convex/lib/trayUniserve";
import { instanceCount, instanceForSeed, trayJobReference, trayMode } from "../convex/lib/tray";

const FULL = {
  baseUrl: "http://tray:8000",
  apiKey: null,
  model: "FastH3-Omni",
  task: "ref2va",
  prompt: "A courier steps off the last bus.",
  seed: 7,
  aspect: "9:16",
  seconds: 5,
  continuityFrameUrl: "https://cdn/frame.png",
  continuityVideoUrl: "https://cdn/parent.mp4",
  characterSheetUrl: "https://cdn/character.png",
  styleImageUrl: "https://cdn/style.png",
};

function fakeLoad(
  overrides: Record<string, { bytes: number; mime: string }> = {},
): (url: string) => Promise<Response> {
  return async (url: string) => {
    const spec = overrides[url] ?? { bytes: 2048, mime: "image/png" };
    const body = new Uint8Array(spec.bytes);
    return new Response(body, { status: 200, headers: { "content-type": spec.mime } });
  };
}

beforeAll(() => {
  delete process.env.FASTH3_SHORT_EDGE;
  delete process.env.FASTH3_URLS;
  delete process.env.FASTH3_URL;
});

afterAll(() => {
  delete process.env.FASTH3_URLS;
});

describe("the UniServe adapter", () => {
  test("builds exactly the body FastH3-Omni accepts, with a pinned first frame", async () => {
    const conditions = await inlineConditions(FULL, fakeLoad());
    const body = buildVideoRequest(FULL, conditions);

    expect(Object.keys(body).sort()).toEqual(["conditions", "model", "prompt", "seed", "target", "task"]);
    expect(body.model).toBe("FastH3-Omni");
    expect(body.task).toBe("ref2va");
    expect(body.seed).toBe(7);
    expect(body.target).toEqual({ short_edge: 768, aspect_ratio: "9:16", duration_seconds: 5 });
    expect(conditions.map((entry) => entry.role)).toEqual(["keyframe", "reference", "reference"]);
    expect(conditions.map((entry) => entry.type)).toEqual(["image", "image", "image"]);
    expect(conditions[0].frame_index).toBe(0);
    expect(conditions[0].uri.startsWith("data:image/png;base64,")).toBe(true);
    expect(body.prompt).toContain(FULL.prompt);
    expect(JSON.stringify(body)).not.toContain("undefined");
    expect(JSON.stringify(body)).not.toContain("http://cdn");
  });

  test("honours a different short edge and aspect for the target", async () => {
    process.env.FASTH3_SHORT_EDGE = "512";
    const body = buildVideoRequest({ ...FULL, aspect: "16:9", seconds: 8 }, await inlineConditions(FULL, fakeLoad()));
    expect(body.target).toEqual({ short_edge: 512, aspect_ratio: "16:9", duration_seconds: 8 });
    delete process.env.FASTH3_SHORT_EDGE;
  });

  test("sends no conditions when the episode has no images, and the submit refuses that", async () => {
    const bare = await inlineConditions(
      {
        ...FULL,
        continuityFrameUrl: null,
        continuityVideoUrl: null,
        characterSheetUrl: null,
        styleImageUrl: null,
      },
      fakeLoad(),
    );
    expect(bare).toEqual([]);
    await expect(
      submitVideo({
        ...FULL,
        baseUrl: "http://tray:8000",
        continuityFrameUrl: null,
        continuityVideoUrl: null,
        characterSheetUrl: null,
        styleImageUrl: null,
      }),
    ).rejects.toThrow(/reference image/);
  });

  test("skips a reference it cannot fetch small enough to inline", async () => {
    const huge = await inlineConditions(
      { ...FULL, continuityVideoUrl: null, characterSheetUrl: "https://cdn/huge.png" },
      fakeLoad({ "https://cdn/huge.png": { bytes: 9_000_000, mime: "image/png" } }),
    );
    expect(huge.map((entry) => entry.role)).toEqual(["keyframe", "reference"]);
  });

  test("falls back to the parent shot as a video reference when there is no last frame", async () => {
    const conditions = await inlineConditions(
      { ...FULL, continuityFrameUrl: null },
      fakeLoad({ "https://cdn/parent.mp4": { bytes: 900_000, mime: "video/mp4" } }),
    );
    expect(conditions[0].type).toBe("video");
    expect(conditions[0].role).toBe("reference");
    expect(conditions[0].uri.startsWith("data:video/mp4;base64,")).toBe(true);

    process.env.FASTH3_CONTINUITY_VIDEO = "off";
    const off = await inlineConditions({ ...FULL, continuityFrameUrl: null }, fakeLoad());
    expect(off.map((entry) => entry.role)).toEqual(["reference", "reference"]);
    delete process.env.FASTH3_CONTINUITY_VIDEO;
  });

  test("describes the keyframe and the references in the order they are sent", async () => {
    const body = buildVideoRequest(FULL, await inlineConditions(FULL, fakeLoad()));
    const legend = String(body.prompt).split("\n\n")[1];
    expect(legend).toContain("the keyframe image is the exact first frame this shot starts from");
    expect(legend).toContain("the first reference image is the protagonist");
    expect(legend).toContain("the next reference image is the visual style");
  });

  test("reads the job states UniServe reports, including a failed job", () => {
    expect(jobIdOf({ id: "j1" })).toBe("j1");
    expect(jobIdOf({ video_id: "j2" })).toBe("j2");
    expect(jobIdOf({})).toBeNull();

    expect(jobStateOf({ id: "j1", status: "queued" }, "http://tray:8000").status).toBe("queued");
    expect(jobStateOf({ id: "j1", status: "in_progress" }, "http://tray:8000").status).toBe("generating");

    const ready = jobStateOf(
      { id: "j1", status: "completed", completed_steps: 8, total_steps: 8, phase: "completed", size: "768x1344" },
      "http://tray:8000",
    );
    expect(ready.status).toBe("ready");
    expect(ready.mp4Url).toBe("http://tray:8000/v1/videos/j1/content");
    expect(ready.lastFrameUrl).toBeNull();
    expect(ready.progress).toBe("completed 8/8 steps");

    const failed = jobStateOf({ id: "j1", status: "failed", error: { message: "out of memory" } }, "http://tray:8000");
    expect(failed.status).toBe("failed");
    expect(failed.mp4Url).toBeNull();
    expect(failed.error).toBe("out of memory");

    expect(contentUrl("http://tray:8000/", "j 1")).toBe("http://tray:8000/v1/videos/j%201/content");
    expect(contentUrl("https://fasth3-1.example.xyz/v1", "j1")).toBe(
      "https://fasth3-1.example.xyz/v1/videos/j1/content",
    );
  });

  test("spreads parallel children across the four instances and remembers which served each", () => {
    expect(trayMode()).toBe("mock");
    expect(instanceForSeed(3)).toBeNull();

    process.env.FASTH3_URLS = "http://a:8000, http://b:8000 ,http://c:8000, http://d:8000";
    expect(instanceCount()).toBe(4);
    process.env.FASTH3_URLS = "https://a.example.xyz/v1,https://b.example.xyz/v1";
    expect(instanceForSeed(0)).toBe("https://a.example.xyz");
    process.env.FASTH3_URLS = "http://a:8000, http://b:8000 ,http://c:8000, http://d:8000";
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
