// Pure: reads the version printed by `k6 version` and compares it with the pin in .k6-version.

/**
 * @param {string} versionStdout
 * @param {string} pin
 * @returns {{ ok: boolean, installed: string | undefined }}
 */
export function compareK6Version(versionStdout, pin) {
  const installed = /^k6 v(\d+\.\d+\.\d+)/.exec(versionStdout.trim())?.[1];
  return { ok: installed === pin, installed };
}
