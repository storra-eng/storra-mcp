# storra-mcp

**Public repo (MIT).** Storra's two anonymous, read-only MCP servers ("Storra for Creators", "Storra for Brands"),
served at `mcp.getstorra.com/creators` and `/brands`. They answer from the public story export on `cdn.getstorra.com`.

- **This repo is the source of truth.** The private `storra` repo vendors `src/` byte-for-byte into
  `cloudflare/mcp-proxy/vendor/storra-mcp/` at a pinned commit, with a drift check, and deploys it from there. Change
  the code here, land it, then sync and deploy from `storra` (see CONTRIBUTING.md).
- **Everything here is public.** Never commit internal hostnames, project refs, issue keys, admin-only fields,
  secrets, or where a story was sourced from. The export's field allowlist (in `storra`) decides what a story carries;
  `detail()` in `src/tools.ts` passes through every field except a short denylist, so it is not the control.
- Layout: `src/` the servers (vendored by `storra`), `test/` their tests, `plugin/` the Claude Code plugin (marketplace
  at `.claude-plugin/marketplace.json`, source `./plugin`), `examples/agent/` an example agent using the MCP SDK.
- Each surface tags its own `?src=` slug on the server URL (`plugin`, `agent`, `github` in README links) so Storra can
  count its calls. Keep them. Tool names in the plugin skill and the agent come from the live `tools/list`.
- README is directory listing copy (mcp.pub, Glama, mcpmarket read it): no em dashes, keep URLs and the tool list true.

## Agent instructions

`CLAUDE.md` is this repository's canonical agent-instructions file. `AGENTS.md`
must remain a symlink to it, never a second copy. Read the repository's relevant
rules and skills before changing code or configuration.

## Working conventions

- Use a git worktree and branch for each piece of work. The primary
  checkout is reference-only. See `.claude/rules/git.md` for worktree conventions.
- Keep changes tightly scoped. Preserve unrelated work in a dirty tree and never
  discard it without explicit approval.
- Run the relevant automated checks. For meaningful changes, run the complete
  project test suite and review the diff before landing it.
- Keep documentation true to the implementation. Put detailed operating
  procedures in repository documentation rather than duplicating them here.
- When a repository's documentation and its existing code disagree, follow the conventions in the existing code for the task in hand, then sort each inconsistency out rather than only reporting it (Ed, 30 Oct 2026). For each one, ask Ed how to proceed - one AskUserQuestion question per inconsistency, naming the doc and the code that disagree, with the options (fix the doc to match the code, change the code to match the doc, or leave it) and your recommendation first - then carry out the answer in the same session. Fix one yourself without asking only when the doc is plainly stale (it names a file, flag or value the code has since replaced) and the fix is to the doc alone. In your final reply, list each inconsistency and what was done about it.

## Shared Claude plugins

This repository registers the internal `storra` marketplace from
[`storra-eng/claude-plugins`](https://github.com/storra-eng/claude-plugins).
The checked-in configuration enables the cross-repository `dev-loop`,
`code-standards`, `agent-ops`, `integrations`, and `herdr` plugins. Add
`database@storra` only when this repository uses a database.

Marketplace updates follow commits to the shared repository. A machine needs
non-interactive GitHub authentication for automatic updates; use
`/plugin marketplace update storra` to refresh immediately.

## Landing work

Work in a `git gtr` worktree and land it straight on the default branch: rebase onto `origin/<default>`, run the local
checks and `/code-review`, then fast-forward push. **No pull request** (Ed, 16 Nov 2026). Dependabot and other bot PRs
still arrive as PRs. Never commit in the main checkout, never force-push the default branch, never `--no-verify`.
