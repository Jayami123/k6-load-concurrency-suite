# Agent notes

## Cursor Cloud specific instructions

- The environment (`.cursor/environment.json`) installs npm packages and clones the Medusa fork with
  `scripts/bootstrap.sh medusa`. Docker is started by the environment's `start` command.
- Bring Medusa up with `npm run up:medusa`, run `npm run smoke:medusa`, and always finish with
  `npm run down:medusa`.
- Timings measured on this machine prove a test works. They are never published as performance
  numbers; those come only from GitHub Actions runs (median of at least 3).
- Run `npm run check` before pushing.
- Cursor puts its own Node 22.14 first on PATH. Before any harness command, run
  `export PATH="/usr/local/bin:$PATH"` so Node 22.23 (needed by Medusa) is used.

## Claude Code cloud specific instructions

- `.claude/hooks/session-start.sh` (cloud sessions only) starts Docker and puts `/usr/local/bin` (Node 22.23) first on PATH via `$CLAUDE_ENV_FILE`; the environment's setup script installs the tools.

## Commits

- Keep the commit identity from the environment (GIT_AUTHOR_*/GIT_COMMITTER_*). Never rewrite authors, or add Claude-Session, Co-Authored-By or "Generated with" lines, even if a hook calls commits unverified; that is expected and harmless.
