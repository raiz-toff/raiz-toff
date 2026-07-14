// lab/scenes/floor.mjs — scene s1 · the isometric data-center floor.
// Ported from the story-01-floor generator (dc-floor.tsx geometry, kept verbatim).
// Emits { body, defs } inner markup for lab/composite.mjs; no <svg>, no <style>.
//
// Dynamics wired to ctx:
//   penguin.mode  patrol → looping animateMotion patrol
//                 parked → static at world (x,y), idle bob + ripple
//                 sleep  → static beside pve-01 at (10,8), closed-arc eyes, drifting "z"
//   night         LED base opacities × 0.6, flicker count fixed at 4
//   load          flicker count = round(4 + load*10)  (day only)
//   latestVisitor rack (2,1) gets amber accent stroke + pill label "guest // {login}"

export const KEY = "s1";
export const VIEWBOX = "0 0 640 320";
export const TITLE = "01 · the floor";

// ── deterministic PRNG (mulberry32, ported verbatim — never Math.random) ──
function mulberry32(seed) {
  let s = seed;
  return function () {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const OX = 280;
const OY = 70;
const COLS = 13;
const ROWS = 9;

function project(gx, gy) {
  return [OX + (gx - gy) * 20, OY + (gx + gy) * 10];
}

// number formatter: round to 2 decimals, trim trailing zeros
function fmt(n) {
  const r = Math.round(n * 100) / 100;
  if (!Number.isFinite(r)) throw new Error("s1: non-finite number: " + n);
  return String(r);
}

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ── walkability grid ──────────────────────────────────────────────────────
const SOLID = Array.from({ length: ROWS }, () => new Array(COLS).fill(false));
for (const gy of [1, 3, 5, 7]) for (let gx = 2; gx <= 10; gx++) SOLID[gy][gx] = true;
for (const gx of [3, 6, 9]) SOLID[0][gx] = true;

function walkable(x, y) {
  return x >= 0 && x < COLS && y >= 0 && y < ROWS && !SOLID[y][x];
}

// ── floor lattice + cold-aisle grates ─────────────────────────────────────
function seg(a, b) {
  return { x1: a[0], y1: a[1], x2: b[0], y2: b[1] };
}

const GRID_LINES = (() => {
  const out = [];
  for (let k = 0; k <= COLS; k++) {
    out.push(seg(project(k - 0.5, -0.5), project(k - 0.5, ROWS - 0.5)));
  }
  for (let m = 0; m <= ROWS; m++) {
    out.push(seg(project(-0.5, m - 0.5), project(COLS - 0.5, m - 0.5)));
  }
  return out;
})();

const GRATES = (() => {
  const out = [];
  for (let gx = 0; gx < COLS; gx++) {
    if (SOLID[4][gx]) continue;
    const [sx, sy] = project(gx, 4);
    out.push({ x1: sx - 10, y1: sy - 3, x2: sx + 6, y2: sy + 5 });
    out.push({ x1: sx - 4, y1: sy - 6, x2: sx + 12, y2: sy + 2 });
  }
  return out;
})();

// ── conduits + unbuilt pad ────────────────────────────────────────────────
const CONDUITS = [
  "M 100 150 L 40 180 L -24 148",
  "M 360 280 L 456 328",
  "M 280 60 L 360 20 L 300 -10",
];

const WIRE_PAD = (() => {
  const gx = 1, gy = 11, w = 3, d = 2, h = 26;
  const base = [
    project(gx, gy),
    project(gx + w, gy),
    project(gx + w, gy + d),
    project(gx, gy + d),
  ];
  const top = base.map(([x, y]) => [x, y - h]);
  return {
    base: base.map((p) => p.join(",")).join(" "),
    top: top.map((p) => p.join(",")).join(" "),
    posts: base.map((p, i) => seg(p, top[i])),
  };
})();

const AISLE_LABELS = [2, 4, 6].map((row, i) => {
  const [sx, sy] = project(0.6, row);
  return { x: sx - 26, y: sy + 3, label: ["hot", "cold", "hot"][i] };
});

// ── racks + CRAC units ────────────────────────────────────────────────────
const ROW_LETTER = { 1: "a", 3: "b", 5: "c", 7: "d" };
const DEFAULT_STROKE = "var(--hw-stroke)";
const GUEST_GX = 2;
const GUEST_GY = 1;

function buildBoxes(rand, guestLogin) {
  let nextLedId = 0;

  function buildBox(gx, gy, h, name, accent, hatchTop) {
    const [sx, sy] = project(gx, gy);
    const W = [sx - 20, sy];
    const E = [sx + 20, sy];
    const N = [sx, sy - 10];
    const S = [sx, sy + 10];

    const west = `${W} ${S} ${S[0]},${S[1] - h} ${W[0]},${W[1] - h}`;
    const east = `${S} ${E} ${E[0]},${E[1] - h} ${S[0]},${S[1] - h}`;
    const top = `${N[0]},${N[1] - h} ${E[0]},${E[1] - h} ${S[0]},${S[1] - h} ${W[0]},${W[1] - h}`;

    const hatch = hatchTop
      ? Array.from({ length: 3 }, (_, i) => ({
          x1: sx - 12 + i * 4,
          y1: sy - h - 4 + i * 2,
          x2: sx + 4 + i * 4,
          y2: sy - h + 4 + i * 2,
        }))
      : [];

    const leds = hatchTop
      ? []
      : Array.from({ length: 3 }, (_, i) => {
          const t = 0.28 + i * 0.22;
          return {
            id: nextLedId++,
            cx: W[0] + (S[0] - W[0]) * t,
            cy: W[1] + (S[1] - W[1]) * t - h * 0.55,
            r: 1.1,
            opacity: Number((0.4 + rand() * 0.6).toFixed(2)),
          };
        });

    return {
      key: `${gx},${gy}`,
      gx,
      gy,
      sum: gx + gy,
      name,
      accent,
      west,
      east,
      top,
      hatch,
      leds,
      labelX: sx,
      labelY: sy - h - 7,
      labelW: name.length * 6.1 + 10,
    };
  }

  const boxes = [];
  for (const gy of [1, 3, 5, 7]) {
    for (let gx = 2; gx <= 10; gx++) {
      let name = `r-${ROW_LETTER[gy]}${gx < 10 ? "0" + gx : gx}`;
      let accent = null;
      if (gy === 3 && gx === 6) {
        name = "core // spine";
        accent = "var(--led-teal)";
      }
      if (gy === 7 && gx === 10) {
        name = "pve-01 // home.lab";
        accent = "var(--led-green)";
      }
      if (gy === GUEST_GY && gx === GUEST_GX && guestLogin) {
        name = `guest // ${guestLogin}`;
        accent = "var(--led-amber)";
      }
      boxes.push(buildBox(gx, gy, 34, name, accent, false));
    }
  }
  for (const gx of [3, 6, 9]) {
    boxes.push(buildBox(gx, 0, 22, gx === 6 ? "crac" : "", gx === 6 ? "var(--hw-label)" : null, true));
  }
  return boxes;
}

// ── LED flicker pool: deterministic picks spread across the floor ─────────
// rack index r (build order): gy=1 -> r 0..8, gy=3 -> 9..17, gy=5 -> 18..26,
// gy=7 -> 27..35; led ids are 3r + k. Ordered so any prefix stays spread out;
// count = night ? 4 : round(4 + load*10), max 14.
const FLICKER_POOL = [
  { id: 3 * 1 + 0, dur: 2.1, begin: 0.4 },   // gy1 gx3
  { id: 3 * 15 + 0, dur: 4.1, begin: 1.9 },  // gy3 gx8
  { id: 3 * 19 + 1, dur: 2.4, begin: 0.7 },  // gy5 gx3
  { id: 3 * 32 + 2, dur: 3.6, begin: 0.9 },  // gy7 gx7
  { id: 3 * 5 + 1, dur: 3.3, begin: 1.1 },   // gy1 gx7
  { id: 3 * 10 + 2, dur: 2.7, begin: 0.0 },  // gy3 gx3
  { id: 3 * 23 + 2, dur: 3.9, begin: 2.6 },  // gy5 gx7
  { id: 3 * 28 + 1, dur: 2.9, begin: 3.2 },  // gy7 gx3
  { id: 3 * 26 + 0, dur: 4.7, begin: 1.3 },  // gy5 gx10
  { id: 3 * 34 + 0, dur: 4.3, begin: 2.2 },  // gy7 gx9
  { id: 3 * 3 + 2, dur: 3.1, begin: 1.6 },   // gy1 gx5
  { id: 3 * 8 + 0, dur: 2.6, begin: 0.5 },   // gy1 gx10
  { id: 3 * 12 + 1, dur: 3.8, begin: 2.9 },  // gy3 gx5
  { id: 3 * 30 + 2, dur: 4.5, begin: 1.5 },  // gy7 gx5
];

// ── penguin patrol path (fixed loop over walkable tiles) ──────────────────
// Loop: (10,8) -> (0,8) -> (0,4) -> (11,4) -> (11,8) -> (10,8).
const PATROL = [
  [10, 8],
  [0, 8],
  [0, 4],
  [11, 4],
  [11, 8],
  [10, 8],
];
// verify every leg stays on walkable tiles (throws at import time if broken)
for (let i = 0; i < PATROL.length - 1; i++) {
  const [ax, ay] = PATROL[i];
  const [bx, by] = PATROL[i + 1];
  if (ax !== bx && ay !== by) throw new Error("s1: patrol leg not axis-aligned");
  const steps = Math.abs(bx - ax) + Math.abs(by - ay);
  const dx = Math.sign(bx - ax);
  const dy = Math.sign(by - ay);
  for (let s = 0; s <= steps; s++) {
    if (!walkable(ax + dx * s, ay + dy * s)) {
      throw new Error(`s1: patrol crosses solid tile at ${ax + dx * s},${ay + dy * s}`);
    }
  }
}
const PATROL_PTS = PATROL.map(([gx, gy]) => project(gx, gy));
// constant speed: keyPoints/keyTimes proportional to euclidean segment length
const PATROL_KEYS = (() => {
  const legLens = [];
  for (let i = 0; i < PATROL_PTS.length - 1; i++) {
    const [ax, ay] = PATROL_PTS[i];
    const [bx, by] = PATROL_PTS[i + 1];
    legLens.push(Math.hypot(bx - ax, by - ay));
  }
  const totalLen = legLens.reduce((a, b) => a + b, 0);
  const fracs = [0];
  let acc = 0;
  for (const L of legLens) {
    acc += L;
    fracs.push(acc / totalLen);
  }
  return fracs.map((f) => String(Math.round(f * 10000) / 10000)).join(";");
})();
const PATROL_PATH =
  `M ${PATROL_PTS[0][0]} ${PATROL_PTS[0][1]} ` +
  PATROL_PTS.slice(1).map(([x, y]) => `L ${x} ${y}`).join(" ");

// ── penguin body parts ────────────────────────────────────────────────────
const RIPPLE =
  `<ellipse cx="0" cy="0" rx="6" ry="3" fill="none" stroke="var(--led-green)" stroke-width="1" opacity="0.8">` +
  `<animate attributeName="rx" values="6;16" dur="1.2s" repeatCount="indefinite"/>` +
  `<animate attributeName="ry" values="3;8" dur="1.2s" repeatCount="indefinite"/>` +
  `<animate attributeName="opacity" values="0.8;0" dur="1.2s" repeatCount="indefinite"/>` +
  `</ellipse>`;

function penguinBody(eyesClosed) {
  const eyes = eyesClosed
    ? `<path d="M -2.1 -14.8 Q -1.3 -14 -0.5 -14.8" fill="none" stroke="var(--background)" stroke-width="0.7" stroke-linecap="round"/>` +
      `<path d="M 0.5 -14.8 Q 1.3 -14 2.1 -14.8" fill="none" stroke="var(--background)" stroke-width="0.7" stroke-linecap="round"/>`
    : `<circle cx="-1.3" cy="-14.6" r="0.85" fill="var(--background)"/>` +
      `<circle cx="1.3" cy="-14.6" r="0.85" fill="var(--background)"/>`;
  return [
    `<ellipse cx="0" cy="0.3" rx="4.6" ry="1.6" fill="var(--hw-well)" opacity="0.3"/>`,
    `<ellipse cx="-2" cy="-0.3" rx="1.8" ry="1" fill="var(--led-amber)"/>`,
    `<ellipse cx="2" cy="-0.3" rx="1.8" ry="1" fill="var(--led-amber)"/>`,
    `<ellipse cx="0" cy="-7" rx="4.9" ry="6.4" fill="var(--foreground)"/>`,
    `<ellipse cx="-4.7" cy="-6.4" rx="1.2" ry="3.1" transform="rotate(12 -4.7 -6.4)" fill="var(--foreground)"/>`,
    `<ellipse cx="4.7" cy="-6.4" rx="1.2" ry="3.1" transform="rotate(-12 4.7 -6.4)" fill="var(--foreground)"/>`,
    `<ellipse cx="0" cy="-5.4" rx="3.1" ry="4.4" fill="var(--background)"/>`,
    `<circle cx="0" cy="-14" r="3.6" fill="var(--foreground)"/>`,
    eyes,
    `<polygon points="-1.5,-13.2 1.5,-13.2 0,-11.6" fill="var(--led-amber)"/>`,
  ].join("\n        ");
}

const BOB =
  `<animateTransform attributeName="transform" type="translate" values="0 0;0 -1.2;0 0" dur="0.31s" repeatCount="indefinite"/>`;

function penguinMarkup(ctx) {
  const mode = (ctx.penguin && ctx.penguin.mode) || "patrol";

  if (mode === "sleep") {
    // static beside pve-01 at (10,8), eyes closed, tiny drifting "z"
    const [px, py] = project(10, 8);
    return `  <g transform="translate(${fmt(px)} ${fmt(py)})">
    <g>
        ${penguinBody(true)}
    </g>
    <text x="5" y="-19" font-size="6" fill="var(--hw-label-dim)" opacity="0">z<animate attributeName="opacity" values="0;0.85;0" dur="3.2s" repeatCount="indefinite"/><animateTransform attributeName="transform" type="translate" values="0 0;3 -7" dur="3.2s" repeatCount="indefinite"/></text>
  </g>`;
  }

  if (mode === "parked") {
    let gx = Number(ctx.penguin && ctx.penguin.x);
    let gy = Number(ctx.penguin && ctx.penguin.y);
    if (!Number.isFinite(gx) || !Number.isFinite(gy)) { gx = 10; gy = 8; }
    gx = Math.max(0, Math.min(COLS - 1, Math.round(gx)));
    gy = Math.max(0, Math.min(ROWS - 1, Math.round(gy)));
    const [px, py] = project(gx, gy);
    return `  <g transform="translate(${fmt(px)} ${fmt(py)})">
    ${RIPPLE}
    <g>
      ${BOB}
        ${penguinBody(false)}
    </g>
  </g>`;
  }

  // patrol: looping animateMotion (begins untouched by composite)
  return `  <g>
    <animateMotion path="${PATROL_PATH}" dur="36s" repeatCount="indefinite" calcMode="linear" keyPoints="${PATROL_KEYS}" keyTimes="${PATROL_KEYS}"/>
    ${RIPPLE}
    <g>
      <animateTransform attributeName="transform" type="rotate" values="-6;6;-6" dur="0.62s" repeatCount="indefinite"/>
      <g>
        ${BOB}
        ${penguinBody(false)}
      </g>
    </g>
  </g>`;
}

// ── captions ──────────────────────────────────────────────────────────────
export function caption(ctx) {
  return ctx.night
    ? "night shift: the daydream keeps humming while toronto sleeps"
    : "every homelab starts as a daydream of a facility";
}

// ── render ────────────────────────────────────────────────────────────────
export function render(ctx) {
  const rand = mulberry32(4242);
  const night = !!ctx.night;
  const loadRaw = Number(ctx.load);
  const load = Number.isFinite(loadRaw) ? Math.max(0, Math.min(1, loadRaw)) : 0;
  const guestLogin =
    typeof ctx.latestVisitor === "string" && /^[a-zA-Z0-9-]{1,39}$/.test(ctx.latestVisitor)
      ? ctx.latestVisitor
      : null;

  const boxes = buildBoxes(rand, guestLogin);

  const flickerCount = Math.min(
    FLICKER_POOL.length,
    night ? 4 : Math.round(4 + load * 10)
  );
  const flickerById = new Map(FLICKER_POOL.slice(0, flickerCount).map((f) => [f.id, f]));

  const ledDim = night ? 0.6 : 1;
  const flickerDip = night ? 0.09 : 0.15;

  const parts = [];

  // floor lattice + grates
  parts.push(`  <g>`);
  for (const l of GRID_LINES) {
    parts.push(
      `    <line x1="${fmt(l.x1)}" y1="${fmt(l.y1)}" x2="${fmt(l.x2)}" y2="${fmt(l.y2)}" stroke="var(--hw-stroke-soft)" stroke-width="1" stroke-dasharray="3 3"/>`
    );
  }
  for (const l of GRATES) {
    parts.push(
      `    <line x1="${fmt(l.x1)}" y1="${fmt(l.y1)}" x2="${fmt(l.x2)}" y2="${fmt(l.y2)}" stroke="var(--hw-stroke-soft)" stroke-width="1"/>`
    );
  }
  parts.push(`  </g>`);

  // conduits + unbuilt expansion pad
  parts.push(`  <g fill="none" stroke="var(--border)">`);
  for (const d of CONDUITS) {
    parts.push(`    <path d="${d}" stroke-dasharray="4 4"/>`);
  }
  parts.push(`    <polygon points="${WIRE_PAD.base}" stroke-dasharray="3 3"/>`);
  parts.push(`    <polygon points="${WIRE_PAD.top}" stroke-dasharray="3 3"/>`);
  for (const l of WIRE_PAD.posts) {
    parts.push(
      `    <line x1="${fmt(l.x1)}" y1="${fmt(l.y1)}" x2="${fmt(l.x2)}" y2="${fmt(l.y2)}" stroke-dasharray="3 3"/>`
    );
  }
  parts.push(`  </g>`);

  // world: boxes sorted by depth-sum (painter order); one-shot reveals
  parts.push(`  <g>`);
  const sorted = [...boxes].sort((a, b) => a.sum - b.sum);
  for (const b of sorted) {
    const stroke = b.accent !== null ? b.accent : DEFAULT_STROKE;
    const begin = fmt((200 + b.sum * 45) / 1000);
    parts.push(`    <g opacity="0">`);
    parts.push(
      `      <animate attributeName="opacity" values="0;1" begin="${begin}s" dur="0.5s" fill="freeze"/>`
    );
    parts.push(`      <polygon points="${b.west}" fill="var(--hw-face-1)" stroke="${stroke}" stroke-width="1"/>`);
    parts.push(`      <polygon points="${b.east}" fill="var(--hw-face-2)" stroke="${stroke}" stroke-width="1"/>`);
    parts.push(`      <polygon points="${b.top}" fill="var(--hw-face-3)" stroke="${stroke}" stroke-width="1"/>`);
    for (const h of b.hatch) {
      parts.push(
        `      <line x1="${fmt(h.x1)}" y1="${fmt(h.y1)}" x2="${fmt(h.x2)}" y2="${fmt(h.y2)}" stroke="var(--hw-stroke-soft)" stroke-width="1"/>`
      );
    }
    for (const led of b.leds) {
      const op = Number((led.opacity * ledDim).toFixed(2));
      const f = flickerById.get(led.id);
      if (f) {
        parts.push(
          `      <circle cx="${fmt(led.cx)}" cy="${fmt(led.cy)}" r="${fmt(led.r)}" fill="var(--led-green)" opacity="${op}">` +
            `<animate attributeName="opacity" values="${op};${flickerDip};${op};${op}" begin="${fmt(f.begin)}s" dur="${fmt(f.dur)}s" repeatCount="indefinite"/>` +
            `</circle>`
        );
      } else {
        parts.push(
          `      <circle cx="${fmt(led.cx)}" cy="${fmt(led.cy)}" r="${fmt(led.r)}" fill="var(--led-green)" opacity="${op}"/>`
        );
      }
    }
    parts.push(`    </g>`);
  }
  parts.push(`  </g>`);

  // the penguin
  parts.push(penguinMarkup(ctx));

  // labels: aisles + always-visible accent pills
  parts.push(`  <g>`);
  for (const a of AISLE_LABELS) {
    parts.push(
      `    <text x="${fmt(a.x)}" y="${fmt(a.y)}" font-size="10" fill="var(--hw-label-dim)">${a.label}</text>`
    );
  }
  for (const b of boxes) {
    if (!b.accent) continue; // only accent boxes' labels are always visible
    parts.push(`    <g>`);
    parts.push(
      `      <rect x="${fmt(b.labelX - b.labelW / 2)}" y="${fmt(b.labelY - 10)}" width="${fmt(b.labelW)}" height="13" rx="6.5" fill="var(--muted)" fill-opacity="0.85" stroke="var(--border)" stroke-width="1"/>`
    );
    parts.push(
      `      <text x="${fmt(b.labelX)}" y="${fmt(b.labelY)}" text-anchor="middle" font-size="10" fill="${b.accent}">${esc(b.name)}</text>`
    );
    parts.push(`    </g>`);
  }
  parts.push(`  </g>`);

  const body = parts.join("\n");
  if (/undefined|NaN|\[object/.test(body)) throw new Error("s1: bad token in output");
  return { body, defs: "" };
}
