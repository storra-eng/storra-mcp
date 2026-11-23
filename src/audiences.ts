/**
 * The two anonymous story servers: "Storra for Creators" (/creators) and "Storra for Brands" (/brands). Each reads one
 * public export, `story-feed/{audience}.json` on cdn.getstorra.com, which carries only the fields that audience's story
 * pages already show.
 *
 * Plain data and pure functions only, so the server, the tests and Storra's own site can all import it.
 */

export type McpAudience = "creators" | "brands";

export const MCP_AUDIENCES: readonly McpAudience[] = ["creators", "brands"];

export const SITE_ORIGIN = "https://getstorra.com";
export const MCP_ORIGIN = "https://mcp.getstorra.com";
export const FEED_CDN_ORIGIN = "https://cdn.getstorra.com";
export const MCP_SERVER_VERSION = "1.0.1";

export interface McpAudienceConfig {
  audience: McpAudience;
  name: string;
  title: string;
  description: string;
  /** Sent in `initialize`, so an assistant knows what the server is for before it lists the tools. */
  instructions: string;
  /** Where the audience's story pages live on the site; a story's URL is `${storyPath}/${slug}`. */
  storyPath: string;
  /** The export object this server reads, relative to `${FEED_CDN_ORIGIN}/story-feed/`. */
  feedFile: string;
  searchTool: string;
  getTool: string;
  /** The word the audience uses for a story in tool descriptions. */
  noun: string;
}

export const MCP_AUDIENCE_CONFIG: Record<McpAudience, McpAudienceConfig> = {
  creators: {
    audience: "creators",
    name: "storra-creators",
    title: "Storra for Creators",
    description:
      "Find real charity stories a creator could make a video or post about, with the brief and the support on offer. Read-only, no sign-in.",
    instructions:
      "Storra lists real charity stories that brands can fund and creators can tell. Use search_stories_to_tell to find stories by topic, cause or place, then get_story for the full brief. Always link the user to the story's url.",
    storyPath: "/creators/story-listings",
    feedFile: "creators.json",
    searchTool: "search_stories_to_tell",
    getTool: "get_story",
    noun: "story",
  },
  brands: {
    audience: "brands",
    name: "storra-brands",
    title: "Storra for Brands",
    description:
      "Find real charity stories a brand could fund as a cause-marketing campaign, with what the brand could do. Read-only, no sign-in.",
    instructions:
      "Storra lists real charity stories that a brand can fund and a creator then tells. Use find_campaign_stories to find stories by topic, cause or place, then get_campaign_story for the full detail. Always link the user to the story's url.",
    storyPath: "/brands/story-listings",
    feedFile: "brands.json",
    searchTool: "find_campaign_stories",
    getTool: "get_campaign_story",
    noun: "campaign story",
  },
};

export function isMcpAudience(value: string): value is McpAudience {
  return (MCP_AUDIENCES as readonly string[]).includes(value);
}

export function feedUrl(
  audience: McpAudience,
  origin: string = FEED_CDN_ORIGIN,
): string {
  return `${origin}/story-feed/${MCP_AUDIENCE_CONFIG[audience].feedFile}`;
}

/** utm_source on every getstorra.com URL these servers return, so Storra can see visits that came from an assistant. */
export const UTM_SOURCE_MCP = "storra-mcp";

/** The campaign tags every story URL these servers return carries (`medium` is the audience). */
export function storyUtm(
  audience: McpAudience,
  source: string = UTM_SOURCE_MCP,
): string {
  return `utm_source=${source}&utm_medium=${audience}&utm_campaign=story`;
}

export function storyUrl(audience: McpAudience, slug: string): string {
  return `${SITE_ORIGIN}${MCP_AUDIENCE_CONFIG[audience].storyPath}/${encodeURIComponent(slug)}?${storyUtm(audience)}`;
}
