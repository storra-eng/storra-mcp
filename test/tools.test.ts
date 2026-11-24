import { describe, expect, it } from "vitest";
import {
  MCP_AUDIENCES,
  MCP_AUDIENCE_CONFIG,
  feedUrl,
  storyUrl,
} from "../src/audiences";
import {
  FRESH_SECONDS,
  STALE_SECONDS,
  FeedUnavailableError,
  loadFeed,
  type FeedCache,
  type FeedDeps,
} from "../src/feed";
import {
  MAX_LIMIT,
  runTool,
  toolDefinitions,
  validateCall,
  type StoryFeed,
} from "../src/tools";

function feedFor(audience: "creators" | "brands"): StoryFeed {
  return {
    version: 1,
    audience,
    generated_at: "2026-10-19T08:00:00Z",
    count: 3,
    stories: [
      {
        slug: "food-bank",
        id: "1",
        rank: 1,
        card_title: "A food bank in Manchester",
        one_liner: "Feeds 200 families a week",
        cause: "Poverty",
        category: "Community",
        location: "Manchester",
        charity_name: "Northside Food Bank",
        full_story: "A long story about coffee.",
        lat: 53.4,
      },
      {
        slug: "dog-rescue",
        rank: 2,
        card_title: "Dog rescue in Leeds",
        one_liner: "Rehoming strays",
        cause: "Animals",
        category: "Animals",
        secondary_categories: ["Pets"],
        location: "Leeds",
        charity_name: "Leeds Strays",
      },
      {
        slug: "kids-choir",
        rank: 3,
        card_title: "A children's choir",
        one_liner: "Music for kids in care",
        cause: "Children",
        category: "Arts",
        location: "London",
        charity_name: "Choir Kids",
      },
    ],
  };
}

describe("tool definitions", () => {
  it("gives each audience its own search and get tool, plus list_causes", () => {
    expect(toolDefinitions("creators").map((t) => t.name)).toEqual([
      "search_stories_to_tell",
      "get_story",
      "list_causes",
    ]);
    expect(toolDefinitions("brands").map((t) => t.name)).toEqual([
      "find_campaign_stories",
      "get_campaign_story",
      "list_causes",
    ]);
  });

  it("marks every tool read-only with a title", () => {
    for (const audience of MCP_AUDIENCES)
      for (const tool of toolDefinitions(audience)) {
        expect(tool.title).toBeTruthy();
        expect(tool.annotations.readOnlyHint).toBe(true);
        expect(tool.annotations.title).toBe(tool.title);
      }
  });

  it("never exposes a model-costing ranking tool", () => {
    for (const audience of MCP_AUDIENCES)
      expect(
        toolDefinitions(audience).some((t) =>
          /rank|match|recommend/.test(t.name),
        ),
      ).toBe(false);
  });

  it("only the brand search offers no category filter (brands filter by cause and place)", () => {
    const props = (a: "creators" | "brands") =>
      Object.keys(toolDefinitions(a)[0].inputSchema.properties);
    expect(props("creators")).toContain("category");
    expect(props("brands")).not.toContain("category");
  });
});

describe("URLs", () => {
  it("point each audience at its own story path", () => {
    expect(storyUrl("creators", "a b")).toBe(
      "https://getstorra.com/creators/story-listings/a%20b?utm_source=storra-mcp&utm_medium=creators&utm_campaign=story",
    );
    expect(storyUrl("brands", "x")).toBe(
      "https://getstorra.com/brands/story-listings/x?utm_source=storra-mcp&utm_medium=brands&utm_campaign=story",
    );
    expect(feedUrl("brands")).toBe(
      "https://cdn.getstorra.com/story-feed/brands.json",
    );
  });
});

describe("runTool", () => {
  it("searches by words, ranking title hits first, with audience URLs", () => {
    const out = runTool(
      "creators",
      "search_stories_to_tell",
      { query: "manchester" },
      feedFor("creators"),
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const r = out.result as { stories: { slug: string; url: string }[] };
    expect(r.stories.map((s) => s.slug)).toEqual(["food-bank"]);
    expect(r.stories[0].url).toBe(
      "https://getstorra.com/creators/story-listings/food-bank?utm_source=storra-mcp&utm_medium=creators&utm_campaign=story",
    );
    expect(out.resultCount).toBe(1);
  });

  it("browses in feed order with no query, and honours the limit", () => {
    const out = runTool(
      "brands",
      "find_campaign_stories",
      { limit: 2 },
      feedFor("brands"),
    );
    expect(
      out.ok &&
        (out.result as { stories: { slug: string }[] }).stories.map(
          (s) => s.slug,
        ),
    ).toEqual(["food-bank", "dog-rescue"]);
    expect(
      out.ok && (out.result as { total_matches: number }).total_matches,
    ).toBe(3);
  });

  it("says so when a query has no searchable words, instead of passing a browse off as a match", () => {
    const out = runTool(
      "creators",
      "search_stories_to_tell",
      { query: "the a" },
      feedFor("creators"),
    );
    expect(out.ok && (out.result as { note?: string }).note).toMatch(
      /no searchable words/,
    );
    const plain = runTool(
      "creators",
      "search_stories_to_tell",
      {},
      feedFor("creators"),
    );
    expect(
      plain.ok && (plain.result as { note?: string }).note,
    ).toBeUndefined();
  });

  it("filters by cause, location and category", () => {
    const f = feedFor("creators");
    const slugs = (args: Record<string, unknown>) => {
      const out = runTool("creators", "search_stories_to_tell", args, f);
      return out.ok
        ? (out.result as { stories: { slug: string }[] }).stories.map(
            (s) => s.slug,
          )
        : [];
    };
    expect(slugs({ cause: "animals" })).toEqual(["dog-rescue"]);
    expect(slugs({ location: "lond" })).toEqual(["kids-choir"]);
    expect(slugs({ category: "pets" })).toEqual(["dog-rescue"]);
    expect(slugs({ cause: "animals", location: "manchester" })).toEqual([]);
  });

  it("gets a story in full, dropping presentation columns", () => {
    const out = runTool(
      "creators",
      "get_story",
      { slug: "food-bank" },
      feedFor("creators"),
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const r = out.result as Record<string, unknown>;
    expect(r.full_story).toBe("A long story about coffee.");
    expect(r.url).toBe(
      "https://getstorra.com/creators/story-listings/food-bank?utm_source=storra-mcp&utm_medium=creators&utm_campaign=story",
    );
    expect(r).not.toHaveProperty("lat");
    expect(r).not.toHaveProperty("id");
  });

  it("says so when a story is gone", () => {
    const out = runTool(
      "brands",
      "get_campaign_story",
      { slug: "nope" },
      feedFor("brands"),
    );
    expect(out).toMatchObject({ ok: false });
  });

  it("counts causes", () => {
    const out = runTool("brands", "list_causes", {}, feedFor("brands"));
    expect(out.ok && (out.result as { causes: unknown[] }).causes).toEqual([
      { cause: "Animals", stories: 1 },
      { cause: "Children", stories: 1 },
      { cause: "Poverty", stories: 1 },
    ]);
  });

  describe("country", () => {
    const withUs = () => {
      const feed = feedFor("creators");
      feed.stories.push({
        slug: "us-shelter",
        card_title: "A shelter in Austin",
        cause: "Animals",
        location: "Austin",
        country: "US",
      });
      return feed;
    };
    const search = (args: Record<string, unknown>) => {
      const out = runTool("creators", "search_stories_to_tell", args, withUs());
      if (!out.ok) throw new Error(out.message);
      return (out.result as { stories: { slug: string; country: string }[] })
        .stories;
    };

    it("returns every country by default, each labelled; missing means GB", () => {
      const stories = search({});
      expect(stories.map((s) => [s.slug, s.country])).toEqual([
        ["food-bank", "GB"],
        ["dog-rescue", "GB"],
        ["kids-choir", "GB"],
        ["us-shelter", "US"],
      ]);
    });

    it("filters to US", () => {
      expect(search({ country: "US" }).map((s) => s.slug)).toEqual([
        "us-shelter",
      ]);
    });

    it("treats UK and GB alike, and excludes US", () => {
      const uk = search({ country: "UK" }).map((s) => s.slug);
      expect(uk).toEqual(search({ country: "GB" }).map((s) => s.slug));
      expect(uk).not.toContain("us-shelter");
      expect(uk).toHaveLength(3);
    });

    it("returns zero US stories when the feed has none", () => {
      const out = runTool(
        "brands",
        "find_campaign_stories",
        { country: "US" },
        feedFor("brands"),
      );
      expect(out.ok && (out.result as { stories: unknown[] }).stories).toEqual(
        [],
      );
    });

    it("scopes list_causes counts", () => {
      const causes = (country?: string) => {
        const out = runTool(
          "creators",
          "list_causes",
          country ? { country } : {},
          withUs(),
        );
        return out.ok && (out.result as { causes: unknown[] }).causes;
      };
      expect(causes("US")).toEqual([{ cause: "Animals", stories: 1 }]);
      expect(causes("UK")).toHaveLength(3);
      expect(causes()).toContainEqual({ cause: "Animals", stories: 2 });
    });

    it("get resolves a US story by slug and labels it", () => {
      const out = runTool(
        "creators",
        "get_story",
        { slug: "us-shelter" },
        withUs(),
      );
      expect(out.ok && out.result).toMatchObject({ country: "US" });
      const gb = runTool(
        "creators",
        "get_story",
        { slug: "food-bank" },
        withUs(),
      );
      expect(gb.ok && gb.result).toMatchObject({ country: "GB" });
    });

    it("normalises aliases and case, and keeps other countries out of UK and US", () => {
      const feed = withUs();
      feed.stories.push(
        { slug: "a", card_title: "A", country: " usa " },
        { slug: "b", card_title: "B", country: "IE" },
      );
      const slugs = (country: string) => {
        const out = runTool(
          "creators",
          "search_stories_to_tell",
          { country },
          feed,
        );
        return out.ok
          ? (out.result as { stories: { slug: string }[] }).stories.map(
              (s) => s.slug,
            )
          : [];
      };
      expect(slugs("us")).toEqual(["us-shelter", "a"]);
      expect(slugs("uk")).toHaveLength(3);
      expect(slugs("uk")).not.toContain("b");
    });

    it("rejects an unknown country", () => {
      expect(
        validateCall("creators", "search_stories_to_tell", { country: "FR" }),
      ).toMatch(/one of UK, GB, US/);
      expect(
        validateCall("brands", "list_causes", { country: "US" }),
      ).toBeNull();
    });
  });

  it("rejects bad calls before touching a feed", () => {
    expect(validateCall("brands", "search_stories_to_tell", {})).toMatch(
      /Unknown tool/,
    );
    expect(
      validateCall("creators", "search_stories_to_tell", {
        limit: MAX_LIMIT + 1,
      }),
    ).toMatch(/between/);
    expect(
      validateCall("creators", "search_stories_to_tell", { query: 5 }),
    ).toMatch(/string/);
    expect(
      validateCall("creators", "search_stories_to_tell", { nope: 1 }),
    ).toMatch(/Unknown argument/);
    expect(validateCall("creators", "get_story", {})).toMatch(/Missing/);
    expect(
      validateCall("creators", "search_stories_to_tell", {
        query: "x".repeat(201),
      }),
    ).toMatch(/too long/);
    expect(validateCall("creators", "list_causes", undefined)).toBeNull();
  });
});

describe("audience configs", () => {
  it("names distinct servers", () => {
    expect(MCP_AUDIENCE_CONFIG.creators.name).not.toBe(
      MCP_AUDIENCE_CONFIG.brands.name,
    );
  });
});

function fakeCache(): FeedCache & {
  store: Map<string, { text: string; at: string }>;
} {
  const store = new Map<string, { text: string; at: string }>();
  return {
    store,
    async match(key) {
      const hit = store.get(key);
      return hit
        ? new Response(hit.text, { headers: { "X-Stored-At": hit.at } })
        : undefined;
    },
    async put(key, response) {
      store.set(key, {
        text: await response.text(),
        at: response.headers.get("X-Stored-At") ?? "0",
      });
    },
    async delete(key) {
      return store.delete(key);
    },
  };
}

function depsWith(
  responses: (() => Response | Promise<Response>)[],
  clock: { t: number },
) {
  const cache = fakeCache();
  let calls = 0;
  const deps: FeedDeps = {
    fetch: (async () => {
      const next = responses[Math.min(calls, responses.length - 1)];
      calls++;
      return next();
    }) as typeof fetch,
    cache,
    now: () => clock.t,
    memo: new Map(),
  };
  return { deps, cache, calls: () => calls };
}

const ok = () => new Response(JSON.stringify(feedFor("creators")));

describe("loadFeed", () => {
  it("fetches once, then serves the fresh copy", async () => {
    const clock = { t: 1_000_000 };
    const { deps, calls } = depsWith([ok], clock);
    expect((await loadFeed(deps, "creators")).cacheStatus).toBe("miss");
    clock.t += (FRESH_SECONDS - 1) * 1000;
    expect((await loadFeed(deps, "creators")).cacheStatus).toBe("hit");
    expect(calls()).toBe(1);
    clock.t += 2000;
    expect((await loadFeed(deps, "creators")).cacheStatus).toBe("miss");
    expect(calls()).toBe(2);
  });

  it("serves the last good copy on a 5xx or a network error, within the stale window", async () => {
    const clock = { t: 1_000_000 };
    const { deps } = depsWith(
      [
        ok,
        () => new Response("boom", { status: 503 }),
        () => {
          throw new Error("offline");
        },
      ],
      clock,
    );
    await loadFeed(deps, "creators");
    clock.t += (FRESH_SECONDS + 5) * 1000;
    const stale = await loadFeed(deps, "creators");
    expect(stale.cacheStatus).toBe("stale");
    expect(stale.ageSeconds).toBe(FRESH_SECONDS + 5);
    deps.memo.clear();
    clock.t += 5000;
    expect((await loadFeed(deps, "creators")).cacheStatus).toBe("stale");
  });

  it("refuses a copy older than the stale window", async () => {
    const clock = { t: 1_000_000 };
    const { deps } = depsWith(
      [ok, () => new Response("boom", { status: 502 })],
      clock,
    );
    await loadFeed(deps, "creators");
    clock.t += (STALE_SECONDS + 1) * 1000;
    await expect(loadFeed(deps, "creators")).rejects.toBeInstanceOf(
      FeedUnavailableError,
    );
  });

  it("never serves an old copy after a 404, and forgets it", async () => {
    const clock = { t: 1_000_000 };
    const { deps, cache } = depsWith(
      [
        ok,
        () => new Response("", { status: 404 }),
        () => new Response("boom", { status: 500 }),
      ],
      clock,
    );
    await loadFeed(deps, "creators");
    clock.t += (FRESH_SECONDS + 1) * 1000;
    await expect(loadFeed(deps, "creators")).rejects.toThrow(
      /has not been written/,
    );
    expect(cache.store.size).toBe(0);
    clock.t += 1000;
    // The next failure finds no last-good copy to fall back on.
    await expect(loadFeed(deps, "creators")).rejects.toBeInstanceOf(
      FeedUnavailableError,
    );
  });

  it("treats the storage origin's 400 for a missing object, and any other 4xx, like a 404", async () => {
    for (const status of [400, 403, 410]) {
      const clock = { t: 1_000_000 };
      const { deps, cache } = depsWith(
        [ok, () => new Response("{}", { status }), ok],
        clock,
      );
      await loadFeed(deps, "creators");
      clock.t += (FRESH_SECONDS + 1) * 1000;
      await expect(loadFeed(deps, "creators")).rejects.toBeInstanceOf(
        FeedUnavailableError,
      );
      expect(cache.store.size).toBe(0);
    }
  });

  it("rejects an export for the other audience or version", async () => {
    const clock = { t: 1_000_000 };
    const wrong = () => new Response(JSON.stringify(feedFor("brands")));
    await expect(
      loadFeed(depsWith([wrong], clock).deps, "creators"),
    ).rejects.toThrow(/unexpected shape/);
    const v2 = () =>
      new Response(JSON.stringify({ ...feedFor("creators"), version: 2 }));
    await expect(
      loadFeed(depsWith([v2], clock).deps, "creators"),
    ).rejects.toThrow(/unexpected shape/);
  });
});
