// The P6-DOC-LOAD-009 stage (Phase 4 Task 6 §6.5): no k6 process. It sends max + 1 requests to each of the ten probed routes, in order,
// and judges every route with judgeRoute. Pre-limit 5xx are counted under their suspected ids and never fail the case.
import { rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { findHits } from "../../../scripts/evidence-token-scan.mjs";
import type { LoadContext, Stage, StageResult } from "../types.ts";
import {
  judgeRoute,
  ROUTES,
  UNPROBED,
  type LimiterRoute,
  type Observation,
  type RouteJudgement,
} from "./limiter-contract.ts";

/**
 * The request of answer i of a route. The bodies are the probe's shapes (§6.6); the credentials are invalid on purpose.
 * The auth limits key on the IP and the email (or token): the identifiers carry the run id, so a rerun does not inherit
 * the counter of an earlier run that is still inside its window. The IP-keyed routes cannot be isolated this way (see the Known issues line).
 */
function requestFor(
  route: LimiterRoute,
  runId: string,
): { method: string; path: string; body?: string } {
  const json = (o: unknown) => JSON.stringify(o);
  const email = `p6-limit-${route.id}-${runId}@qa.local`;
  switch (route.id) {
    case "authorize":
      return {
        method: "POST",
        path: route.path,
        body: json({ email, password: "p6-probe-password", csrfToken: "p6-bad-csrf" }),
      };
    case "forgot-password":
    case "resend-verify-email":
      return { method: "POST", path: route.path, body: json({ email }) };
    case "verify-email":
      return { method: "POST", path: route.path, body: json({ token: `p6-bad-token-${runId}` }) };
    // The password meets ZPasswordSchema (upper, lower, digit, special): a body the schema rejects never reaches the limiter.
    case "reset-password":
      return {
        method: "POST",
        path: route.path,
        body: json({ token: `p6-bad-token-${runId}`, password: "P6-probe-Pass-1!" }),
      };
    case "ai":
      return { method: "POST", path: route.path, body: json({}) };
    case "upload":
      return { method: "POST", path: route.path };
    default:
      return { method: route.method, path: route.path };
  }
}

async function observe(
  baseUrl: string,
  req: { method: string; path: string; body?: string },
): Promise<Observation> {
  const res = await fetch(`${baseUrl}${req.path}`, {
    method: req.method,
    headers: req.body ? { "content-type": "application/json" } : undefined,
    body: req.body,
  });
  const headers: Record<string, string> = {};
  res.headers.forEach((value, name) => (headers[name.toLowerCase()] = value));
  return {
    status: res.status,
    contentType: res.headers.get("content-type")?.split(";")[0]?.trim(),
    body: await res.text(),
    headers,
  };
}

export const limiterContractStage: Stage = async (ctx: LoadContext): Promise<StageResult> => {
  const baseUrl = process.env.DOCUMENSO_BASE_URL;
  if (!baseUrl) return { ok: false, kind: "ENV", reasons: ["ENV: DOCUMENSO_BASE_URL is not set"] };
  const nowSec = Math.floor(Date.now() / 1000);
  const judgements: Array<RouteJudgement & { max: number; family: string }> = [];
  const reasons: string[] = [];
  let kind: StageResult["kind"];
  try {
    for (const route of ROUTES) {
      const obs: Observation[] = [];
      for (let i = 0; i <= route.max; i++)
        obs.push(await observe(baseUrl, requestFor(route, ctx.runId)));
      judgements.push({ ...judgeRoute(route, obs, nowSec), max: route.max, family: route.family });
    }
  } catch (err) {
    return {
      ok: false,
      kind: "TEST BUG",
      reasons: [`limiter probe failed: ${(err as Error).message.slice(0, 200)}`],
    };
  }

  for (const j of judgements) {
    if (j.verdict === "TEST BUG") {
      kind = kind ?? "TEST BUG";
      reasons.push(`${j.route}: ${j.findings.join("; ")}`);
    } else if (j.verdict !== "PASS") {
      kind = kind ?? "PRODUCT BUG";
      reasons.push(`${j.route}: ${j.findings.length} finding(s) (suspected; the owner labels it)`);
    }
  }

  const report = {
    schema: 1,
    caseId: ctx.caseDef.id,
    runId: ctx.runId,
    routes: judgements,
    unprobed: UNPROBED,
  };
  const json = `${JSON.stringify(report, null, 2)}\n`;
  const md = [
    "### Limiter contract P6-DOC-LOAD-009\n",
    "| route | max | family | verdict | pre-limit 5xx | findings |",
    "| --- | --- | --- | --- | --- | --- |",
    ...judgements.map(
      (j) =>
        `| ${j.route} | ${j.max} | ${j.family} | ${j.verdict} | ${
          Object.entries(j.preLimit5xx)
            .map(([id, n]) => `${id}: ${n}`)
            .join(", ") || "none"
        } | ${j.findings.join("; ") || "none"} |`,
    ),
    "\n**Not asserted (the probe did not measure them):**\n",
    ...UNPROBED.map((u) => `- ${u.id}: ${u.reason}`),
    "",
  ].join("\n");
  const jsonPath = path.join(ctx.outDir, "limiter-contract.json");
  const mdPath = path.join(ctx.outDir, "limiter-contract.md");
  if (findHits(json).length > 0 || findHits(md).length > 0) {
    rmSync(jsonPath, { force: true });
    rmSync(mdPath, { force: true });
    return {
      ok: false,
      kind: "TEST BUG",
      reasons: ["limiter report matched a token pattern; not kept"],
    };
  }
  writeFileSync(jsonPath, json);
  writeFileSync(mdPath, md);
  return { ok: kind === undefined, kind, reasons, data: { routes: judgements.length } };
};
