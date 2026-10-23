import http from "node:http";

export type PostOutcome = "response" | "timeout" | "aborted" | "error";

export interface TimedPostResult {
  outcome: PostOutcome;
  status: number | null;
  ttfbMs: number | null;
  totalMs: number;
  /** Transport error text only (never a header or a body). Present when outcome is "error". */
  error?: string;
}

export interface PostOptions {
  authorization?: string;
  timeoutMs: number;
}

export interface PostHandle {
  result: Promise<TimedPostResult>;
  /** No-op once the request has ended. */
  abort(): void;
}

export interface PostClient {
  start(path: string, body: string, opts: PostOptions): PostHandle;
  post(path: string, body: string, opts: PostOptions): Promise<TimedPostResult>;
  /** Sockets in use plus requests waiting for one. Idle keep-alive sockets are not counted. */
  activeSockets(): number;
  /** Destroys every socket, including requests still in flight. */
  destroy(): void;
}

export type PostClass = "hang" | "client-error" | "server-error" | "ok" | "error";

/** hang = the client timeout fired; "error" covers transport errors and a caller abort (neither is a server answer). */
export function classify(r: Pick<TimedPostResult, "outcome" | "status">): PostClass {
  if (r.outcome === "timeout") return "hang";
  if (r.outcome !== "response" || r.status === null) return "error";
  if (r.status >= 500) return "server-error";
  if (r.status >= 400) return "client-error";
  return "ok";
}

const countOf = (m: NodeJS.ReadOnlyDict<unknown[]>): number =>
  Object.values(m).reduce((n, list) => n + (list?.length ?? 0), 0);

/**
 * One keep-alive Agent per client, so a test owns its sockets and can count and destroy them.
 * The result resolves from the request's "close" event plus one setImmediate, after the Agent has
 * released the socket, so activeSockets() is already accurate when the promise settles.
 * `Content-Length` is always sent, so an empty body is `Content-Length: 0`.
 */
export function createPostClient(baseUrl: string): PostClient {
  const url = new URL(baseUrl);
  const agent = new http.Agent({ keepAlive: true, maxSockets: Infinity });

  const start = (path: string, body: string, opts: PostOptions): PostHandle => {
    const began = performance.now();
    const controller = new AbortController();
    const timeout = AbortSignal.timeout(opts.timeoutMs);
    const headers: Record<string, string | number> = {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(body),
    };
    if (opts.authorization) headers.Authorization = opts.authorization;
    let done = false;
    const result = new Promise<TimedPostResult>((resolve) => {
      let status: number | null = null;
      let ttfbMs: number | null = null;
      let ended = false;
      let error: string | undefined;
      const req = http.request({
        host: url.hostname,
        port: url.port,
        path,
        method: "POST",
        headers,
        agent,
        signal: AbortSignal.any([controller.signal, timeout]),
      });
      req.on("response", (res) => {
        status = res.statusCode ?? null;
        ttfbMs = performance.now() - began;
        res.on("end", () => {
          ended = true;
        });
        res.resume();
      });
      req.on("error", (err) => {
        error = err.message;
      });
      req.on("close", () => {
        setImmediate(() => {
          done = true;
          const outcome: PostOutcome = ended
            ? "response"
            : timeout.aborted
              ? "timeout"
              : controller.signal.aborted
                ? "aborted"
                : "error";
          resolve({
            outcome,
            status: ended ? status : null,
            ttfbMs: ended ? ttfbMs : null,
            totalMs: performance.now() - began,
            ...(outcome === "error" && error ? { error } : {}),
          });
        });
      });
      req.end(body);
    });
    return {
      result,
      abort: () => {
        if (!done) controller.abort();
      },
    };
  };

  return {
    start,
    post: (path, body, opts) => start(path, body, opts).result,
    activeSockets: () => countOf(agent.sockets) + countOf(agent.requests),
    destroy: () => agent.destroy(),
  };
}
