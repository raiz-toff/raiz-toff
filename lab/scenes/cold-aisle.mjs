// lab/scenes/cold-aisle.mjs — scene 02 · the cold aisle
// Port of the story-02-cold-aisle generator into the living-lab scene module
// interface. Geometry is carried over verbatim; dynamics parameterized:
//   - night   → aisle light fixtures at fill-opacity 0.25 (floor grid unchanged)
//   - load    → number of flickering green LEDs = round(3 + load*8)
//   - cracDuty→ 3 dashed airflow lines down the aisle center,
//               stroke-dashoffset loop with dur = (3.5 - 2*cracDuty)s
// Deterministic: seeded mulberry32 PRNG re-seeded on every render() call.
// No ids are emitted; all animations loop (repeatCount="indefinite"), so the
// composite's begin-shifting never touches this scene.

export const KEY = "s2";
export const VIEWBOX = "0 0 640 410";
export const TITLE = "02 · the cold aisle";

export function caption(ctx) {
  return ctx.night
    ? "night shift: even an imaginary aisle runs colder after dark"
    : "still imaginary, but the physics is right";
}

// ── deterministic PRNG for the LED brightness jitter (verbatim port) ───────
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

const VPX = 320;

// ── raised floor tiles ──────────────────────────────────────────────────
const TILE_RADIAL_X = [72, 148, 224, 296, 344, 416, 492, 568];
const FLOOR_RADIAL = TILE_RADIAL_X.map((xb) => ({
  x1: xb,
  y1: 404,
  x2: VPX + (xb - VPX) * (27 / 219),
  y2: 212,
}));

const TILE_RING_U = [0.05, 0.12, 0.21, 0.33, 0.48, 0.67, 0.9];
const FLOOR_RINGS = TILE_RING_U.map((u) => {
  const y = 212 + 192 * u;
  const hw = 26 + 254 * ((y - 212) / 192);
  return { x1: VPX - hw, y1: y, x2: VPX + hw, y2: y };
});

// ── ceiling ladder-rack trays ───────────────────────────────────────────
const TRAY_RUNG_T = [0.1, 0.22, 0.36, 0.52, 0.68, 0.84, 0.97];

function buildTray(outer1, outer2, inner1, inner2) {
  const rungs = TRAY_RUNG_T.map((t) => ({
    x1: outer1[0] + (outer2[0] - outer1[0]) * t,
    y1: outer1[1] + (outer2[1] - outer1[1]) * t,
    x2: inner1[0] + (inner2[0] - inner1[0]) * t,
    y2: inner1[1] + (inner2[1] - inner1[1]) * t,
  }));
  return {
    outer: { x1: outer1[0], y1: outer1[1], x2: outer2[0], y2: outer2[1] },
    inner: { x1: inner1[0], y1: inner1[1], x2: inner2[0], y2: inner2[1] },
    rungs,
  };
}
const TRAY_LEFT = buildTray([150, 6], [304, 172], [196, 6], [309, 172]);
const TRAY_RIGHT = buildTray([490, 6], [336, 172], [444, 6], [331, 172]);

// ── aisle light fixtures: [y, width, height], nearest (biggest) first ────
const AISLE_LIGHTS = [
  [40, 44, 4],
  [98, 30, 3.2],
  [136, 20, 2.4],
  [160, 13, 1.8],
];

// ── rack depth layers ───────────────────────────────────────────────────
function depthFill(s) {
  return `color-mix(in oklab, var(--hw-face-3) ${Math.round(s * 100)}%, var(--hw-well))`;
}
function depthStroke(s) {
  return `color-mix(in oklab, var(--hw-stroke) ${Math.round(s * 100)}%, var(--hw-stroke-soft))`;
}

const DEPTHS = [
  { s: 0.31, layer: "pfar" },
  { s: 0.41, layer: "pfar" },
  { s: 0.55, layer: "pmid" },
  { s: 0.74, layer: "pmid" },
  { s: 1.0, layer: "pnear" },
].map((d) => ({ ...d, f: depthFill(d.s), st: depthStroke(d.s) }));

// ── flicker pool: ordered, deterministic; first 8 match the shipped SVG ──
// LED id ranges: pfar racks 0-3 -> ids 0-47, pmid racks 4-7 -> 48-95,
// pnear racks 8-9 -> 96-119. Amber ids 54 and 114 are never in the pool.
const FLICKER_POOL = [
  [7, "3.1s", "0s"],
  [26, "4.3s", "0.8s"],
  [41, "2.7s", "1.5s"],
  [50, "5.2s", "0.4s"],
  [69, "3.7s", "2.2s"],
  [88, "4.9s", "1.1s"],
  [99, "3.4s", "2.9s"],
  [112, "5.8s", "0.6s"],
  [15, "4.6s", "1.9s"],
  [77, "3.9s", "0.2s"],
  [104, "5.5s", "2.5s"],
];

// ── serialization helpers ───────────────────────────────────────────────
const fmt = (n) => {
  const r = Math.round(n * 100) / 100;
  const v = Object.is(r, -0) ? 0 : r;
  return String(v);
};
const lineAttrs = (l) =>
  `x1="${fmt(l.x1)}" y1="${fmt(l.y1)}" x2="${fmt(l.x2)}" y2="${fmt(l.y2)}"`;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// ── ambient camera drift (looping; composite leaves begins untouched) ────
function driftMarkup(k) {
  const ax = fmt((8 * k) / 13);
  const ay = fmt((3 * k) / 13);
  return `<animateTransform attributeName="transform" type="translate" values="0 0; -${ax} -${ay}; 0 0; ${ax} ${ay}; 0 0" keyTimes="0;0.25;0.5;0.75;1" calcMode="spline" keySplines="0.42 0 0.58 1;0.42 0 0.58 1;0.42 0 0.58 1;0.42 0 0.58 1" dur="28s" repeatCount="indefinite"/>`;
}

// ── scene render ────────────────────────────────────────────────────────
export function render(ctx) {
  const night = !!ctx.night;
  const load = clamp(Number(ctx.load) || 0, 0, 1);
  const cracDuty = clamp(Number(ctx.cracDuty) || 0, 0, 1);

  // per-render mutable state (keeps render deterministic + re-entrant)
  const rand = mulberry32(1337);
  let nextLedId = 0;
  let amberBudget = 2;

  function buildRack(side, s, fill, stroke, amberHere) {
    const w = 95 * s;
    const x = side === "L" ? VPX - 305 * s : VPX + 210 * s;
    const y = 185 - 160 * s;
    const h = 370 * s;

    const groups = [];
    for (let gi = 0; gi < 3; gi++) {
      const gy = y + h * (0.1 + gi * 0.29);
      const gh = h * 0.17;
      const leds = [];
      for (let li = 0; li < 4; li++) {
        const lx = x + w * (0.2 + li * 0.19);
        const ly = gy + gh * 0.32;
        const isAmber = amberHere && gi === 1 && li === 2 && amberBudget > 0;
        if (isAmber) amberBudget--;
        leds.push({
          id: nextLedId++,
          cx: lx,
          cy: ly,
          r: Math.max(2.1 * s, 0.9),
          fill: isAmber ? "var(--led-amber)" : "var(--led-green)",
          opacity: isAmber ? 1 : Number((0.5 + rand() * 0.5).toFixed(2)),
          flicker: !isAmber,
        });
      }
      groups.push({
        rectX: x + 3 * s,
        rectY: gy,
        rectW: w - 6 * s,
        rectH: gh,
        seamX1: x + 6 * s,
        seamY: gy + gh * 0.68,
        seamX2: x + w - 6 * s,
        leds,
      });
    }
    return { x, y, w, h, fill, stroke, groups };
  }

  const racks = [];
  DEPTHS.forEach((d, i) => {
    racks.push({ layer: d.layer, data: buildRack("L", d.s, d.f, d.st, i === 2) });
    racks.push({ layer: d.layer, data: buildRack("R", d.s, d.f, d.st, i === 4) });
  });

  // load-scaled flicker: round(3 + load*8) green LEDs, drawn from the pool
  const flickerCount = clamp(Math.round(3 + load * 8), 0, FLICKER_POOL.length);
  const flicker = new Map(
    FLICKER_POOL.slice(0, flickerCount).map(([id, dur, begin]) => [id, { dur, begin }])
  );

  function ledMarkup(led) {
    const base = `<circle cx="${fmt(led.cx)}" cy="${fmt(led.cy)}" r="${fmt(led.r)}" style="fill:${led.fill}" opacity="${led.opacity}"`;
    const fl = flicker.get(led.id);
    if (led.flicker && fl) {
      const o = led.opacity;
      return (
        base +
        `><animate attributeName="opacity" values="${o};${o};0.15;${o}" keyTimes="0;0.86;0.92;1" dur="${fl.dur}" begin="${fl.begin}" repeatCount="indefinite"/></circle>`
      );
    }
    return base + "/>";
  }

  function rackMarkup(data) {
    const parts = [];
    parts.push(
      `<rect x="${fmt(data.x)}" y="${fmt(data.y)}" width="${fmt(data.w)}" height="${fmt(data.h)}" rx="${fmt(data.w * 0.015)}" style="fill:${data.fill};stroke:${data.stroke}" stroke-width="1"/>`
    );
    for (const g of data.groups) {
      parts.push("<g>");
      parts.push(
        `<rect x="${fmt(g.rectX)}" y="${fmt(g.rectY)}" width="${fmt(g.rectW)}" height="${fmt(g.rectH)}" rx="${fmt(data.w * 0.02)}" style="fill:var(--hw-well)"/>`
      );
      parts.push(
        `<line x1="${fmt(g.seamX1)}" y1="${fmt(g.seamY)}" x2="${fmt(g.seamX2)}" y2="${fmt(g.seamY)}" style="stroke:var(--hw-stroke-soft)" stroke-width="1"/>`
      );
      for (const led of g.leds) parts.push(ledMarkup(led));
      parts.push("</g>");
    }
    return parts.join("\n");
  }

  // cracDuty airflow: 3 short dashed lines down the aisle center, converging
  // toward the vanishing point; dash period 14, seamless full-period loop.
  const airDur = fmt(3.5 - 2 * cracDuty);
  const AIR_Y1 = 236;
  const AIR_Y2 = 396;
  const halfW = (y) => 26 + 254 * ((y - 212) / 192);
  const airLines = [-30, 0, 30].map((o, i) => {
    const f = o / halfW(AIR_Y2);
    const x1 = VPX + f * halfW(AIR_Y1);
    const x2 = VPX + o;
    const start = 14 + (i * 14) / 3; // phase stagger, still a full period span
    return (
      `<line x1="${fmt(x1)}" y1="${AIR_Y1}" x2="${fmt(x2)}" y2="${AIR_Y2}" style="stroke:var(--led-teal)" stroke-width="1.4" stroke-linecap="round" stroke-dasharray="4 10" opacity="0.5">` +
      `<animate attributeName="stroke-dashoffset" values="${fmt(start)};${fmt(start - 14)}" dur="${airDur}s" begin="0s" repeatCount="indefinite"/>` +
      `</line>`
    );
  });

  const out = [];

  // floor layer (k=6)
  out.push("<g>");
  out.push(driftMarkup(6));
  out.push(`<polygon points="40,404 600,404 346,212 294,212" style="fill:var(--hw-well)"/>`);
  for (const l of FLOOR_RADIAL)
    out.push(`<line ${lineAttrs(l)} style="stroke:var(--hw-stroke-soft)" stroke-width="1"/>`);
  for (const l of FLOOR_RINGS)
    out.push(`<line ${lineAttrs(l)} style="stroke:var(--hw-stroke-soft)" stroke-width="1"/>`);
  for (const a of airLines) out.push(a);
  out.push("</g>");

  // ceiling layer (k=6); aisle lights dim to 0.25 at night
  out.push("<g>");
  out.push(driftMarkup(6));
  for (const tray of [TRAY_LEFT, TRAY_RIGHT]) {
    out.push(`<line ${lineAttrs(tray.outer)} style="stroke:var(--hw-stroke)" stroke-width="1.5"/>`);
    out.push(`<line ${lineAttrs(tray.inner)} style="stroke:var(--hw-stroke)" stroke-width="1.5"/>`);
    for (const r of tray.rungs)
      out.push(`<line ${lineAttrs(r)} style="stroke:var(--hw-stroke-soft)" stroke-width="1.2"/>`);
  }
  const lightOpacity = night ? ` fill-opacity="0.25"` : "";
  for (const [ly, w, h] of AISLE_LIGHTS)
    out.push(
      `<rect x="${fmt(VPX - w / 2)}" y="${fmt(ly)}" width="${fmt(w)}" height="${fmt(h)}" rx="1" style="fill:var(--hw-face-2)"${lightOpacity}/>`
    );
  out.push("</g>");

  // rack depth layers: far (k=3), mid (k=7), near (k=13)
  for (const [layer, k] of [
    ["pfar", 3],
    ["pmid", 7],
    ["pnear", 13],
  ]) {
    out.push("<g>");
    out.push(driftMarkup(k));
    for (const r of racks.filter((r) => r.layer === layer)) out.push(rackMarkup(r.data));
    out.push("</g>");
  }

  return { body: out.join("\n"), defs: "" };
}
