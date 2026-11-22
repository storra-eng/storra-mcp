---
description: Use git gtr for worktrees
paths:
  - "CLAUDE.md"
---

# Git worktrees

Use `git gtr` to manage git worktrees. It is a local alias that must be configured:

`git config --global alias.gtr -- "!.git/hooks/gtr-dispatch" # must be run from inside a repo`

`git-gtr` is a script that must be on the user's `$PATH`. See `storra-eng/dev-setup` for the script and setup instructions.
