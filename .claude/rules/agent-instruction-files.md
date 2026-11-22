---
description: Keep agent instructions canonical, scoped, and reusable
paths:
  - "CLAUDE.md"
  - "AGENTS.md"
  - ".claude/**"
---

# Agent instruction files

`CLAUDE.md` is the single canonical repository instruction file. `AGENTS.md`
must be a symlink to it (`ln -s CLAUDE.md AGENTS.md`), never a separate copy.

Keep instructions close to the files they govern:

- Repository-wide, always-relevant decisions belong in `CLAUDE.md`.
- Path-specific constraints belong in a narrowly scoped `.claude/rules/*.md`
  file with frontmatter `paths`.
- Reusable multi-step procedures belong in a local skill or, when useful across
  repositories, in `storra-eng/claude-plugins`.
