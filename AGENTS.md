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
