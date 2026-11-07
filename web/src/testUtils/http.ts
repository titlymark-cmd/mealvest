/** Tiny helpers for tests that drive the real API clients through a fake fetch. */
export type FakeRoute = (init?: RequestInit) => { status?: number; body?: unknown } | Promise<{ status?: number; body?: unknown }>;

export function fakeResponse(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response;
}

/** Builds an authFetch/fetch stand-in from a "METHOD /path" → handler table; unmatched calls fail loudly. */
export function makeFetch(routes: Record<string, FakeRoute>) {
  const calls: Array<{ key: string; init?: RequestInit }> = [];
  const fn = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input).replace(/^https?:\/\/[^/]+/, "");
    const key = `${(init?.method ?? "GET").toUpperCase()} ${url.split("?")[0]}`;
    calls.push({ key, init });
    const handler = routes[key];
    if (!handler) throw new Error(`Unexpected request: ${key}`);
    const r = await handler(init);
    return fakeResponse(r.status ?? 200, r.body ?? {});
  });
  return Object.assign(fn, { calls, count: (key: string) => calls.filter((c) => c.key === key).length });
}
