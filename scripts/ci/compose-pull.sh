#!/usr/bin/env bash
# Pulls the images of one harness compose project, with bounded retries, before harness up.
#
# Why: Docker Hub registry flakes (HTTP 500 and token timeouts on hosted runners) failed jobs before
# any test ran in CI runs 39961527451 and 39979511916. Only `docker compose pull` is retried; harness
# up, seed and tests are never retried here.
#
# Usage: compose-pull.sh -p <project> -f <file> [-f <file> ...]
# Pass the same project name and -f files that `npm run up:<product>` uses (see the X5 plan's probe table).
set -euo pipefail

usage() {
  echo "usage: compose-pull.sh -p <project> -f <file> [-f <file> ...]" >&2
  exit 2
}

project=""
files=()
while getopts ":p:f:" opt; do
  case "$opt" in
    p) project="$OPTARG" ;;
    f) files+=("$OPTARG") ;;
    *) usage ;;
  esac
done
if [ -z "$project" ] || [ "${#files[@]}" -eq 0 ]; then
  usage
fi

compose=(docker compose -p "$project")
for file in "${files[@]}"; do
  compose+=(-f "$file")
done

# Worst CI pull measured 66 s (twenty-smoke, PR #44 head 4672b4d); 100 s per try leaves room above it.
per_try_seconds=100
max_tries=3
for attempt in 1 2 3; do
  if timeout "$per_try_seconds" "${compose[@]}" pull --ignore-buildable; then
    exit 0
  fi
  if [ "$attempt" -lt "$max_tries" ]; then
    echo "pull attempt ${attempt} failed; retrying"
    sleep $(( attempt == 1 ? 15 : 30 ))
  fi
done
echo "::error::docker compose pull failed after ${max_tries} attempts"
exit 1
