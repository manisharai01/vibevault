// Fake HTTP plumbing for backend tests: a minimal Response and a recording fetch.

export function fakeResponse(status: number, body: unknown): Response {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => text,
    json: async () => JSON.parse(text),
  } as unknown as Response;
}

export interface RecordedCall {
  url: string;
  init?: RequestInit;
  /** Request headers as a plain object (whatever shape the caller passed). */
  headers: Record<string, string>;
}

/**
 * A fetch that records every call and answers with `route(url, init)`.
 * `route` returns [status, body] or a Response.
 */
export function recordingFetch(route: (url: string, init?: RequestInit) => [number, unknown] | Response | Promise<[number, unknown] | Response>) {
  const calls: RecordedCall[] = [];
  const fetch = async (url: string, init?: RequestInit): Promise<Response> => {
    const raw = init?.headers;
    const headers: Record<string, string> =
      raw instanceof Headers ? Object.fromEntries(raw.entries()) : Array.isArray(raw) ? Object.fromEntries(raw) : { ...(raw as Record<string, string> | undefined) };
    calls.push({ url, init, headers });
    const answer = await route(url, init);
    return Array.isArray(answer) ? fakeResponse(answer[0], answer[1]) : answer;
  };
  return { fetch, calls };
}
