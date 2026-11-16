import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { directorCompletion } from "../convex/lib/deepseek";
import { synthesizeWithModel, transcribeWithModel } from "../convex/lib/openai";

const names = ["DIRECTOR_PROVIDER", "DIRECTOR_MODEL", "DIRECTOR_FALLBACK_MODEL", "DIRECTOR_API_KEY", "DIRECTOR_BASE_URL", "OPENAI_API_KEY", "OPENAI_TTS_MODEL", "OPENAI_STT_MODEL", "OPENAI_TTS_FALLBACK_MODEL", "OPENAI_STT_FALLBACK_MODEL", "OPENAI_BASE_URL"] as const;
const saved = Object.fromEntries(names.map((name) => [name, process.env[name]]));
beforeEach(() => {
  for (const name of names) delete process.env[name];
  process.env.DIRECTOR_PROVIDER = "openai";
  process.env.DIRECTOR_MODEL = "gpt-6.1-sol";
  process.env.OPENAI_API_KEY = "test-only";
});
afterEach(() => {
  for (const name of names) {
    if (saved[name] === undefined) delete process.env[name];
    else process.env[name] = saved[name];
  }
  vi.restoreAllMocks();
});

const messages = [{ role: "user" as const, content: "Return a JSON object with ok true." }];
const chat = () => new Response(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }));

describe("OpenAI model migration and one-attempt fallbacks", () => {
  test("uses Responses with low reasoning and reads output message text", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      status: "completed", output: [{ type: "reasoning", summary: [] }, { type: "message", content: [{ type: "output_text", text: '{"ok":true}' }] }],
    })));
    expect(await directorCompletion(messages)).toEqual({ model: "gpt-6.1-sol", text: '{"ok":true}' });
    expect(fetch.mock.calls[0][0]).toBe("https://api.openai.com/v1/responses");
    const body = JSON.parse(fetch.mock.calls[0][1]!.body as string);
    expect(body.reasoning).toEqual({ effort: "low" });
    expect(body.text.format.type).toBe("json_object");
    expect(body.input).toEqual(messages);
    expect(body.store).toBe(false);
    expect(body.messages).toBeUndefined();
  });

  test.each([
    ["HTTP failure", () => new Response("unavailable", { status: 503 })],
    ["incomplete output", () => new Response(JSON.stringify({ status: "incomplete", output: [] }))],
    ["invalid JSON", () => new Response(JSON.stringify({ output: [{ type: "message", content: [{ type: "output_text", text: "not JSON" }] }] }))],
  ])("falls back to the previous director on %s", async (_, failed) => {
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(failed()).mockResolvedValueOnce(chat());
    expect((await directorCompletion(messages)).model).toBe("gpt-5.4");
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[1][0]).toBe("https://api.openai.com/v1/chat/completions");
    const body = JSON.parse(fetch.mock.calls[1][1]!.body as string);
    expect(body.model).toBe("gpt-5.4");
    expect(body.max_completion_tokens).toBe(2000);
  });

  test("does not retry forever when both director models fail", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("offline"));
    await expect(directorCompletion(messages)).rejects.toThrow("offline");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  test("keeps DeepSeek on its existing Chat Completions protocol", async () => {
    process.env.DIRECTOR_PROVIDER = "deepseek";
    process.env.DIRECTOR_MODEL = "deepseek-chat";
    process.env.DIRECTOR_API_KEY = "test-only";
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(chat());
    expect((await directorCompletion(messages)).model).toBe("deepseek-chat");
    expect(fetch.mock.calls[0][0]).toBe("https://api.deepseek.com/chat/completions");
    expect(JSON.parse(fetch.mock.calls[0][1]!.body as string).max_tokens).toBe(2000);
  });

  test("speech stays on audio/speech and falls back to the previous alias", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("not found", { status: 404 }))
      .mockResolvedValueOnce(new Response(new Blob(["audio"], { type: "audio/mpeg" })));
    const result = await synthesizeWithModel({ text: "the parcel", voice: "marin" });
    expect(result.model).toBe("gpt-4o-mini-tts");
    expect(result.audio.size).toBeGreaterThan(0);
    expect(JSON.parse(fetch.mock.calls[0][1]!.body as string).model).toBe("gpt-4o-mini-tts-2025-12-15");
    expect(fetch.mock.calls[1][0]).toBe("https://api.openai.com/v1/audio/speech");
  });

  test("transcription rebuilds the multipart body for the fallback model", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ text: "the parcel" })));
    expect(await transcribeWithModel(new Blob(["audio"], { type: "audio/mpeg" }), "audio/mpeg"))
      .toEqual({ text: "the parcel", model: "gpt-4o-transcribe" });
    expect((fetch.mock.calls[0][1]!.body as FormData).get("model")).toBe("gpt-transcribe");
    expect((fetch.mock.calls[1][1]!.body as FormData).get("model")).toBe("gpt-4o-transcribe");
    expect(fetch.mock.calls[1][0]).toBe("https://api.openai.com/v1/audio/transcriptions");
  });
});
