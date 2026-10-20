// Pure: decides which Node runs the Documenso harness commands (plan D1).
/**
 * @param {{ currentVersion: string, home: string, exists: (p: string) => boolean }} input
 * @returns {{ kind: "current" } | { kind: "home", node: string, binDir: string } | { kind: "missing", message: string }}
 */
export function chooseDocumensoNode({ currentVersion, home, exists }) {
  const major = Number(String(currentVersion).replace(/^v/, "").split(".")[0]);
  if (Number.isInteger(major) && major >= 24) return { kind: "current" };
  const binDir = `${home.replace(/\/$/, "")}/bin`;
  const node = `${binDir}/node`;
  if (exists(node)) return { kind: "home", node, binDir };
  return {
    kind: "missing",
    message:
      `ENV: Documenso needs Node 24; active Node is v${String(currentVersion).replace(/^v/, "")} ` +
      `and ${node} does not exist. Install Node v24.21.0 at /opt/node24 (plan §13.3) or set DOCUMENSO_NODE_HOME.`,
  };
}
