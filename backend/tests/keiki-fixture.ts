export const KEIKI_SECRET = "test-keiki-secret";
export const MOCK_LINE = "+15551234567";

type Fetchable = { fetch: (path: string, init?: RequestInit) => Promise<Response> };

export async function keikiTool(
  backend: Fetchable,
  path: string,
  body: Record<string, unknown>,
): Promise<Response> {
  return await backend.fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json", "x-keiki-secret": KEIKI_SECRET },
    body: JSON.stringify(body),
  });
}
