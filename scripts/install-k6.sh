#!/usr/bin/env bash
# Installs the pinned k6 (.k6-version), verified against scripts/k6-sha256.txt. Idempotent. Used by CI, the Cursor install step
# and the Claude Code session hook, so the three cannot drift. Only fixed release-asset URLs; never "latest", never the API.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION="$(tr -d '[:space:]' < "$ROOT/.k6-version")"
DEST="${K6_INSTALL_DIR:-/usr/local/bin}"
case "$(uname -m)" in x86_64) arch=amd64 ;; aarch64 | arm64) arch=arm64 ;; *) echo "unsupported arch $(uname -m)" >&2; exit 1 ;; esac
have="$("$DEST/k6" version 2>/dev/null | sed -n 's/^k6 v\([0-9.]*\).*/\1/p' || true)"
if [ "$have" = "$VERSION" ]; then echo "k6 $VERSION already installed at $DEST/k6"; exit 0; fi
tar_name="k6-v${VERSION}-linux-${arch}.tar.gz"
expected="$(awk -v f="$tar_name" '$2==f {print $1}' "$ROOT/scripts/k6-sha256.txt")"
[ -n "$expected" ] || { echo "no pinned sha256 for $tar_name in scripts/k6-sha256.txt" >&2; exit 1; }
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
curl --retry 3 -fsSL -o "$tmp/$tar_name" "https://github.com/grafana/k6/releases/download/v${VERSION}/${tar_name}"
echo "${expected}  $tmp/$tar_name" | sha256sum -c - >/dev/null || { echo "sha256 mismatch for $tar_name" >&2; exit 1; }
tar -xzf "$tmp/$tar_name" -C "$tmp"
SUDO=""; if [ ! -w "$DEST" ] 2>/dev/null && [ "$(id -u)" -ne 0 ]; then SUDO="sudo"; fi
$SUDO mkdir -p "$DEST"; $SUDO install -m 0755 "$tmp/k6-v${VERSION}-linux-${arch}/k6" "$DEST/k6"
"$DEST/k6" version
