# Contributing

Developer docs for this repository. The README covers what it is and how to use it.

<!-- repo-initialise fills every [placeholder] below from the repo's real setup; delete a row it does not apply to. -->

## Setup

| Step | Command |
|---|---|
| Install dependencies | `[install command]` |
| Run locally | `[run command]` |
| Git hooks (once per clone; worktrees share it) | `brew install pre-commit` (or `pipx install pre-commit`), then `pre-commit install` |

## Tests and checks

| Check | Command |
|---|---|
| Full test suite | `[test command]` |
| Lint / types | `[lint command]` |

Run the full suite before landing a meaningful change.

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

## Landing changes

Work in a `git gtr` worktree, then rebase onto `origin/<default>` and push straight to the default branch: no pull
request. Never commit in the main checkout, never force-push the default branch, never `--no-verify`. Bot PRs
(Dependabot) still arrive as PRs. Details: `CLAUDE.md` and `.claude/rules/git.md`.
