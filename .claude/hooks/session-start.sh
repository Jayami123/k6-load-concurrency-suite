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

# P6 Documenso: the webhook host must resolve to the local receiver (plan 13.3).
grep -qE '^127\.0\.0\.1[[:space:]]+p6-webhook\.test$' /etc/hosts || echo '127.0.0.1 p6-webhook.test' | sudo tee -a /etc/hosts >/dev/null

if [ ! -x /opt/node24/bin/node ]; then
  echo "P6: Node 24 missing at /opt/node24; add the Node 24 snippet to the environment's setup script (docs/plans/2026-10-20-p6-phase1-task6-documenso-stack.md §13.5)" >&2
fi
if ! command -v shellcheck >/dev/null 2>&1; then
  echo 'P6: shellcheck missing; add `sudo apt-get install -y shellcheck` to the environment'"'"'s setup script so actionlint matches CI' >&2
fi
exit 0
