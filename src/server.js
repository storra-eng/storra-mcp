/**
 * The anonymous Storra story servers: "Storra for Creators" and "Storra for Brands", served at
 * https://mcp.getstorra.com/creators and /brands.
 *
 * They answer from the public story export on cdn.getstorra.com, so they need no sign-in and no database: every story
 * they return is already public on getstorra.com. Stateless streamable HTTP: a fresh Server and transport per
 * request, JSON responses, no sessions, so nothing is held between requests and any isolate can answer any call.
 *
 * `serveAnonymous` is the entry point a Worker calls once it has picked the audience from the URL.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { CfWorkerJsonSchemaValidator } from "@modelcontextprotocol/sdk/validation/cfworker";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import {
  MCP_AUDIENCE_CONFIG,
  MCP_SERVER_VERSION,
} from "./audiences.ts";
import {
  FeedUnavailableError,
  loadFeed,
} from "./feed.ts";
import { runTool, toolDefinitions, validateCall } from "./tools.ts";
import { srcTag } from "./srcTag.ts";

// Per-isolate parsed copies (see FeedDeps.memo).
const memo = new Map();

/** The Cache API entry the feed is kept in: one per colo, shared by every isolate in it. */
const feedCache = {
  async match(key) {
    return caches.default.match(new Request(key));
  },
  async put(key, response) {
    await caches.default.put(new Request(key), response);
  },
  async delete(key) {
    return caches.default.delete(new Request(key));
  },
};

function record(env, audience, fields) {
  // One JSON line per call into Workers Logs, always; Analytics Engine too once the binding exists.
  console.log(JSON.stringify({ evt: "mcp_call", audience, ...fields }));
  // Analytics Engine is the queryable record of tool use (the repo's observability rule). A write never throws on a
  // missing binding in dev, and must never fail the call.
  try {
    env.MCP_ANALYTICS?.writeDataPoint({
      indexes: [audience],
      blobs: [
        fields.kind,
        fields.tool ?? "",
        fields.cache ?? "",
        fields.outcome,
        fields.src ?? "",
      ],
      // double1 result count, double2 total ms, double3 copy age s, double4 feed load ms (cache or CDN), double5 search ms
      doubles: [
        fields.resultCount ?? 0,
        fields.durationMs ?? 0,
        fields.ageSeconds ?? 0,
        fields.feedMs ?? 0,
        fields.searchMs ?? 0,
      ],
    });
  } catch {
    // Observability must not break a request.
  }
}

function buildServer(env, audience, src) {
  const config = MCP_AUDIENCE_CONFIG[audience];
  const server = new Server(
    { name: config.name, title: config.title, version: MCP_SERVER_VERSION },
    {
      capabilities: { tools: {} },
      instructions: config.instructions,
      jsonSchemaValidator: new CfWorkerJsonSchemaValidator(),
    },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    record(env, audience, { kind: "tools/list", outcome: "ok", src });
    return { tools: toolDefinitions(audience) };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const started = Date.now();
    const { name, arguments: args } = request.params;
    const invalid = validateCall(audience, name, args);
    if (invalid) {
      record(env, audience, { kind: "tools/call", tool: name, outcome: "invalid", src, durationMs: Date.now() - started });
      return { isError: true, content: [{ type: "text", text: invalid }] };
    }
    let loaded;
    const feedStarted = Date.now();
    try {
      loaded = await loadFeed(
        { fetch: (...a) => fetch(...a), cache: feedCache, now: Date.now, memo, origin: env.FEED_CDN_ORIGIN || undefined },
        audience,
      );
    } catch (e) {
      const message =
        e instanceof FeedUnavailableError
          ? e.message
          : `The ${audience} story feed could not be read.`;
      record(env, audience, {
        kind: "tools/call",
        tool: name,
        src,
        outcome: "feed_unavailable",
        feedMs: Date.now() - feedStarted,
        durationMs: Date.now() - started,
      });
      return { isError: true, content: [{ type: "text", text: message }] };
    }
    const feedMs = Date.now() - feedStarted;
    const searchStarted = Date.now();
    const outcome = runTool(audience, name, args, loaded.feed);
    record(env, audience, {
      kind: "tools/call",
      tool: name,
      src,
      cache: loaded.cacheStatus,
      outcome: outcome.ok ? "ok" : "tool_error",
      resultCount: outcome.ok ? outcome.resultCount : 0,
      ageSeconds: loaded.ageSeconds,
      feedMs,
      searchMs: Date.now() - searchStarted,
      durationMs: Date.now() - started,
    });
    if (!outcome.ok)
      return { isError: true, content: [{ type: "text", text: outcome.message }] };
    return { content: [{ type: "text", text: JSON.stringify(outcome.result) }] };
  });

  return server;
}

function jsonRpcError(status, code, message, headers) {
  return new Response(
    JSON.stringify({ jsonrpc: "2.0", error: { code, message }, id: null }),
    { status, headers: { "Content-Type": "application/json", ...headers } },
  );
}

/**
 * Answers one MCP request for `audience`. `request` is already past routing and rate limiting.
 */
export async function handleAnonymousMcp(request, env, audience, cors) {
  if (request.method !== "POST") {
    // No standalone SSE stream and no session to delete: this server is stateless.
    return jsonRpcError(405, -32000, "Method not allowed: POST JSON-RPC requests to this URL.", {
      Allow: "POST, OPTIONS",
      ...cors,
    });
  }

  const server = buildServer(env, audience, srcTag(request.url));
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  const response = await transport.handleRequest(request);
  const out = new Response(response.body, response);
  out.headers.set("Cache-Control", "no-store");
  for (const [name, value] of Object.entries(cors)) out.headers.set(name, value);
  return out;
}

export const RATE_LIMIT_PER_MINUTE = 60;

/** CORS for browser-based MCP clients. */
export function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    // `last-event-id` is how a browser client resumes a broken streamable-HTTP SSE stream, and it is not on the CORS
    // safelist, so omitting it fails the preflight.
    "Access-Control-Allow-Headers":
      "authorization, content-type, mcp-session-id, mcp-protocol-version, accept, last-event-id",
    "Access-Control-Expose-Headers": "WWW-Authenticate, Mcp-Session-Id, Mcp-Protocol-Version",
    "Access-Control-Max-Age": "86400",
  };
}

/**
 * Rate limits by client IP, then answers. `env.MCP_LIMITER` is an optional Workers Rate Limiting binding
 * (60 requests a minute in production); without it, nothing is limited. An in-memory counter would be per isolate
 * and limit nothing.
 */
export async function serveAnonymous(request, env, audience) {
  if (env.MCP_LIMITER) {
    const key = request.headers.get("cf-connecting-ip") || "unknown";
    const { success } = await env.MCP_LIMITER.limit({ key });
    if (!success) {
      try {
        env.MCP_ANALYTICS?.writeDataPoint({
          indexes: [audience],
          blobs: ["rate_limited", "", "", "rate_limited"],
          doubles: [0, 0, 0],
        });
      } catch {
        // Observability must not break a request.
      }
      return jsonRpcError(429, -32000, `Rate limit exceeded: ${RATE_LIMIT_PER_MINUTE} requests a minute.`, {
        "Retry-After": "60",
        ...corsHeaders(),
      });
    }
  }
  return handleAnonymousMcp(request, env, audience, corsHeaders());
}
