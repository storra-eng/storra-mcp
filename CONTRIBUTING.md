# Contributing

Developer docs for this repository. The README covers what it is and how to use it.

## Setup

| Step | Command |
|---|---|
| Install dependencies | `npm ci` (Node 20 or later) |
| Run locally | `npm run dev` (Wrangler, at `http://localhost:8787/creators` and `/brands`) |
| Git hooks (once per clone; worktrees share it) | `brew install pre-commit` (or `pipx install pre-commit`), then `pre-commit install` |

## Tests and checks

| Check | Command |
|---|---|
| Full test suite | `npm test` (Vitest) |
| Types | `npm run check` |
| Example agent types | `cd examples/agent && npm ci && npm run check` |
| Example agent, live | `cd examples/agent && npm start -- creators children --limit 3` |
| Validate the plugin | `claude plugin validate .` |

Run the full suite before landing a meaningful change. CI (`.github/workflows/ci.yml`) runs the server checks and the agent's type check on every push and PR.

## Git hooks

Commits are checked by [pre-commit](https://pre-commit.com).

| Hook | Blocks |
|---|---|
| file-size | a new file, or a change that grows one, past 5,000 tokens |
| gitleaks | a secret in the staged diff (false positive: add its fingerprint to `.gitleaksignore`) |
| actionlint | an invalid workflow under `.github/workflows/` (unknown runner labels go in `.github/actionlint.yaml`) |

The file-size limit counts bytes / 4, so files stay readable by an agent in one pass; the error explains how to split
the file. Lockfiles, generated output and data are exempt; add repo-specific exemptions, with a reason, to
`.token-budget-exempt`.

## Pull requests

Outside contributions are welcome as pull requests. Keep a change small and say what it is for; a new tool or a change
to what a tool returns needs a reason, because every assistant connected to the hosted servers will see it.

## Landing changes (Storra team)

Work in a `git gtr` worktree, then rebase onto `origin/<default>` and push straight to the default branch: no pull
request. Never commit in the main checkout, never force-push the default branch, never `--no-verify`. Bot PRs
(Dependabot) still arrive as PRs. Details: `CLAUDE.md` and `.claude/rules/git.md`.

## Deploying

The hosted servers are deployed from Storra's private repo, which vendors `src/` at a pinned commit. After a change
lands here, in `storra`: `node scripts/storra-mcp-vendor.mjs sync <commit>`, commit, land, then deploy
`cloudflare/mcp-proxy` (its README).

## Directory listings

| Directory | How |
|---|---|
| LobeHub | One listing per repo: `storra-eng-storra-mcp`, auto-indexed from this repo's README and claimed by Storra. Nothing to regenerate; it re-reads the repo. To change it by hand: `lhm login`, `lhm github connect`, then `lhm plugin update` with an `lhm.plugin.json` whose `identifier` is `storra-eng-storra-mcp`. |
| MCP Registry | `server.json` files live in Storra's private repo; Glama lists both servers from the registry. |
