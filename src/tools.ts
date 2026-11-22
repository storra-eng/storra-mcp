import { MCP_AUDIENCE_CONFIG, storyUrl, type McpAudience } from "./audiences";

/** One story as the export carries it: only the columns the audience's allowlist permits. */
export type FeedStory = Record<string, unknown> & { slug: string };

export interface StoryFeed {
  version: number;
  audience: McpAudience;
  generated_at: string;
  count: number;
  stories: FeedStory[];
}

export interface ToolDefinition {
  name: string;
  title: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    additionalProperties: false;
    required?: string[];
  };
  annotations: {
    title: string;
    readOnlyHint: true;
    destructiveHint: false;
    idempotentHint: true;
    openWorldHint: false;
  };
}

export const MAX_LIMIT = 25;
export const DEFAULT_LIMIT = 10;

const readOnly = (title: string) =>
  ({
    title,
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  }) as const;

const limitProperty = {
  type: "integer",
  minimum: 1,
  maximum: MAX_LIMIT,
  description: `How many stories to return (default ${DEFAULT_LIMIT}, at most ${MAX_LIMIT}).`,
};

const slugProperty = {
  type: "string",
  minLength: 1,
  maxLength: 200,
  description: "The story's slug, from a search result.",
};

/** The tools an audience's server exposes, in the order the card lists them. */
export function toolDefinitions(audience: McpAudience): ToolDefinition[] {
  const c = MCP_AUDIENCE_CONFIG[audience];
  const search: ToolDefinition =
    audience === "creators"
      ? {
          name: c.searchTool,
          title: "Search stories to tell",
          description:
            "Search real charity stories a creator could make a video or post about. Matches the query against titles, summaries, charities, causes and places, and returns the best matches with a link to each story page.",
          inputSchema: {
            type: "object",
            properties: {
              query: {
                type: "string",
                maxLength: 200,
                description:
                  'Words to look for, e.g. "children Manchester" or "animal rescue".',
              },
              cause: {
                type: "string",
                maxLength: 100,
                description:
                  'Only stories for this cause, e.g. "Health". Use list_causes for the values.',
              },
              location: {
                type: "string",
                maxLength: 100,
                description: 'Only stories in this place, e.g. "Manchester".',
              },
              category: {
                type: "string",
                maxLength: 100,
                description: "Only stories in this category.",
              },
              limit: limitProperty,
            },
            additionalProperties: false,
          },
          annotations: readOnly("Search stories to tell"),
        }
      : {
          name: c.searchTool,
          title: "Find campaign stories",
          description:
            "Search real charity stories a brand could fund as a cause-marketing campaign. Matches the query against titles, summaries, charities, causes and places, and returns the best matches with a link to each story page.",
          inputSchema: {
            type: "object",
            properties: {
              query: {
                type: "string",
                maxLength: 200,
                description:
                  'Words to look for, e.g. "children Christmas" or "mental health".',
              },
              cause: {
                type: "string",
                maxLength: 100,
                description:
                  'Only stories for this cause, e.g. "Health". Use list_causes for the values.',
              },
              location: {
                type: "string",
                maxLength: 100,
                description: 'Only stories in this place, e.g. "Manchester".',
              },
              limit: limitProperty,
            },
            additionalProperties: false,
          },
          annotations: readOnly("Find campaign stories"),
        };

  const get: ToolDefinition = {
    name: c.getTool,
    title: audience === "creators" ? "Get a story" : "Get a campaign story",
    description:
      audience === "creators"
        ? "Get one story in full: the story, where you could take it, the support on offer, and the charity's details."
        : "Get one story in full: the story, what a brand could do with it, and the charity's details.",
    inputSchema: {
      type: "object",
      properties: { slug: slugProperty },
      required: ["slug"],
      additionalProperties: false,
    },
    annotations: readOnly(
      audience === "creators" ? "Get a story" : "Get a campaign story",
    ),
  };

  const causes: ToolDefinition = {
    name: "list_causes",
    title: "List causes",
    description:
      "List the causes stories are filed under, with how many stories each has. Use a cause as the filter in a search.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    annotations: readOnly("List causes"),
  };

  return [search, get, causes];
}

export type ToolOutcome =
  | { ok: true; result: unknown; resultCount: number }
  | { ok: false; message: string };

const STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "about",
  "for",
  "in",
  "of",
  "on",
  "the",
  "to",
  "with",
  "my",
  "me",
  "i",
  "we",
  "our",
  "is",
  "are",
  "that",
  "could",
  "can",
  "make",
  "find",
]);

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function strList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string")
    : [];
}

function tokens(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

function storyTitle(s: FeedStory): string {
  return str(s.card_title) || str(s.card_headline) || str(s.one_liner);
}

// Weights: a hit in the title says more than one buried in the story.
function score(story: FeedStory, words: string[]): number {
  const fields: [string, number][] = [
    [storyTitle(story), 5],
    [str(story.card_headline), 3],
    [str(story.one_liner), 3],
    [str(story.charity_name), 3],
    [str(story.person_name), 3],
    [str(story.cause), 3],
    [str(story.category), 2],
    [strList(story.secondary_categories).join(" "), 2],
    [strList(story.creator_tags).join(" "), 2],
    [str(story.location), 3],
    [str(story.charity_location), 2],
    [str(story.hook), 1],
    [str(story.full_story), 1],
  ];
  const lowered = fields.map(
    ([text, weight]) => [text.toLowerCase(), weight] as const,
  );
  let total = 0;
  for (const word of words) {
    for (const [text, weight] of lowered)
      if (text.includes(word)) total += weight;
  }
  return total;
}

const includesCI = (haystack: string, needle: string) =>
  haystack.toLowerCase().includes(needle.toLowerCase());

/** The shape of a search hit: enough to choose a story, and the link to read it. */
export function summarise(audience: McpAudience, story: FeedStory) {
  return {
    slug: story.slug,
    url: storyUrl(audience, story.slug),
    title: storyTitle(story),
    summary: str(story.one_liner) || null,
    cause: str(story.cause) || null,
    category: str(story.category) || null,
    location: str(story.location) || str(story.charity_location) || null,
    charity: str(story.charity_name) || null,
    event_date: str(story.event_date) || null,
  };
}

// Presentation columns that tell an assistant nothing.
const NOISE = new Set([
  "id",
  "rank",
  "lat",
  "lng",
  "hero_variants",
  "hero_image_position",
  "image_source",
  "has_hero_image",
  "lister_logo_url",
  "charity_logo_url",
]);

function detail(audience: McpAudience, story: FeedStory) {
  const out: Record<string, unknown> = {
    url: storyUrl(audience, story.slug),
    title: storyTitle(story),
  };
  for (const [key, value] of Object.entries(story)) {
    if (NOISE.has(key) || value === null || value === "") continue;
    out[key] = value;
  }
  return out;
}

function clampLimit(raw: unknown): number {
  const n = typeof raw === "number" ? Math.floor(raw) : DEFAULT_LIMIT;
  return Math.min(
    Math.max(Number.isFinite(n) ? n : DEFAULT_LIMIT, 1),
    MAX_LIMIT,
  );
}

/** Validates the arguments by hand against the tool's schema: the Worker runs no schema compiler. */
function checkArgs(
  def: ToolDefinition,
  args: Record<string, unknown>,
): string | null {
  const props = def.inputSchema.properties as Record<
    string,
    { type: string; maxLength?: number; minimum?: number; maximum?: number }
  >;
  for (const key of Object.keys(args)) {
    if (!(key in props)) return `Unknown argument "${key}".`;
  }
  for (const key of def.inputSchema.required ?? []) {
    if (args[key] === undefined) return `Missing required argument "${key}".`;
  }
  for (const [key, value] of Object.entries(args)) {
    if (value === undefined) continue;
    const spec = props[key];
    if (spec.type === "string") {
      if (typeof value !== "string") return `"${key}" must be a string.`;
      if (spec.maxLength && value.length > spec.maxLength)
        return `"${key}" is too long (at most ${spec.maxLength} characters).`;
    } else if (spec.type === "integer") {
      if (typeof value !== "number" || !Number.isInteger(value))
        return `"${key}" must be an integer.`;
      if (
        (spec.minimum !== undefined && value < spec.minimum) ||
        (spec.maximum !== undefined && value > spec.maximum)
      )
        return `"${key}" must be between ${spec.minimum} and ${spec.maximum}.`;
    }
  }
  return null;
}

/** Checks a call against the audience's tool list and schema, before any feed is loaded. Returns the error, if any. */
export function validateCall(
  audience: McpAudience,
  name: string,
  rawArgs: unknown,
): string | null {
  const def = toolDefinitions(audience).find((t) => t.name === name);
  if (!def) return `Unknown tool "${name}".`;
  return checkArgs(def, asArgs(rawArgs));
}

function asArgs(rawArgs: unknown): Record<string, unknown> {
  return rawArgs && typeof rawArgs === "object" && !Array.isArray(rawArgs)
    ? (rawArgs as Record<string, unknown>)
    : {};
}

export function runTool(
  audience: McpAudience,
  name: string,
  rawArgs: unknown,
  feed: StoryFeed,
): ToolOutcome {
  const problem = validateCall(audience, name, rawArgs);
  if (problem) return { ok: false, message: problem };
  const args = asArgs(rawArgs);

  const c = MCP_AUDIENCE_CONFIG[audience];

  if (name === c.searchTool) {
    const words = tokens(str(args.query));
    const cause = str(args.cause).trim();
    const location = str(args.location).trim();
    const category = str(args.category).trim();
    const limit = clampLimit(args.limit);
    const hits: { story: FeedStory; points: number }[] = [];
    for (const story of feed.stories) {
      if (cause && !includesCI(str(story.cause), cause)) continue;
      if (
        location &&
        !includesCI(str(story.location), location) &&
        !includesCI(str(story.charity_location), location)
      )
        continue;
      if (
        category &&
        !includesCI(str(story.category), category) &&
        !strList(story.secondary_categories).some((s) =>
          includesCI(s, category),
        )
      )
        continue;
      const points = words.length ? score(story, words) : 0;
      if (words.length && points === 0) continue;
      hits.push({ story, points });
    }
    // Feed order is the site's own rank, so ties (and a query-less browse) come back in rank order.
    hits.sort((a, b) => b.points - a.points);
    const results = hits
      .slice(0, limit)
      .map((h) => summarise(audience, h.story));
    return {
      ok: true,
      resultCount: results.length,
      result: {
        total_matches: hits.length,
        returned: results.length,
        stories: results,
        ...(str(args.query).trim() && !words.length
          ? {
              note: "The query had no searchable words, so these are the top stories in rank order, not matches.",
            }
          : {}),
        feed_generated_at: feed.generated_at,
      },
    };
  }

  if (name === c.getTool) {
    const slug = str(args.slug);
    const story = feed.stories.find((s) => s.slug === slug);
    if (!story)
      return {
        ok: false,
        message: `No ${c.noun} with the slug "${slug}". It may have been taken or withdrawn; search again for current ones.`,
      };
    return { ok: true, resultCount: 1, result: detail(audience, story) };
  }

  // list_causes
  const counts = new Map<string, number>();
  for (const story of feed.stories) {
    const cause = str(story.cause);
    if (cause) counts.set(cause, (counts.get(cause) ?? 0) + 1);
  }
  const causes = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([cause, stories]) => ({ cause, stories }));
  return {
    ok: true,
    resultCount: causes.length,
    result: { causes, feed_generated_at: feed.generated_at },
  };
}
