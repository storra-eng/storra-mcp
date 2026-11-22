import { feedUrl, type McpAudience } from "./audiences";
import type { StoryFeed } from "./tools";

/**
 * Reads `story-feed/{audience}.json` for the anonymous MCP servers. No database is involved.
 *
 * Freshness: a good copy is served for FRESH_SECONDS. Storra deletes the export when it cannot rebuild it, so that
 * it never serves a story that has left the feed; a missing export (404, or the 400 the storage origin answers for a missing
 * object, or any other non-5xx error status) therefore means "no safe copy" and is an error here, and it also drops every
 * stored copy. Only a network error or a 5xx falls back to the last good copy, and only for
 * STALE_SECONDS, with its age reported to the caller.
 */
// The CDN edge holds the export for up to 60 s more, so a rewrite or deletion reaches a tool answer within about 90 s.
export const FRESH_SECONDS = 30;
export const STALE_SECONDS = 60 * 60;
export const FEED_VERSION = 1;

export type CacheStatus = "hit" | "miss" | "stale";

export class FeedUnavailableError extends Error {
  constructor(
    readonly audience: McpAudience,
    detail: string,
    origin?: string,
  ) {
    super(
      `The ${audience} story feed is unavailable right now (${detail}). Its source is ${feedUrl(audience, origin)}.`,
    );
  }
}

/** The slice of the Workers Cache API this module uses, so tests can fake it. */
export interface FeedCache {
  match(key: string): Promise<Response | undefined>;
  put(key: string, response: Response): Promise<void>;
  delete(key: string): Promise<boolean>;
}

export interface FeedDeps {
  fetch: typeof fetch;
  cache: FeedCache;
  now(): number;
  /** Per-isolate parsed copies, so a hot isolate does not re-parse a megabyte on every call. */
  memo: Map<McpAudience, { at: number; feed: StoryFeed }>;
  /** Where the exports are served from; only a local run points it elsewhere. */
  origin?: string;
}

export interface LoadedFeed {
  feed: StoryFeed;
  cacheStatus: CacheStatus;
  /** Seconds since the copy was fetched from the CDN; 0 for a fresh fetch. */
  ageSeconds: number;
}

const freshKey = (d: FeedDeps, a: McpAudience) =>
  `${feedUrl(a, d.origin)}?copy=fresh`;
const lastGoodKey = (d: FeedDeps, a: McpAudience) =>
  `${feedUrl(a, d.origin)}?copy=last-good`;

function parseFeed(
  audience: McpAudience,
  text: string,
  origin?: string,
): StoryFeed {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new FeedUnavailableError(
      audience,
      "the export is not valid JSON",
      origin,
    );
  }
  const feed = parsed as Partial<StoryFeed> | null;
  if (
    !feed ||
    feed.version !== FEED_VERSION ||
    feed.audience !== audience ||
    !Array.isArray(feed.stories)
  )
    throw new FeedUnavailableError(
      audience,
      "the export has an unexpected shape",
      origin,
    );
  return feed as StoryFeed;
}

function stored(text: string, at: number, maxAge: number): Response {
  return new Response(text, {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": `max-age=${maxAge}`,
      "X-Stored-At": String(at),
    },
  });
}

async function fromCache(
  deps: FeedDeps,
  audience: McpAudience,
  key: string,
): Promise<{ feed: StoryFeed; at: number } | null> {
  const hit = await deps.cache.match(key);
  if (!hit) return null;
  const at = Number(hit.headers.get("X-Stored-At"));
  try {
    return {
      feed: parseFeed(audience, await hit.text(), deps.origin),
      at: Number.isFinite(at) ? at : 0,
    };
  } catch {
    return null;
  }
}

export async function loadFeed(
  deps: FeedDeps,
  audience: McpAudience,
): Promise<LoadedFeed> {
  const now = deps.now();
  const memo = deps.memo.get(audience);
  if (memo && now - memo.at < FRESH_SECONDS * 1000)
    return {
      feed: memo.feed,
      cacheStatus: "hit",
      ageSeconds: Math.round((now - memo.at) / 1000),
    };

  const fresh = await fromCache(deps, audience, freshKey(deps, audience));
  if (fresh && now - fresh.at < FRESH_SECONDS * 1000) {
    deps.memo.set(audience, { at: fresh.at, feed: fresh.feed });
    return {
      feed: fresh.feed,
      cacheStatus: "hit",
      ageSeconds: Math.round((now - fresh.at) / 1000),
    };
  }

  let res: Response | null = null;
  let failure = "";
  try {
    res = await deps.fetch(feedUrl(audience, deps.origin), {
      headers: { Accept: "application/json" },
    });
  } catch (e) {
    failure = `network error: ${e instanceof Error ? e.message : String(e)}`;
  }

  if (res && res.ok) {
    const text = await res.text();
    const feed = parseFeed(audience, text, deps.origin);
    await Promise.all([
      deps.cache.put(
        freshKey(deps, audience),
        stored(text, now, FRESH_SECONDS),
      ),
      deps.cache.put(
        lastGoodKey(deps, audience),
        stored(text, now, STALE_SECONDS),
      ),
    ]);
    deps.memo.set(audience, { at: now, feed });
    return { feed, cacheStatus: "miss", ageSeconds: 0 };
  }

  if (res && res.status < 500) {
    // Any other non-ok status below 500 means no safe copy, not just 404: the storage origin answers a missing public object
    // with 400, and the CDN passes that through. Never serve an old copy, and forget the stored ones.
    deps.memo.delete(audience);
    await Promise.all([
      deps.cache.delete(freshKey(deps, audience)),
      deps.cache.delete(lastGoodKey(deps, audience)),
    ]);
    throw new FeedUnavailableError(
      audience,
      res.status === 404 || res.status === 400
        ? "the export has not been written"
        : `HTTP ${res.status}`,
      deps.origin,
    );
  }

  if (res) failure = `HTTP ${res.status}`;
  const last = await fromCache(deps, audience, lastGoodKey(deps, audience));
  if (last && now - last.at < STALE_SECONDS * 1000)
    return {
      feed: last.feed,
      cacheStatus: "stale",
      ageSeconds: Math.round((now - last.at) / 1000),
    };
  throw new FeedUnavailableError(audience, failure, deps.origin);
}
