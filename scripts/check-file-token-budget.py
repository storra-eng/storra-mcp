#!/usr/bin/env python3
"""Block staged agent-authored files over 5,000 tokens (tokens = bytes / 4, i.e. 20,000 bytes).

Why: an agent pays ~28k tokens to read a 1,500-line file and keeps them for the rest of the
session. Files that stay small can be read whole; big ones get skimmed and edited blind.

Ratchet, not a wall: a file already over the limit on HEAD is blocked only if this commit makes
it bigger, so editing a legacy file never becomes an unpassable gate. New files over the limit
are always blocked.

Only agent-authored text counts. Lockfiles, generated output, binaries, migrations and data are
exempt (EXEMPT below). Add repo-specific exemptions to `.token-budget-exempt` at the repo root:
one fnmatch glob per line (matched against the repo-relative path; `#` starts a comment), each
with a reason in the comment. There is deliberately no per-commit escape hatch.

Stdlib-only, reads staged blobs (never the working tree). Same behaviour as storra's
scripts/check-file-token-budget.mjs. Run with `--self-test` to run the built-in tests.
"""
import fnmatch
import os
import re
import subprocess
import sys

MAX_TOKENS = 5000
BYTES_PER_TOKEN = 4
MAX_BYTES = MAX_TOKENS * BYTES_PER_TOKEN

EXEMPT = [re.compile(p) for p in (
    # Lockfiles and resolved dependency manifests.
    r"(^|/)(package-lock\.json|bun\.lockb?|deno\.lock|yarn\.lock|pnpm-lock\.yaml|Cargo\.lock|poetry\.lock|uv\.lock|Pipfile\.lock|Podfile\.lock|Package\.resolved|Gemfile\.lock|composer\.lock|go\.sum|gradle\.lockfile)$",
    r"\.lock$",
    # Generated or vendored output.
    r"(^|/)(generated|__generated__|__snapshots__|node_modules|vendor|Pods|dist)/",
    r"\.(snap|min\.js|min\.css|map|pb\.go|g\.dart|generated\.[a-z]+)$",
    r"(^|/)(openapi|swagger)[^/]*\.(ya?ml|json)$",
    # Immutable history and data, not code an agent edits by reading it.
    r"(^|/)(migrations|alembic/versions)/",
    r"\.(json|csv|tsv|ndjson|jsonl|svg|xml|sql|plist|xcstrings|strings|pbxproj)$",
    # Vendored agent skills and spec-kit scaffolding.
    r"^\.specify/",
)]


def repo_exemptions(root="."):
    try:
        with open(os.path.join(root, ".token-budget-exempt"), encoding="utf-8") as f:
            lines = [l.split("#", 1)[0].strip() for l in f]
    except OSError:
        return []
    return [l for l in lines if l]


def is_exempt(path, extra=()):
    return any(r.search(path) for r in EXEMPT) or any(fnmatch.fnmatch(path, g) for g in extra)


def split_advice(path, nbytes):
    tokens = -(-nbytes // BYTES_PER_TOKEN)
    parts = -(-nbytes // int(MAX_BYTES * 0.7))
    stem, ext = os.path.splitext(path)
    return "\n".join([
        f"ERROR: {path} is ~{tokens:,} tokens (limit {MAX_TOKENS:,}; tokens = bytes/{BYTES_PER_TOKEN}).",
        f"  Split it into ~{parts} files of well under {MAX_TOKENS:,} tokens each:",
        "  1. Find the seams: sections, classes, exported groups, components, or test groups.",
        f"     (grep -nE '^(class |def |func |export |## |describe)' {path})",
        "  2. Move each cohesive group into a new file beside it, named for what it holds",
        f"     ({stem}-<topic>{ext}, or the language's own convention) - not part1/part2.",
        f"  3. Keep {path} as the entry point: it re-exports/imports the moved symbols (code) or",
        "     links to the new files (docs), so existing imports and links keep working.",
        "  4. Move shared helpers and types to one small file the pieces import; no circular imports.",
        "  5. Re-stage everything (git add) and commit again.",
        "  Do not trim by deleting content or by cramming lines to dodge the count.",
        "  Generated or data file? Add its glob, with a reason, to .token-budget-exempt.",
    ])


def blob(spec):
    p = subprocess.run(["git", "cat-file", "blob", spec], capture_output=True)
    return p.stdout if p.returncode == 0 else None


def find_offenders(paths, get=blob, extra=()):
    out = []
    for path in paths:
        if is_exempt(path, extra):
            continue
        new = get(f":{path}")
        if new is None or len(new) <= MAX_BYTES or b"\0" in new[:8000]:
            continue
        old = get(f"HEAD:{path}")
        if old is not None and len(old) > MAX_BYTES and len(new) <= len(old):
            continue
        out.append((path, len(new)))
    return out


def self_test():
    big = b"x" * (MAX_BYTES + 1)
    blobs = {":a": big, ":b": b"x" * MAX_BYTES, ":c": big + b"y", "HEAD:c": big, ":d": big[:-5], "HEAD:d": big,
             ":bin": b"\0" + big, ":uv.lock": big, ":e": big}
    get = blobs.get
    assert [p for p, _ in find_offenders(["a", "b"], get)] == ["a"], "new over-limit blocked, at-limit passes"
    assert [p for p, _ in find_offenders(["c", "d"], get)] == ["c"], "legacy growth blocked, shrink passes"
    assert find_offenders(["bin", "uv.lock"], get) == [], "binary and lockfile exempt"
    assert find_offenders(["e"], get, extra=["e"]) == [], "repo exemption"
    assert "~5 files" in split_advice("src/Big.kt", 60000).replace("~5 files", "~5 files")
    print("ok")


def main():
    if "--self-test" in sys.argv:
        return self_test()
    names = subprocess.run(
        ["git", "-c", "core.quotePath=false", "diff", "--cached", "--name-only", "-z", "--diff-filter=ACMR"],
        capture_output=True, text=True, check=True).stdout.split("\0")
    top = subprocess.run(["git", "rev-parse", "--show-toplevel"], capture_output=True, text=True, check=True).stdout.strip()
    offenders = find_offenders([n for n in names if n], extra=repo_exemptions(top))
    if offenders:
        print("\n\n".join(split_advice(p, n) for p, n in offenders), file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
