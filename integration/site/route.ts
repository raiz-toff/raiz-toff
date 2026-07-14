// app/api/lab-penguin/route.ts
//
// Tier-3 bridge: the portfolio site -> the living lab.
//
// Accepts { x, y } (the tile where the site's DcFloor walk ended), validates
// it, rate-limits by IP, and forwards it to the raiz-toff/raiz-toff repo as a
// `penguin-move` repository_dispatch event. The lab workflow picks it up,
// re-validates the move against the real floor grid (walkability + BFS
// reachability), parks the penguin there for 2 hours, and repaints the SVG.
//
// Drop-in for Next.js 14/15 App Router. Zero dependencies.
//
// Env:
//   GITHUB_LAB_TOKEN — fine-grained PAT scoped to ONLY the raiz-toff repo,
//                      Contents: read+write (that permission authorizes
//                      repository_dispatch). See integration/site/README.md.

export const runtime = "nodejs";

const DISPATCH_URL =
  "https://api.github.com/repos/raiz-toff/raiz-toff/dispatches";

// Floor grid in lab/world.json: 13 cols x 9 rows.
const GRID_MAX_X = 12;
const GRID_MAX_Y = 8;

// Sliding-window rate limit: 10 requests / 60s per IP.
// In-memory, so per serverless instance — a speed bump, not a guarantee.
// The repo-side applier is the real gatekeeper.
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 10;
const MAX_TRACKED_IPS = 2_000;

/** ip -> timestamps (ms) of requests inside the current window */
const hits = new Map<string, number[]>();

function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd === null) return "unknown";
  const first = fwd.split(",")[0];
  return first === undefined || first.trim() === "" ? "unknown" : first.trim();
}

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const fresh = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (fresh.length >= MAX_PER_WINDOW) {
    hits.set(ip, fresh);
    return true;
  }
  fresh.push(now);
  hits.set(ip, fresh);

  // Opportunistic cleanup so the map cannot grow without bound.
  if (hits.size > MAX_TRACKED_IPS) {
    for (const [key, stamps] of hits) {
      if (stamps.every((t) => now - t >= WINDOW_MS)) hits.delete(key);
    }
  }
  return false;
}

interface Move {
  x: number;
  y: number;
}

function parseMove(raw: unknown): Move | null {
  if (typeof raw !== "object" || raw === null) return null;
  const { x, y } = raw as Record<string, unknown>;
  if (typeof x !== "number" || typeof y !== "number") return null;
  if (!Number.isInteger(x) || !Number.isInteger(y)) return null;
  if (x < 0 || x > GRID_MAX_X || y < 0 || y > GRID_MAX_Y) return null;
  return { x, y };
}

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export async function POST(req: Request): Promise<Response> {
  const token = process.env.GITHUB_LAB_TOKEN;
  if (token === undefined || token === "") {
    // Misconfigured deployment. Say nothing specific to the client.
    return json(503, { error: "unavailable" });
  }

  if (rateLimited(clientIp(req))) {
    return json(429, { error: "rate limited" });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return json(400, { error: "invalid json" });
  }

  const move = parseMove(raw);
  if (move === null) {
    return json(400, {
      error: "expected integers { x: 0..12, y: 0..8 }",
    });
  }

  // Fire the dispatch. Upstream failures are logged server-side only —
  // the client never sees GitHub status codes, bodies, or the token.
  try {
    const res = await fetch(DISPATCH_URL, {
      method: "POST",
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "x-github-api-version": "2022-11-28",
      },
      body: JSON.stringify({
        event_type: "penguin-move",
        client_payload: { x: move.x, y: move.y },
      }),
      cache: "no-store",
    });
    if (!res.ok) {
      // GitHub answers 204 on success.
      console.error(`lab-penguin: dispatch failed with ${res.status}`);
    }
  } catch (err) {
    console.error("lab-penguin: dispatch fetch error", err);
  }

  // Always 202 after validation: the move is best-effort and the lab repo
  // validates it again (grid bounds, walkable cell, BFS reachability).
  return json(202, { ok: true });
}
