import { afterEach, describe, expect, it, vi } from "vitest";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
// @ts-expect-error plain JS module without types
import { serveAnonymous } from "../src/server.js";

const ORIGIN = "https://example.test";

// Routes the client's requests (and PostHog's, when asked) to the server under test, with no socket.
function patchFetch(options: object, captured: { event: string; properties: Record<string, unknown> }[] = []) {
  const real = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(input as RequestInfo, init);
    if (req.url.startsWith("https://posthog.test")) {
      const body = req.body ?? new ReadableStream();
      const stream =
        req.headers.get("content-encoding") === "gzip"
          ? body.pipeThrough(new DecompressionStream("gzip") as unknown as TransformStream<Uint8Array, Uint8Array>)
          : body;
      const text = await new Response(stream).text();
      captured.push(...(JSON.parse(text).batch ?? []));
      return Response.json({ status: 1 });
    }
    if (req.url.startsWith(ORIGIN)) {
      const audience = new URL(req.url).pathname.slice(1);
      return serveAnonymous(req, {}, audience, options);
    }
    return real(input as RequestInfo, init);
  }) as typeof fetch;
  return () => (globalThis.fetch = real);
}

afterEach(() => vi.restoreAllMocks());

describe("protocol revisions", () => {
  it.each([["2026-07-28"], ["legacy"]])("serves the %s revision", async (era) => {
    const restore = patchFetch({});
    try {
      const client = new Client(
        { name: "test", version: "1" },
        era === "legacy" ? {} : { versionNegotiation: { mode: { pin: "2026-07-28" } } },
      );
      await client.connect(new StreamableHTTPClientTransport(new URL(`${ORIGIN}/brands`)));
      expect(client.getServerVersion()?.name).toBe("storra-brands");
      const { tools } = await client.listTools();
      expect(tools.map((t) => t.name)).toEqual(["find_campaign_stories", "get_campaign_story", "list_causes"]);
      await client.close();
    } finally {
      restore();
    }
  });
});

describe("request bodies", () => {
  const send = (body: string) =>
    serveAnonymous(
      new Request(`${ORIGIN}/creators`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
        body,
      }),
      {},
      "creators",
    );

  it("answers malformed JSON with a JSON parse error", async () => {
    const res = await send("{bad");
    expect(res.status).toBe(400);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect((await res.json()).error.code).toBe(-32700);
  });

  it("refuses a body over 4 MiB before parsing it", async () => {
    const res = await send(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: { pad: "x".repeat(5 * 1024 * 1024) } }));
    expect(res.status).toBe(413);
  });
});

describe("PostHog MCP Analytics", () => {
  it("sends nothing without a posthog option", async () => {
    const captured: { event: string }[] = [];
    const restore = patchFetch({}, captured as never);
    try {
      const client = new Client({ name: "test", version: "1" });
      await client.connect(new StreamableHTTPClientTransport(new URL(`${ORIGIN}/creators`)));
      await client.listTools();
      await client.close();
      await new Promise((r) => setTimeout(r, 50));
      expect(captured).toEqual([]);
    } finally {
      restore();
    }
  });

  it.each([["legacy"], ["2026-07-28"]])("on the %s revision, sends no argument value", async (era) => {
    const captured: { event: string; properties: Record<string, unknown> }[] = [];
    const pending: Promise<unknown>[] = [];
    const options = {
      posthog: { apiKey: "phc_test", host: "https://posthog.test" },
      ctx: { waitUntil: (p: Promise<unknown>) => pending.push(p) },
    };
    const restore = patchFetch(options, captured);
    try {
      const client = new Client(
        { name: "test-client", version: "1" },
        era === "legacy" ? {} : { versionNegotiation: { mode: { pin: "2026-07-28" } } },
      );
      await client.connect(new StreamableHTTPClientTransport(new URL(`${ORIGIN}/brands`)));
      await client.callTool({ name: "get_campaign_story", arguments: { slug: "zz-sentinel-term-qq" } });
      await client.close();
      await Promise.all(pending);
    } finally {
      restore();
    }
    expect(captured.some((e) => e.event === "$mcp_tool_call")).toBe(true);
    expect(JSON.stringify(captured)).not.toContain("zz-sentinel-term-qq");
  });

  it("sends redacted, anonymous events tagged with the audience and ?src=", async () => {
    const captured: { event: string; distinct_id?: string; properties: Record<string, unknown> }[] = [];
    const pending: Promise<unknown>[] = [];
    const options = {
      posthog: { apiKey: "phc_test", host: "https://posthog.test" },
      ctx: { waitUntil: (p: Promise<unknown>) => pending.push(p) },
    };
    const restore = patchFetch(options, captured);
    try {
      const client = new Client({ name: "test-client", version: "1" });
      await client.connect(new StreamableHTTPClientTransport(new URL(`${ORIGIN}/creators?src=glama`)));
      const { tools } = await client.listTools();
      // Schemas untouched: no injected context / llm_model / conversation_id.
      const search = tools.find((t) => t.name === "search_stories_to_tell");
      expect(Object.keys(search?.inputSchema.properties ?? {})).not.toContain("context");
      expect(Object.keys(search?.inputSchema.properties ?? {})).not.toContain("conversation_id");
      await client.callTool({ name: "get_story", arguments: {} });
      await client.close();
      await Promise.all(pending);
    } finally {
      restore();
    }
    const call = captured.find((e) => e.event === "$mcp_tool_call");
    expect(call?.properties.$mcp_tool_name).toBe("get_story");
    expect(call?.properties.storra_audience).toBe("creators");
    expect(call?.properties.storra_src).toBe("glama");
    for (const e of captured) {
      expect(e.properties.$mcp_parameters).toBeUndefined();
      expect(e.properties.$mcp_response).toBeUndefined();
      expect(e.properties.$mcp_error_message).toBeUndefined();
    }
  });
});
