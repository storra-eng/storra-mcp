---
description: Safely maintain repository automation and GitHub settings
paths:
  - ".github/**"
  - "scripts/configure-github-repository.sh"
  - "README.md"
---

# GitHub automation

New `storra-eng` repositories use private visibility, squash-only pull-request
merges, and automatic deletion of merged source branches. Apply those settings
with `scripts/configure-github-repository.sh` after creating a repository from
this template.

Keep workflows and repository automation specific to the project that needs
them. Do not copy deployment, CI, or integration configuration from another
repository without validating its dependencies and credentials.
