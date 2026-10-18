#!/usr/bin/env bash
# Copy a Cursor cloud agent branch's changes into a fresh branch from main,
# committed as you (no "Cursor Agent" author, no Co-authored-by trailer).
# Usage: bash scripts/adopt-cloud-branch.sh <agent-branch> <new-branch> ["commit message"]
set -euo pipefail

AGENT="${1:?usage: adopt-cloud-branch.sh <agent-branch> <new-branch> [\"commit message\"]}"
NEW="${2:?usage: adopt-cloud-branch.sh <agent-branch> <new-branch> [\"commit message\"]}"
SRC="origin/$AGENT"

if [ -n "$(git status --porcelain)" ]; then
  echo "Working tree is not clean. Commit or stash first." >&2
  exit 1
fi

git fetch origin --prune
git rev-parse --verify --quiet "$SRC" >/dev/null || { echo "No such branch: $SRC" >&2; exit 1; }

MSG="${3:-$(git log -1 --format=%s "$SRC")}"

git checkout main
git pull --ff-only
git checkout -b "$NEW"

# Apply exactly what the agent changed relative to where it branched from main.
git diff --binary "main...$SRC" | git apply --index --3way

# Files under gitignored folders (e.g. results/) were force-added by the agent; warn about them.
IGNORED="$(git diff --cached --name-only | git check-ignore --no-index --stdin || true)"
if [ -n "$IGNORED" ]; then
  echo "WARNING: these files are in gitignored folders. Move them (e.g. under docs/feasibility/) before pushing:" >&2
  echo "$IGNORED" >&2
  echo "Nothing committed. The changes are staged on $NEW: move those files, then run npm run check, commit and push." >&2
  exit 1
fi

npx prettier --write $(git diff --cached --name-only --diff-filter=AM) --ignore-unknown
git add -A
npm run check

git status --short
git commit -m "$MSG"

git push -u origin "$NEW"
echo "Done. After the new branch merges, delete the agent branch with: git push origin --delete $AGENT"
