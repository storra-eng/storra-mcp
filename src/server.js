/**
 * The anonymous Storra story servers: "Storra for Creators" and "Storra for Brands", served at
 * https://mcp.getstorra.com/creators and /brands.
 *
 * They answer from the public story export on cdn.getstorra.com, so they need no sign-in and no database: every story
 * they return is already public on getstorra.com. Stateless streamable HTTP: a fresh Server and transport per
 * request, JSON responses, no sessions, so nothing is held between requests and any isolate can answer any call.
 * Built on the official MCP SDK v2 (`@modelcontextprotocol/server`): both protocol revisions are served, the 2025
 * one (`initialize`) and 2026-07-28 (`server/discover`, no handshake).
 *
 * `serveAnonymous` is the entry point a Worker calls once it has picked the audience from the URL. Pass
 * `{ ctx, posthog: { apiKey, host } }` to also send each call to PostHog MCP Analytics; without `posthog`, nothing is
 * sent anywhere (the standalone worker in this repo passes none).
 */

import {
  createMcpHandler,
  DEFAULT_MAX_REQUEST_BODY_SIZE,
  isLegacyRequest,
  readRequestBody,
  Server,
  WebStandardStreamableHTTPServerTransport,
} from "@modelcontextprotocol/server";
import { instrument, PostHog } from "@posthog/mcp";

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
  // On Workers the SDK picks the @cfworker/json-schema validator itself (its `workerd` export): the default one
  // compiles with `new Function`, which Workers block.
  const server = new Server(
    { name: config.name, title: config.title, version: MCP_SERVER_VERSION },
    { capabilities: { tools: {} }, instructions: config.instructions },
  );

  server.setRequestHandler("tools/list", async () => {
    record(env, audience, { kind: "tools/list", outcome: "ok", src });
    return { tools: toolDefinitions(audience) };
  });

  server.setRequestHandler("tools/call", async (request) => {
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

// Only metadata leaves. Of the SDK's `$mcp_*` properties, only these are sent, so arguments, results, intent, error
// text and anything a later SDK release adds are dropped. Other keys (posthog-node's `$lib`, our `storra_*`) pass.
// The servers are anonymous, so events carry no identity and PostHog makes no person for them.
const MCP_PROPERTY_ALLOWLIST = new Set([
  "$mcp_client_name",
  "$mcp_client_version",
  "$mcp_client_user_agent",
  "$mcp_duration_ms",
  "$mcp_error_status",
  "$mcp_error_type",
  "$mcp_interface",
  "$mcp_is_error",
  "$mcp_input_keys",
  "$mcp_listed_tool_names",
  "$mcp_protocol_version",
  "$mcp_resource_name",
  "$mcp_server_build",
  "$mcp_server_name",
  "$mcp_server_version",
  "$mcp_session_source",
  "$mcp_source",
  "$mcp_tool_category",
  "$mcp_tool_description",
  "$mcp_tool_name",
  "$mcp_vendor_client",
]);

export function redactMcpEvent(event) {
  if (event.event === "$exception") return null;
  const properties = {};
  for (const [k, v] of Object.entries(event.properties ?? {})) {
    if (!k.startsWith("$mcp_") || MCP_PROPERTY_ALLOWLIST.has(k)) properties[k] = v;
  }
  return { ...event, properties };
}

// A client must keep a Worker alive for the flush, so analytics need `ctx.waitUntil`.
function analyticsFor(options) {
  const cfg = options?.posthog;
  if (!cfg?.apiKey || !cfg?.host || typeof options?.ctx?.waitUntil !== "function") return null;
  return new PostHog(cfg.apiKey, { host: cfg.host, flushAt: 20, flushInterval: 0 });
}

function instrumentServer(server, posthog, audience, src) {
  try {
    instrument(server, posthog, {
      // Tool schemas and results stay exactly as defined: nothing injected, nothing appended.
      context: false,
      captureModel: false,
      enableConversationId: false,
      enableExceptionAutocapture: false,
      eventProperties: () => ({ storra_audience: audience, storra_src: src || null }),
      beforeSend: redactMcpEvent,
    });
  } catch (e) {
    console.error("[mcp-analytics] instrument failed", e);
  }
}

// Flushes once the response body has been sent, since the SDK records a call when its result is written; and after
// 30 s regardless, for a client that drops the connection without the stream closing or cancelling.
function flushAfter(response, posthog, ctx) {
  if (!posthog) return response;
  let done;
  const closed = new Promise((r) => {
    done = r;
    setTimeout(r, 30_000);
  });
  const body = response.body
    ? response.body.pipeThrough(new TransformStream({ flush: () => done(), cancel: () => done() }))
    : (done(), null);
  const flush = closed
    .then(() => new Promise((r) => setTimeout(r, 0)))
    .then(() => posthog.shutdown())
    .catch((e) => console.error("[mcp-analytics] flush failed", e));
  ctx.waitUntil(flush);
  return new Response(body, response);
}

// With analytics on, @posthog/mcp puts a session token in the `initialize` reply's Mcp-Session-Id header and reads it
// back from later requests, so a 2025 client's calls group into one PostHog session. It is an analytics label, not a
// server session (nothing is held), and a client can forge it, so its client name is self-reported.

// One request's state, looked up by the server factory: the handler for the 2026-07-28 revision is built once per
// audience, and the SDK hands the factory the Request it was given.
const perRequest = new WeakMap();
const modernHandlers = new Map();

function modernHandler(audience) {
  let handler = modernHandlers.get(audience);
  if (!handler) {
    // No listChanged, so `subscriptions/listen` is refused rather than held open.
    handler = createMcpHandler((ctx) => perRequest.get(ctx.requestInfo)(), { responseMode: "json", maxSubscriptions: 0 });
    modernHandlers.set(audience, handler);
  }
  return handler;
}

/**
 * Answers one MCP request for `audience`. `request` is already past routing and rate limiting.
 */
export async function handleAnonymousMcp(request, env, audience, cors, options = {}) {
  if (request.method !== "POST") {
    // No standalone SSE stream and no session to delete: this server is stateless.
    return jsonRpcError(405, -32000, "Method not allowed: POST JSON-RPC requests to this URL.", {
      Allow: "POST, OPTIONS",
      ...cors,
    });
  }

  const read = await readRequestBody(request.clone(), DEFAULT_MAX_REQUEST_BODY_SIZE);
  if (read.tooLarge) {
    return jsonRpcError(413, -32600, "Request body too large.", cors);
  }
  let parsedBody;
  try {
    parsedBody = JSON.parse(read.text);
  } catch {
    parsedBody = undefined;
  }

  const src = srcTag(request.url);
  const posthog = analyticsFor(options);
  const factory = () => {
    const server = buildServer(env, audience, src);
    if (posthog) instrumentServer(server, posthog, audience, src);
    return server;
  };

  let response;
  // The SDK's own rule: an empty or unparseable body is 2025-era too, so its parse error comes back as JSON as well.
  if (await isLegacyRequest(request, parsedBody)) {
    // 2025-era traffic keeps the JSON responses it has always had (the SDK's own legacy leg streams SSE).
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    await factory().connect(transport);
    response = await transport.handleRequest(request, parsedBody === undefined ? {} : { parsedBody });
  } else {
    perRequest.set(request, factory);
    response = await modernHandler(audience).fetch(request, { parsedBody });
  }
  const out = new Response(response.body, response);
  out.headers.set("Cache-Control", "no-store");
  for (const [name, value] of Object.entries(cors)) out.headers.set(name, value);
  return flushAfter(out, posthog, options.ctx);
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
      // `mcp-method` and `mcp-name` are sent on every 2026-07-28 request.
      "authorization, content-type, mcp-session-id, mcp-protocol-version, mcp-method, mcp-name, accept, last-event-id",
    "Access-Control-Expose-Headers": "WWW-Authenticate, Mcp-Session-Id, Mcp-Protocol-Version",
    "Access-Control-Max-Age": "86400",
  };
}

/**
 * Rate limits by client IP, then answers. `env.MCP_LIMITER` is an optional Workers Rate Limiting binding
 * (60 requests a minute in production); without it, nothing is limited. An in-memory counter would be per isolate
 * and limit nothing.
 */
export async function serveAnonymous(request, env, audience, options = {}) {
  if (env.MCP_LIMITER) {
    const key = request.headers.get("cf-connecting-ip") || "unknown";
    const { success } = await env.MCP_LIMITER.limit({ key });
    if (!success) {
      record(env, audience, { kind: "rate_limited", outcome: "rate_limited", src: srcTag(request.url) });
      return jsonRpcError(429, -32000, `Rate limit exceeded: ${RATE_LIMIT_PER_MINUTE} requests a minute.`, {
        "Retry-After": "60",
        ...corsHeaders(),
      });
    }
  }
  return handleAnonymousMcp(request, env, audience, corsHeaders(), options);
}
