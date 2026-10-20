#!/bin/bash
# Cloud sessions only: put Node 22.23 (/usr/local/bin) first on PATH and start Docker.
[ "${CLAUDE_CODE_REMOTE:-}" = "true" ] || exit 0

if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  echo 'export PATH="/usr/local/bin:$PATH"' >> "$CLAUDE_ENV_FILE"
fi

if command -v dockerd >/dev/null && ! docker info >/dev/null 2>&1; then
  (sudo dockerd > /tmp/dockerd.log 2>&1 &)
  for _ in $(seq 1 30); do docker info >/dev/null 2>&1 && break; sleep 1; done
fi
exit 0
