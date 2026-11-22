/** The `?src=` listing tag on an MCP URL (which directory a client came from): a short lowercase slug, or "" when absent or malformed. */
export function srcTag(url: string): string {
  const v = (new URL(url).searchParams.get("src") ?? "").toLowerCase();
  return /^[a-z0-9._-]{1,32}$/.test(v) ? v : "";
}
