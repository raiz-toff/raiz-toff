// lab/scenes/bench.mjs — scene s6: "the bench" (isometric hypervisor slab).
// Faithful port of the story-05-bench generator (itself a port of iso-lab.tsx).
// Geometry is fixed and fully deterministic; the only ctx-driven dynamic is
// the number of packets riding the ground traces (scales with load).

export const KEY = "s6";
export const VIEWBOX = "0 0 900 320";
export const TITLE = "05 · the bench";

// ---------------------------------------------------------------------------
// projection helpers (ported verbatim)
// ---------------------------------------------------------------------------

// 2:1-ish isometric projection.
const iso = (x, y, z) => [(x - y) * 0.866, (x + y) * 0.5 - z];

const pts = (list) => list.map(([a, b]) => `${a.toFixed(1)},${b.toFixed(1)}`).join(" ");

// Visible faces of an axis-aligned box sitting at (x, y, z).
function box(x, y, z, w, d, h) {
  const top = pts([
    iso(x, y, z + h),
    iso(x + w, y, z + h),
    iso(x + w, y + d, z + h),
    iso(x, y + d, z + h),
  ]);
  const right = pts([
    iso(x + w, y, z + h),
    iso(x + w, y + d, z + h),
    iso(x + w, y + d, z),
    iso(x + w, y, z),
  ]);
  const front = pts([
    iso(x, y + d, z + h),
    iso(x + w, y + d, z + h),
    iso(x + w, y + d, z),
    iso(x, y + d, z),
  ]);
  return { top, right, front };
}

function isoBox({ x, y, z, w, d, h, hatchTop = false, wireframe = false }) {
  const f = box(x, y, z, w, d, h);
  if (wireframe) {
    return [
      `<g fill="none" stroke="var(--border)" stroke-dasharray="3 3">`,
      `  <polygon points="${f.top}"/>`,
      `  <polygon points="${f.right}"/>`,
      `  <polygon points="${f.front}"/>`,
      `</g>`,
    ].join("\n");
  }
  const lines = [
    `<g stroke="var(--ring)" stroke-width="1" stroke-linejoin="round">`,
    `  <polygon points="${f.front}" fill="var(--muted)"/>`,
    `  <polygon points="${f.right}" fill="var(--background)"/>`,
    `  <polygon points="${f.top}" fill="var(--background)"/>`,
  ];
  if (hatchTop) lines.push(`  <polygon points="${f.top}" fill="url(#${KEY}_iso-hatch)" stroke="none"/>`);
  lines.push(`</g>`);
  return lines.join("\n");
}

// A dashed trace along the ground plane (z = 0).
function tracePath(points) {
  return points
    .map(([x, y], i) => {
      const [sx, sy] = iso(x, y, 0);
      return `${i === 0 ? "M" : "L"} ${sx.toFixed(1)} ${sy.toFixed(1)}`;
    })
    .join(" ");
}

const TRACES = [
  // from the slab's right edge, running off to the lower right
  [
    [150, 20],
    [320, 20],
    [320, 140],
    [560, 140],
  ],
  // from the slab's front edge, off to the lower left
  [
    [40, 130],
    [40, 300],
    [-140, 300],
    [-140, 460],
  ],
  // thin service lane heading up-right
  [
    [110, -110],
    [110, -320],
  ],
  // lane to the left horizon
  [
    [-130, 60],
    [-360, 60],
    [-360, -80],
  ],
];

// One packet spec per trace, in the order they light up as load grows.
// First two match the original scene exactly; the extra two are staggered
// so no two packets pulse in phase. All looping (repeatCount indefinite),
// so begins stay relative and the composite leaves them unshifted.
const PACKETS = [
  { trace: 0, dur: 5, begin: 0.4, fill: "var(--led-green)" },
  { trace: 1, dur: 6.5, begin: 2, fill: "var(--led-teal)" },
  { trace: 2, dur: 4.6, begin: 1.3, fill: "var(--led-amber)" },
  { trace: 3, dur: 7.5, begin: 3.1, fill: "var(--led-green)" },
];

// Label anchor computations (ported verbatim from the source JSX expressions).
const label = (isoPt, dx, dy, textContent) => {
  const x = (isoPt[0] + dx).toFixed(1);
  const y = (isoPt[1] + dy).toFixed(1);
  return `    <text x="${x}" y="${y}">${textContent}</text>`;
};

const indent = (str, n) =>
  str
    .split("\n")
    .map((l) => " ".repeat(n) + l)
    .join("\n");

// ---------------------------------------------------------------------------
// scene interface
// ---------------------------------------------------------------------------

export function caption(ctx) {
  return ctx.night
    ? "night on the bench: the vms keep trading packets while toronto sleeps"
    : "there is no facility. one hypervisor in toronto, carrying the whole dream";
}

export function render(ctx) {
  const load = Number.isFinite(ctx.load) ? Math.min(1, Math.max(0, ctx.load)) : 0.4;
  const packetCount = Math.min(TRACES.length, Math.max(1, 1 + Math.round(load * 3)));

  const parts = [];
  parts.push(`<g transform="translate(450 175)">`);

  // ground traces first, so everything sits on top
  parts.push(`  <g fill="none" stroke="var(--border)">`);
  for (const t of TRACES) {
    parts.push(`    <path d="${tracePath(t)}" stroke-dasharray="4 4"/>`);
  }
  parts.push(`  </g>`);

  // packets riding the traces — count scales with load (1..4)
  for (const p of PACKETS.slice(0, packetCount)) {
    parts.push(`  <circle r="2.5" opacity="0" fill="${p.fill}">
    <animateMotion dur="${p.dur}s" begin="${p.begin}s" repeatCount="indefinite" path="${tracePath(TRACES[p.trace])}"/>
    <set attributeName="opacity" to="1" begin="${p.begin}s"/>
  </circle>`);
  }

  // background wireframes — unbuilt zones
  parts.push(indent(isoBox({ x: -320, y: -190, z: 0, w: 90, d: 90, h: 44, wireframe: true }), 2));
  parts.push(indent(isoBox({ x: 190, y: -230, z: 0, w: 70, d: 70, h: 110, wireframe: true }), 2));

  // the hypervisor slab
  parts.push(indent(isoBox({ x: -130, y: -110, z: 0, w: 280, d: 240, h: 16, hatchTop: true }), 2));

  // VM blocks on the slab
  parts.push(indent(isoBox({ x: -100, y: -80, z: 16, w: 80, d: 80, h: 52 }), 2));
  parts.push(indent(isoBox({ x: 10, y: -90, z: 16, w: 64, d: 64, h: 84 }), 2));
  parts.push(indent(isoBox({ x: -70, y: 30, z: 16, w: 110, d: 70, h: 30, hatchTop: true }), 2));
  parts.push(indent(isoBox({ x: 62, y: 10, z: 16, w: 50, d: 50, h: 40 }), 2));

  // labels with leader ticks
  parts.push(`  <g font-size="9" fill="var(--muted-foreground)">`);
  parts.push(label(iso(-130, 140, 0), -6, 14, "pve-01 // type-1"));
  parts.push(label(iso(74, -90, 100), 10, -6, "eve-ng"));
  parts.push(label(iso(-100, -80, 68), -52, -10, "cml"));
  parts.push(label(iso(-70, 100, 46), -66, 4, "gitlab"));
  parts.push(`  </g>`);

  parts.push(`</g>`);

  const defs = `<pattern id="${KEY}_iso-hatch" width="7" height="7" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
  <line x1="0" y1="0" x2="0" y2="7" stroke="var(--line)" stroke-width="2"/>
</pattern>`;

  return { body: parts.join("\n"), defs };
}
