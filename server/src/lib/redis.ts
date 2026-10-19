/**
 * Minimal Upstash Redis REST client (finding H5).
 *
 * Why REST + fetch instead of a TCP Redis client: Vercel functions are
 * short-lived and scale horizontally; Upstash's HTTPS API needs no
 * persistent connection, works from any instance, and fits the free
 * tier. Node 18+ ships `fetch`, so no new dependency is required.
 *
 * Configuration (server-side only, never sent to the browser):
 *   UPSTASH_REDIS_REST_URL    e.g. https://<id>.upstash.io
 *   UPSTASH_REDIS_REST_TOKEN  the REST token (secret)
 *
 * Nothing here logs keys, values or the token.
 */

export type RedisCommand = (string | number)[];

export interface RedisPipelineClient {
  /** Executes commands atomically-in-order (Upstash pipeline) and returns each command's result. */
  pipeline(commands: RedisCommand[]): Promise<unknown[]>;
}

const REQUEST_TIMEOUT_MS = 2_000;

class UpstashRestClient implements RedisPipelineClient {
  constructor(private readonly url: string, private readonly token: string) {}

  async pipeline(commands: RedisCommand[]): Promise<unknown[]> {
    const res = await fetch(`${this.url.replace(/\/+$/, "")}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(commands.map((c) => c.map(String))),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) {
      throw new Error(`Upstash pipeline failed with HTTP ${res.status}`);
    }
    const body = (await res.json()) as Array<{ result?: unknown; error?: string }>;
    if (!Array.isArray(body)) throw new Error("Upstash pipeline returned an unexpected body");
    return body.map((entry) => {
      if (entry?.error) throw new Error(`Upstash command error: ${entry.error}`);
      return entry?.result;
    });
  }
}

let override: RedisPipelineClient | null | undefined;
let cached: RedisPipelineClient | null | undefined;

export function isRedisConfigured(): boolean {
  if (override !== undefined) return override !== null;
  return Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

/** The shared client, or null when Redis is not configured. */
export function getRedis(): RedisPipelineClient | null {
  if (override !== undefined) return override;
  if (cached !== undefined) return cached;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  cached = url && token ? new UpstashRestClient(url, token) : null;
  return cached;
}

/** Test hook: inject a fake client (or null to simulate "not configured"); undefined restores env-based behaviour. */
export function setRedisClientForTests(client: RedisPipelineClient | null | undefined): void {
  override = client;
}
