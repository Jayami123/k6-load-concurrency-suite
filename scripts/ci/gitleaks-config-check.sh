#!/usr/bin/env bash
# Proves that .gitleaks.toml lets only the Medusa publishable key through, and that the evidence release scan still reads it.
# Fixtures use obviously fake values. Run from the repository root with the pinned gitleaks on PATH (or GITLEAKS_BIN set).
set -euo pipefail

GL="${GITLEAKS_BIN:-gitleaks}"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
fail=0

# The release scan must read the config.
if ! grep -q -- '--config .gitleaks.toml' .github/workflows/evidence-release.yml; then
  echo "FAIL: evidence-release.yml does not pass --config .gitleaks.toml to the gitleaks scan" >&2
  exit 1
fi

# A pk_ key of 64 hex digits, fake.
key="pk_0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"

# write <root> <run-folder-path-under-root> <json-body>
write() {
  mkdir -p "$1/$2"
  printf '%s\n' "$3" > "$1/$2/k6-config.json"
}

medusa="load-medusa/P6-MED-LOAD-001/20261025T000000Z-abcdef12"
cal="load-cal/P6-CAL-LOAD-001/20261025T000000Z-abcdef12"

write "$work/ok" "$medusa" "{ \"baseUrl\": \"http://127.0.0.1:9000\", \"publishableKey\": \"$key\" }"
write "$work/planted-field" "$medusa" "{ \"publishableKey\": \"$key\", \"apiKey\": \"zQ7mK2pX9vB4nR8tY1wL6sD3fG5hJ0cQ\" }"
write "$work/bad-value" "$medusa" "{ \"publishableKey\": \"zQ7mK2pX9vB4nR8tY1wL6sD3fG5hJ0cQ8wLp\" }"
write "$work/wrong-path" "$cal" "{ \"publishableKey\": \"$key\" }"
write "$work/prefixed-dir" "other-$medusa" "{ \"publishableKey\": \"$key\" }"
write "$work/own-lines" "$medusa" "{
  \"publishableKey\": \"$key\",
  \"apiKey\": \"zQ7mK2pX9vB4nR8tY1wL6sD3fG5hJ0cQ\"
}"

# The soak layout as gh run download writes it: <artefact name>/P6-MED-LOAD-005/<attempt>/.
soak_medusa="soak-medusa-120/P6-MED-LOAD-005/20261027T053030Z-ba00cb53"
soak_cal="soak-cal-120/P6-MED-LOAD-005/20261027T053030Z-ba00cb53"
soak_other_id="soak-medusa-120/P6-MED-LOAD-001/20261027T053030Z-ba00cb53"
no_prefix="P6-MED-LOAD-005/20261027T053030Z-ba00cb53"

write "$work/soak-ok" "$soak_medusa" "{ \"baseUrl\": \"http://127.0.0.1:9000\", \"publishableKey\": \"$key\" }"
write "$work/soak-planted-field" "$soak_medusa" "{ \"publishableKey\": \"$key\", \"apiKey\": \"zQ7mK2pX9vB4nR8tY1wL6sD3fG5hJ0cQ\" }"
write "$work/soak-cal-folder" "$soak_cal" "{ \"publishableKey\": \"$key\" }"
write "$work/soak-other-id" "$soak_other_id" "{ \"publishableKey\": \"$key\" }"
write "$work/soak-no-prefix" "$no_prefix" "{ \"publishableKey\": \"$key\" }"

# expect <name> <dir> <pass|fail>
expect() {
  local code=0
  "$GL" dir "$2" --config .gitleaks.toml --redact --no-banner --exit-code 1 >/dev/null 2>&1 || code=$?
  if [[ "$3" == pass && "$code" -ne 0 ]]; then
    echo "FAIL: $1 should pass the scan (exit $code)" >&2; fail=1
  elif [[ "$3" == fail && "$code" -ne 1 ]]; then
    echo "FAIL: $1 should fail the scan (exit $code)" >&2; fail=1
  else
    echo "ok: $1 ($3)"
  fi
}

expect "publishable key in a Medusa LOAD attempt" "$work/ok" pass
expect "planted secret in another Medusa field" "$work/planted-field" fail
expect "non-pk value in publishableKey" "$work/bad-value" fail
expect "publishable key outside Medusa LOAD" "$work/wrong-path" fail
expect "publishable key in a prefixed directory name" "$work/prefixed-dir" fail
expect "planted secret on its own line beside a valid key" "$work/own-lines" fail
expect "publishable key in a Medusa soak attempt" "$work/soak-ok" pass
expect "planted secret beside the key in a Medusa soak attempt" "$work/soak-planted-field" fail
expect "publishable key in a Cal soak attempt" "$work/soak-cal-folder" fail
expect "publishable key in a Medusa soak case other than P6-MED-LOAD-005" "$work/soak-other-id" fail
expect "publishable key at the soak case folder with no artefact prefix" "$work/soak-no-prefix" fail

exit "$fail"
