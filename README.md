# storra-eng repository template

This private GitHub template is the starting point for new internal
`storra-eng` repositories. It supplies the organisation's GitHub merge policy
and Claude Code baseline without selecting a language, framework, CI pipeline,
or deployment platform.

Contributing: see [CONTRIBUTING.md](CONTRIBUTING.md).

## Create a repository

1. From `~/dev/storra-eng`, create and clone the repository from this template:
   `gh repo create storra-eng/<name> --private --template storra-eng/repo-template --description "<one-liner>" --clone`.
   The `dev-loop:new-github-repo` skill does this and then runs step 3 for you; step 2 still applies.
2. Open Claude Code in the clone and trust the folder when prompted. Trusting it registers the shared `storra`
   plugin marketplace and installs the plugins below.
3. Run `/dev-loop:repo-initialise "<one-liner>"`. It sets the commit email, applies the GitHub merge policy
   (`scripts/configure-github-repository.sh`), fills in the `[Repository name]` placeholder in `CLAUDE.md`,
   rewrites this README for the new repository, installs the git hooks for its language, enables
   `database@storra` if needed, configures the cross-repo baseline (Dependabot, `.gtrconfig`, Tessl and the
   bot-PR assignee where they apply), lists the repository in the org profile, and makes the first commit.

## Included baseline

- `CONTRIBUTING.md` is the developer-docs skeleton (setup, tests, hooks, landing) that the init skill fills in.
- `CLAUDE.md` is the canonical repository guidance; `AGENTS.md` is its symlink.
- `.claude/rules/` contains focused guidance for agent instructions, GitHub
  automation, and documentation.
- `.pre-commit-config.yaml` runs the file-size check, gitleaks on the staged diff, and actionlint on workflows.
- `.github/dependabot.yml` updates GitHub Actions monthly; the init skill adds the repo's own ecosystems.
- `.gtrconfig` copies `.claude/settings.local.json` into each `git gtr` worktree; the init skill adds `.env` files.
- `.claude/settings.json` registers `storra-eng/claude-plugins` and enables the
  shared development, standards, operations, integrations, and Herdr plugins.

## Add only when needed

Choose a runtime, dependency manager, test suite, CI workflows, deployment
configuration, language-specific hooks, and project-specific Claude rules for the new
repository. Enable `database@storra` only for repositories that use a database.
