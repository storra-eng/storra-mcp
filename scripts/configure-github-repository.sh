#!/usr/bin/env bash
set -euo pipefail

usage() {
  printf 'Usage: %s [storra-eng/repository]\n' "${0##*/}" >&2
  exit 64
}

if [[ $# -gt 1 ]]; then
  usage
fi

repository="${1:-$(gh repo view --json nameWithOwner --jq '.nameWithOwner')}"

if [[ ! "$repository" =~ ^storra-eng/[A-Za-z0-9._-]+$ ]]; then
  printf 'Refusing to configure %q: expected a storra-eng repository.\n' "$repository" >&2
  exit 65
fi

gh api --method PATCH "repos/$repository" \
  -F private=true \
  -F allow_squash_merge=true \
  -F allow_merge_commit=false \
  -F allow_rebase_merge=false \
  -F allow_auto_merge=false \
  -F allow_update_branch=false \
  -F delete_branch_on_merge=true \
  --silent

gh api "repos/$repository" --jq '{name, visibility, default_branch, allow_squash_merge, allow_merge_commit, allow_rebase_merge, allow_auto_merge, allow_update_branch, delete_branch_on_merge}'
