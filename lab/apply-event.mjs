#!/usr/bin/env node
// lab/apply-event.mjs — mutate lab/world.json from a GitHub event payload.
//
// usage: node lab/apply-event.mjs <event-name> <path-to-event.json> [--world <path>]
//
// Handles:
//   watch               (action=started)      → append visitor (dedupe, cap 50)
//   issues              (action=opened)       → "penguin: goto x,y" / north|south|east|west
//   repository_dispatch (action=penguin-move) → move penguin from site, park 2h
//   repository_dispatch (action=lab-sync)     → expire parkedUntil → patrol
//   schedule / workflow_dispatch              → same expiry check as lab-sync
//
// Prints ONE line of JSON to stdout ({ ok, comment?, close? }) and always
// exits 0 for handled events (invalid moves are ok:false, not failures).
// Does NO network I/O — the workflow posts any issue comment itself.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

// ── grid (MUST match lab/scenes/floor.mjs walkability exactly) ─────────────
const COLS = 13;
const ROWS = 9;
const SOLID = Array.from({ length: ROWS }, () => new Array(COLS).fill(false));
for (const gy of [1, 3, 5, 7]) for (let gx = 2; gx <= 10; gx++) SOLID[gy][gx] = true; // rack rows
for (const gx of [3, 6, 9]) SOLID[0][gx] = true; // CRAC units on the north wall

const LOGIN_RE = /^[a-zA-Z0-9-]{1,39}$/;
const TITLE_RE = /^penguin:\s*(goto\s+(\d+)\s*,\s*(\d+)|north|south|east|west)$/i;
const VISITOR_CAP = 50;
const PARK_ISSUE_MS = 6 * 60 * 60 * 1000;
const PARK_DISPATCH_MS = 2 * 60 * 60 * 1000;
const DIRS = {
  north: [0, -1],
  south: [0, 1],
  east: [1, 0],
  west: [-1, 0],
};

function inBounds(x, y) {
  return x >= 0 && x < COLS && y >= 0 && y < ROWS;
}

function walkable(x, y) {
  return Number.isInteger(x) && Number.isInteger(y) && inBounds(x, y) && !SOLID[y][x];
}

// 4-neighbour BFS over walkable tiles.
function reachable(fromX, fromY, toX, toY) {
  if (!walkable(toX, toY)) return false;
  if (!walkable(fromX, fromY)) return true; // stranded penguin: allow rescue onto any walkable tile
  if (fromX === toX && fromY === toY) return true;
  const seen = new Set([fromY * COLS + fromX]);
  const queue = [[fromX, fromY]];
  while (queue.length) {
    const [cx, cy] = queue.shift();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!walkable(nx, ny)) continue;
      const key = ny * COLS + nx;
      if (seen.has(key)) continue;
      if (nx === toX && ny === toY) return true;
      seen.add(key);
      queue.push([nx, ny]);
    }
  }
  return false;
}

// ── world state ─────────────────────────────────────────────────────────────
function defaultWorld() {
  return {
    version: 1,
    penguin: { x: 10, y: 8, mode: 'patrol', parkedUntil: null, setBy: null },
    visitors: [],
    updatedAt: new Date(0).toISOString(),
  };
}

function loadWorld(worldPath) {
  try {
    const parsed = JSON.parse(readFileSync(worldPath, 'utf8'));
    const base = defaultWorld();
    const world = {
      version: 1,
      penguin: { ...base.penguin, ...(parsed && typeof parsed.penguin === 'object' ? parsed.penguin : {}) },
      visitors: Array.isArray(parsed?.visitors) ? parsed.visitors : [],
      updatedAt: typeof parsed?.updatedAt === 'string' ? parsed.updatedAt : base.updatedAt,
    };
    if (!Number.isInteger(world.penguin.x) || !Number.isInteger(world.penguin.y)) {
      world.penguin.x = base.penguin.x;
      world.penguin.y = base.penguin.y;
    }
    if (world.penguin.mode !== 'patrol' && world.penguin.mode !== 'parked') world.penguin.mode = 'patrol';
    return world;
  } catch {
    return defaultWorld();
  }
}

function saveWorld(worldPath, world) {
  mkdirSync(path.dirname(worldPath), { recursive: true });
  writeFileSync(worldPath, JSON.stringify(world, null, 2) + '\n', 'utf8');
}

// ── move validation + friendly commentary ──────────────────────────────────
function explainInvalid(x, y) {
  if (!Number.isInteger(x) || !Number.isInteger(y) || !inBounds(x, y)) {
    return `(${x},${y}) is off the floor — the grid is 13 wide by 9 tall, so x runs 0-12 and y runs 0-8. try again inside the room.`;
  }
  if (SOLID[y][x]) {
    if (y === 0) {
      return `(${x},${y}) is a crac cooling unit — the penguin refuses to climb into the hvac. try a tile beside it, like (${x - 1},0) or (${x + 1},0).`;
    }
    return `(${x},${y}) is inside a server rack — the penguin respectfully declines to clip through hardware. try the aisle next to it, like (${x},${y + 1}).`;
  }
  return `the penguin can't find a walkable path to (${x},${y}) from where it stands — the aisles just don't connect that way.`;
}

function tryMove(world, x, y, parkMs, setBy, now, via) {
  if (!walkable(x, y) || !reachable(world.penguin.x, world.penguin.y, x, y)) {
    return { ok: false, comment: explainInvalid(x, y) };
  }
  world.penguin.x = x;
  world.penguin.y = y;
  world.penguin.mode = 'parked';
  world.penguin.parkedUntil = new Date(now.getTime() + parkMs).toISOString();
  world.penguin.setBy = setBy;
  const hours = Math.round(parkMs / 3600000);
  return {
    ok: true,
    comment: `the penguin waddles${via ? ` ${via}` : ''} to (${x},${y}) and parks there for a while (about ${hours}h, then it resumes patrol). thanks for visiting.`,
  };
}

function sanitizeLogin(login) {
  return typeof login === 'string' && LOGIN_RE.test(login) ? login : null;
}

// ── event handlers ──────────────────────────────────────────────────────────
function handleWatch(world, event, now) {
  if (event?.action !== 'started') return { ok: true };
  const login = sanitizeLogin(event?.sender?.login);
  if (!login) return { ok: false };
  world.visitors = world.visitors.filter((v) => v && v.login !== login); // dedupe: move to end
  world.visitors.push({ login, at: now.toISOString() });
  while (world.visitors.length > VISITOR_CAP) world.visitors.shift(); // drop oldest
  return { ok: true };
}

function handleIssues(world, event, now) {
  if (event?.action !== 'opened') return { ok: true, close: false };
  const title = String(event?.issue?.title ?? '');
  const m = title.match(TITLE_RE);
  if (!m) {
    return {
      ok: false,
      close: true,
      comment:
        "i only speak two dialects: 'penguin: goto x,y' (x 0-12, y 0-8) or 'penguin: north|south|east|west'. rack rows and crac units are off-limits.",
    };
  }
  const setBy = sanitizeLogin(event?.issue?.user?.login);
  let result;
  if (m[2] !== undefined) {
    result = tryMove(world, parseInt(m[2], 10), parseInt(m[3], 10), PARK_ISSUE_MS, setBy, now, '');
  } else {
    const dir = m[1].toLowerCase();
    const [dx, dy] = DIRS[dir];
    const tx = world.penguin.x + dx;
    const ty = world.penguin.y + dy;
    if (!walkable(tx, ty)) {
      result = {
        ok: false,
        comment: `one step ${dir} from (${world.penguin.x},${world.penguin.y}) lands on (${tx},${ty}), which ${inBounds(tx, ty) ? 'is solid hardware' : 'is off the floor'}. try 'penguin: goto x,y' to route around it.`,
      };
    } else {
      result = tryMove(world, tx, ty, PARK_ISSUE_MS, setBy, now, dir);
    }
  }
  return { ...result, close: true };
}

function handleSync(world, now) {
  if (world.penguin.mode === 'parked' && world.penguin.parkedUntil !== null) {
    const t = Date.parse(world.penguin.parkedUntil);
    if (Number.isNaN(t) || t <= now.getTime()) {
      world.penguin.mode = 'patrol';
      world.penguin.parkedUntil = null;
      world.penguin.setBy = null;
    }
  }
  return { ok: true };
}

function handleDispatch(world, event, now) {
  const action = event?.action;
  if (action === 'penguin-move') {
    const cp = event?.client_payload ?? {};
    const setBy = sanitizeLogin(cp.visitor);
    return tryMove(world, cp.x, cp.y, PARK_DISPATCH_MS, setBy, now, '');
  }
  if (action === 'lab-sync') return handleSync(world, now);
  return { ok: true };
}

// ── main ────────────────────────────────────────────────────────────────────
function main() {
  const args = process.argv.slice(2);
  let worldPath = path.join(process.cwd(), 'lab', 'world.json');
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--world') worldPath = args[++i];
    else positional.push(args[i]);
  }
  const [eventName, eventPath] = positional;
  if (!eventName) {
    console.error('usage: node lab/apply-event.mjs <event-name> <path-to-event.json> [--world <path>]');
    process.exit(1);
  }

  let event = {};
  if (eventPath) {
    try {
      event = JSON.parse(readFileSync(eventPath, 'utf8'));
    } catch {
      event = {};
    }
  }

  const now = new Date();
  const world = loadWorld(worldPath);

  let result;
  switch (eventName) {
    case 'watch':
      result = handleWatch(world, event, now);
      break;
    case 'issues':
      result = handleIssues(world, event, now);
      break;
    case 'repository_dispatch':
      result = handleDispatch(world, event, now);
      break;
    case 'schedule':
    case 'workflow_dispatch':
      result = handleSync(world, now);
      break;
    default:
      result = { ok: true };
      break;
  }

  world.updatedAt = now.toISOString();
  saveWorld(worldPath, world);
  console.log(JSON.stringify(result));
  process.exit(0);
}

main();
