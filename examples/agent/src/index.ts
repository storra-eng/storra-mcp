import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

type Audience = "creators" | "brands";

const TOOLS: Record<Audience, { search: string; detail: string }> = {
  creators: { search: "search_stories_to_tell", detail: "get_story" },
  brands: { search: "find_campaign_stories", detail: "get_campaign_story" },
};

interface Story {
  slug: string;
  url: string;
  title: string;
  summary: string;
  charity: string | null;
  location: string | null;
  cause: string | null;
}

// Tool results arrive as one JSON string in a text block.
function parse<T>(result: Awaited<ReturnType<Client["callTool"]>>): T {
  const block = (result.content as { type: string; text?: string }[])[0];
  if (block?.type !== "text" || !block.text) throw new Error("Unexpected tool result");
  return JSON.parse(block.text) as T;
}

async function main() {
  const [audienceArg, ...words] = process.argv.slice(2);
  const audience = audienceArg as Audience;
  if (!(audience in TOOLS) || words.length === 0) {
    console.error('Usage: npm start -- <creators|brands> "<search words>" [--location Place] [--limit 5]');
    process.exit(64);
  }

  const query: string[] = [];
  const args: Record<string, unknown> = { limit: 5 };
  for (let i = 0; i < words.length; i++) {
    if (words[i] === "--location") args.location = words[++i];
    else if (words[i] === "--limit") args.limit = Number(words[++i]);
    else query.push(words[i]);
  }
  args.query = query.join(" ");

  const base = process.env.STORRA_MCP_URL ?? "https://mcp.getstorra.com";
  const client = new Client({ name: "storra-example-agent", version: "0.1.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/${audience}?src=agent`)));

  try {
    const { search, detail } = TOOLS[audience];
    const found = parse<{ total_matches: number; stories: Story[] }>(
      await client.callTool({ name: search, arguments: args }),
    );
    console.log(`${found.total_matches} matches, showing ${found.stories.length}\n`);

    for (const [i, story] of found.stories.entries()) {
      console.log(`${i + 1}. ${story.title}`);
      console.log(`   ${[story.charity, story.location, story.cause].filter(Boolean).join(" | ")}`);
      console.log(`   ${story.summary}`);
      console.log(`   ${story.url}\n`);
    }

    // Read the top match in full to show the second tool.
    if (found.stories[0]) {
      const full = await client.callTool({ name: detail, arguments: { slug: found.stories[0].slug } });
      const text = (full.content as { text?: string }[])[0]?.text ?? "";
      console.log(`Top match in full (${text.length} characters of detail via ${detail}).`);
    }
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
