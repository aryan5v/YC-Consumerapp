import { directorTimeoutMs } from "./config";
import { envFlag } from "./env";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export function directorKey(): string | null {
  return envFlag("DIRECTOR_API_KEY") ?? envFlag(directorProvider() === "openai" ? "OPENAI_API_KEY" : "DEEPSEEK_API_KEY");
}

export function directorMode(): "live" | "fixture" {
  return directorKey() === null ? "fixture" : "live";
}

export function directorProvider(): "deepseek" | "openai" {
  return envFlag("DIRECTOR_PROVIDER") === "openai" ? "openai" : "deepseek";
}

export function directorBaseUrl(): string {
  const explicit = envFlag("DIRECTOR_BASE_URL");
  if (explicit !== null) return explicit.replace(/\/+$/, "");
  if (directorProvider() === "openai") return "https://api.openai.com/v1";
  return (envFlag("DEEPSEEK_BASE_URL") ?? "https://api.deepseek.com").replace(/\/+$/, "");
}

export function directorModel(): string {
  const explicit = envFlag("DIRECTOR_MODEL");
  if (explicit !== null) return explicit;
  if (directorProvider() === "openai") return "gpt-6.1-sol";
  return envFlag("DEEPSEEK_MODEL") ?? "deepseek-chat";
}

async function requestDirector(messages: ChatMessage[], maxTokens: number, model: string, responses: boolean): Promise<string> {
  const base = directorBaseUrl();
  const key = directorKey();
  if (key === null) throw new Error("no director API key is set");
  const body: Record<string, unknown> = responses ? {
    model, input: messages, reasoning: { effort: "low" },
    text: { format: { type: "json_object" } }, max_output_tokens: maxTokens, store: false,
  } : {
    model,
    messages,
    response_format: { type: "json_object" },
  };
  if (!responses && directorProvider() === "openai") {
    body.max_completion_tokens = maxTokens;
  } else if (!responses) {
    body.temperature = 1.0;
    body.max_tokens = maxTokens;
  }
  const res = await fetch(`${base}/${responses ? "responses" : "chat/completions"}`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(responses ? Math.min(directorTimeoutMs(), 15000) : directorTimeoutMs()),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`director request failed: ${res.status}`);
  const parsed = JSON.parse(text) as {
    status?: string;
    output?: { type?: string; content?: { type?: string; text?: string }[] }[];
    choices?: { message?: { content?: unknown } }[];
  };
  if (parsed.status === "incomplete" || parsed.status === "failed") throw new Error("director response was incomplete");
  const content = responses ? (parsed.output ?? [])
    .filter((item) => item.type === "message")
    .flatMap((item) => item.content ?? [])
    .filter((item) => item.type === "output_text")
    .map((item) => item.text ?? "").join("") : parsed.choices?.[0]?.message?.content;
  if (typeof content !== "string" || content.trim() === "") throw new Error("director returned no content");
  const object = parseJSONObject(content);
  if (object === null || typeof object !== "object" || Array.isArray(object)) throw new Error("director did not return a JSON object");
  return content;
}

export async function directorCompletion(messages: ChatMessage[], maxTokens = 2000): Promise<{ text: string; model: string }> {
  const model = directorModel();
  if (directorProvider() !== "openai") return { text: await requestDirector(messages, maxTokens, model, false), model };
  const fallback = envFlag("DIRECTOR_FALLBACK_MODEL") ?? "gpt-5.4";
  try {
    return { text: await requestDirector(messages, maxTokens, model, true), model };
  } catch (error) {
    if (fallback === model) throw error;
    return { text: await requestDirector(messages, maxTokens, fallback, false), model: fallback };
  }
}

export async function deepseekJSON(messages: ChatMessage[], maxTokens = 2000): Promise<string> {
  return (await directorCompletion(messages, maxTokens)).text;
}

export function parseJSONObject(raw: string): unknown {
  const trimmed = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start === -1 || end <= start) throw new Error("no JSON object in director response");
    return JSON.parse(trimmed.slice(start, end + 1));
  }
}
