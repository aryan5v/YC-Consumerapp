import { directorTimeoutMs } from "./config";
import { envFlag } from "./env";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export function directorKey(): string | null {
  return envFlag("DIRECTOR_API_KEY") ?? envFlag("DEEPSEEK_API_KEY");
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
  if (directorProvider() === "openai") return "gpt-5.4";
  return envFlag("DEEPSEEK_MODEL") ?? "deepseek-chat";
}

export async function deepseekJSON(messages: ChatMessage[], maxTokens = 2000): Promise<string> {
  const base = directorBaseUrl();
  const key = directorKey();
  if (key === null) throw new Error("no director API key is set");
  const body: Record<string, unknown> = {
    model: directorModel(),
    messages,
    response_format: { type: "json_object" },
  };
  if (directorProvider() === "openai") {
    body.max_completion_tokens = maxTokens;
  } else {
    body.temperature = 1.0;
    body.max_tokens = maxTokens;
  }
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(directorTimeoutMs()),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`deepseek failed: ${res.status} ${text.slice(0, 400)}`);
  const parsed = JSON.parse(text) as {
    choices?: { message?: { content?: unknown } }[];
  };
  const content = parsed.choices?.[0]?.message?.content;
  if (typeof content !== "string" || content.trim() === "") throw new Error("deepseek returned no content");
  return content;
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
