import { describe, expect, it } from "vitest";
// @ts-expect-error plain JS module without types
import worker from "../src/worker.js";

const post = (path: string, method: string, params: object = {}) =>
  new Request(`https://example.test${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });

describe("worker", () => {
  it.each([
    ["/creators", ["search_stories_to_tell", "get_story", "list_causes"]],
    ["/brands", ["find_campaign_stories", "get_campaign_story", "list_causes"]],
  ])("lists the %s tools", async (path, names) => {
    const res = await worker.fetch(post(path, "tools/list"), {});
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    const body = await res.json();
    expect(body.result.tools.map((t: { name: string }) => t.name)).toEqual(names);
  });

  it("answers initialize with the audience's server name", async () => {
    const res = await worker.fetch(
      post("/brands", "initialize", {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "test", version: "1" },
      }),
      {},
    );
    const body = await res.json();
    expect(body.result.serverInfo.name).toBe("storra-brands");
  });

  it("refuses a request over the rate limit", async () => {
    const env = { MCP_LIMITER: { limit: async () => ({ success: false }) } };
    const res = await worker.fetch(post("/creators", "tools/list"), env);
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("60");
  });

  it("records a rate-limited call with its listing tag, like every other call", async () => {
    const points: { blobs: string[] }[] = [];
    const env = {
      MCP_LIMITER: { limit: async () => ({ success: false }) },
      MCP_ANALYTICS: { writeDataPoint: (p: { blobs: string[] }) => points.push(p) },
    };
    await worker.fetch(post("/creators?src=glama", "tools/list"), env);
    expect(points).toHaveLength(1);
    expect(points[0].blobs).toEqual(["rate_limited", "", "", "rate_limited", "glama"]);
  });

  it("404s any other path", async () => {
    const res = await worker.fetch(post("/other", "tools/list"), {});
    expect(res.status).toBe(404);
  });
});
