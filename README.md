# Storra MCP servers

[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![CI](https://github.com/storra-eng/storra-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/storra-eng/storra-mcp/actions/workflows/ci.yml)
[![MCP Registry](https://img.shields.io/badge/MCP_Registry-com.getstorra-blue)](https://registry.modelcontextprotocol.io/v0.1/servers?search=com.getstorra)
[![Storra for Creators on Glama](https://glama.ai/mcp/connectors/com.getstorra/creators/badges/score.svg)](https://glama.ai/mcp/connectors/com.getstorra/creators)
[![Storra for Brands on Glama](https://glama.ai/mcp/connectors/com.getstorra/brands/badges/score.svg)](https://glama.ai/mcp/connectors/com.getstorra/brands)

Find real charity stories for a creator to tell or a brand to fund, from any AI assistant that speaks MCP.
[Storra](https://getstorra.com) lists real charity stories that brands fund, creators tell and charities make real.
These two servers let an assistant search those stories and read one in full, with a link to its page.

- **Free, read-only, no sign-in.** Every story they return is already public on getstorra.com.
- **Hosted for you.** Add a URL below; there is nothing to install or run.
- Setup for every assistant: [getstorra.com/ai](https://getstorra.com/ai).

Contributing: see [CONTRIBUTING.md](CONTRIBUTING.md).

## Servers

| Server | URL | For |
|---|---|---|
| Storra for Creators | `https://mcp.getstorra.com/creators` | Creators looking for a story to make a video or post about |
| Storra for Brands | `https://mcp.getstorra.com/brands` | Brands looking for a story to fund as a cause-marketing campaign |

Transport: streamable HTTP, stateless, JSON responses. Authentication: none.

## Install

### Claude

**Claude.ai and Claude Desktop:** Settings, Connectors, Add custom connector. Paste a server URL. No sign-in needed.

**Claude Code:**

```bash
claude mcp add --transport http storra-creators 'https://mcp.getstorra.com/creators?src=github'
claude mcp add --transport http storra-brands 'https://mcp.getstorra.com/brands?src=github'
```

**Claude Code plugin** (both servers plus a `cause-campaign` skill):

```
/plugin marketplace add storra-eng/storra-mcp
/plugin install storra@storra-mcp
```

Then ask, for example: "Find charity stories a Manchester coffee chain could fund this Christmas."

### ChatGPT

Settings, Apps. Turn on developer mode, add a new app, paste a server URL and choose no authentication.

### Cursor

[Add Storra for Creators to Cursor](https://cursor.com/en/install-mcp?name=storra-creators&config=eyJ1cmwiOiJodHRwczovL21jcC5nZXRzdG9ycmEuY29tL2NyZWF0b3JzP3NyYz1naXRodWIifQ%3D%3D) ·
[Add Storra for Brands to Cursor](https://cursor.com/en/install-mcp?name=storra-brands&config=eyJ1cmwiOiJodHRwczovL21jcC5nZXRzdG9ycmEuY29tL2JyYW5kcz9zcmM9Z2l0aHViIn0%3D)

Or add to `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "storra-creators": { "url": "https://mcp.getstorra.com/creators?src=github" },
    "storra-brands": { "url": "https://mcp.getstorra.com/brands?src=github" }
  }
}
```

### VS Code

[Add Storra for Creators to VS Code](https://vscode.dev/redirect/mcp/install?name=storra-creators&config=%7B%22type%22%3A%22http%22%2C%22url%22%3A%22https%3A//mcp.getstorra.com/creators%3Fsrc%3Dgithub%22%7D) ·
[Add Storra for Brands to VS Code](https://vscode.dev/redirect/mcp/install?name=storra-brands&config=%7B%22type%22%3A%22http%22%2C%22url%22%3A%22https%3A//mcp.getstorra.com/brands%3Fsrc%3Dgithub%22%7D)

Or add to `.vscode/mcp.json`:

```json
{
  "servers": {
    "storra-creators": { "type": "http", "url": "https://mcp.getstorra.com/creators?src=github" },
    "storra-brands": { "type": "http", "url": "https://mcp.getstorra.com/brands?src=github" }
  }
}
```

### Other assistants

Grok, Gemini, Perplexity, Microsoft Copilot Studio and others: wherever the app lets you add a custom MCP server or
connector, paste a server URL and choose no authentication. Per-assistant steps: [getstorra.com/ai](https://getstorra.com/ai).

## Tools

Every tool is read-only (`readOnlyHint: true`, `destructiveHint: false`) and has a title.

| Server | Tool | What it does |
|---|---|---|
| Creators | `search_stories_to_tell` | Search stories by words, cause, place or category. Returns the best matches with a link to each story page. |
| Creators | `get_story` | One story in full: the story, where you could take it, the support on offer, and the charity's details. |
| Brands | `find_campaign_stories` | Search stories by words, cause or place. Returns the best matches with a link to each story page. |
| Brands | `get_campaign_story` | One story in full: the story, what a brand could do with it, and the charity's details. |
| Both | `list_causes` | The causes stories are filed under, with how many stories each has. |

Search results return at most 25 stories (10 by default).

Try asking:

- "Find charity stories I could make content about in Leeds."
- "Find campaign stories a UK coffee brand could fund about children."
- "Which causes have stories?"

## Limits and data

| | |
|---|---|
| Rate limit | 60 requests a minute per IP address. Over it, the server answers HTTP 429 with `Retry-After: 60`. |
| Data | Storra's public story export on `cdn.getstorra.com`. A change to it reaches tool answers within about 90 seconds. |
| Privacy | No account, no cookies, no conversation data stored. See [getstorra.com/privacy](https://getstorra.com/privacy). |

## Example agent

[`examples/agent`](examples/agent) connects with the [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk),
searches, prints matches with their links and reads the top one in full. Needs Node 20 or later.

```bash
cd examples/agent
npm install
npm start -- creators "animal rescue" --location Bristol --limit 5
npm start -- brands "children Christmas"
```

## Run it yourself

The hosted servers run this code on Cloudflare Workers. To run your own copy (Node 20 or later):

```bash
npm ci
npm run dev
curl -s -X POST http://localhost:8787/creators -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

It reads the same public story export as the hosted servers.

## Links

- Docs and setup: [getstorra.com/ai](https://getstorra.com/ai)
- For AI agents: [getstorra.com/llms.txt](https://getstorra.com/llms.txt)
- Directory listings: [Glama: Storra for Creators](https://glama.ai/mcp/connectors/com.getstorra/creators), [Glama: Storra for Brands](https://glama.ai/mcp/connectors/com.getstorra/brands), [MCP Registry](https://registry.modelcontextprotocol.io/v0.1/servers?search=com.getstorra)
- Support: [getstorra.com/contact](https://getstorra.com/contact)

## License

[MIT](LICENSE)
