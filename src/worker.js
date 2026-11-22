/**
 * A standalone Cloudflare Worker that serves both story servers: POST /creators and POST /brands.
 *
 * Storra's production Worker at mcp.getstorra.com imports `serveAnonymous` from ./server.js and does its own routing
 * (it also serves per-audience hosts and other endpoints); this entry is the minimal version, for running locally or
 * hosting your own copy.
 */

import { corsHeaders, serveAnonymous } from "./server.js";

const AUDIENCE_PATH = /^\/(creators|brands)\/?$/i;

function notFound() {
  return new Response(
    JSON.stringify({ error: "not_found", error_description: "POST MCP requests to /creators or /brands." }),
    { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders() } },
  );
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders() });
    const match = AUDIENCE_PATH.exec(new URL(request.url).pathname);
    return match ? serveAnonymous(request, env, match[1].toLowerCase()) : notFound();
  },
};
