// lab/scenes/layer1.mjs — scene 04 · layer 1
// 24-port patch panel, eight cables landing in T568B color order and
// sweeping off-canvas as a parallel band. Static port of the original
// story-04-layer1 generator (geometry ported faithfully from patch-panel.tsx).
// Palette comes from the composite's shared <style>; wire-jacket hexes stay literal.

export const KEY = 's4';
export const VIEWBOX = '0 0 640 214';
export const TITLE = '04 · layer 1';

const PORT_COUNT = 24;
const PORT_W = 16;
const PORT_H = 22;
const PORT_TOP = 54;
const PANEL_TOP = 44;
const PANEL_H = 44;

// x-position of port i: even spacing, with a small gutter every 6 ports
function portX(i) {
  return 64 + i * 20 + Math.floor(i / 6) * 6;
}

// T568B pinout, pins 1-8. `striped` pairs render a white candy-cane overlay.
const WIRES = [
  { color: '#f97316', striped: true },  // 1 orange-white
  { color: '#f97316', striped: false }, // 2 orange
  { color: '#22c55e', striped: true },  // 3 green-white
  { color: '#3b82f6', striped: false }, // 4 blue
  { color: '#3b82f6', striped: true },  // 5 blue-white
  { color: '#22c55e', striped: false }, // 6 green
  { color: '#9a6b3f', striped: true },  // 7 brown-white
  { color: '#9a6b3f', striped: false }, // 8 brown
];

const BLINKING = new Set([1, 4, 6]);
const BLINK_VALUES = ['1;0.2;1;1;0.2;1', '1;1;0.2;1;0.2;1', '1;0.2;1;0.3;1;1'];

const PORTS = Array.from({ length: PORT_COUNT }, (_, i) => portX(i));

const CABLE_START = 8; // cables land on the middle 8 ports
const CABLES = WIRES.map((wire, k) => {
  const portIndex = CABLE_START + k;
  const cx = portX(portIndex) + 8;
  const landingY = 150 + k * 7;
  const path = `M ${cx} 80 V ${landingY - 26} A 26 26 0 0 1 ${cx - 26} ${landingY} H -4`;
  return { ...wire, k, cx, path };
});

export function caption(ctx) {
  return ctx.night
    ? 'night on layer 1: the abstractions sleep, the copper does not'
    : 'everything above this line is an abstraction';
}

export function render(ctx) {
  const out = [];

  // background: dashed rack rails, an unbuilt 1U above, and a future
  // run sweeping off-canvas
  out.push(`  <g fill="none">
    <line x1="14" y1="0" x2="14" y2="214" stroke="var(--hw-stroke-soft)" stroke-dasharray="3 3"/>
    <line x1="626" y1="0" x2="626" y2="214" stroke="var(--hw-stroke-soft)" stroke-dasharray="3 3"/>
    <rect x="24" y="8" width="592" height="28" rx="4" stroke="var(--border)" stroke-dasharray="3 3"/>
    <path d="M 550 80 V 124 A 26 26 0 0 0 576 150 H 648" stroke="var(--border)" stroke-dasharray="4 4"/>
  </g>`);

  out.push(
    `  <rect x="24" y="${PANEL_TOP}" width="592" height="${PANEL_H}" rx="4" fill="var(--hw-face-3)" stroke="var(--hw-stroke)"/>`
  );
  out.push(`  <circle cx="34" cy="54" r="2.5" fill="var(--hw-well)" stroke="var(--hw-stroke-strong)"/>
  <circle cx="34" cy="78" r="2.5" fill="var(--hw-well)" stroke="var(--hw-stroke-strong)"/>
  <circle cx="606" cy="54" r="2.5" fill="var(--hw-well)" stroke="var(--hw-stroke-strong)"/>
  <circle cx="606" cy="78" r="2.5" fill="var(--hw-well)" stroke="var(--hw-stroke-strong)"/>
  <text x="596" y="82" font-size="11" fill="var(--hw-label)" text-anchor="end" letter-spacing="1.5">T568B</text>`);

  for (const x of PORTS) {
    out.push(`  <g>
    <rect x="${x}" y="${PORT_TOP}" width="${PORT_W}" height="${PORT_H}" rx="2.5" fill="var(--hw-well)" stroke="var(--hw-stroke)"/>
    <rect x="${x + 5}" y="${PORT_TOP + 17}" width="6" height="3.5" fill="var(--hw-stroke-strong)"/>
  </g>`);
  }

  for (const cable of CABLES) {
    const parts = [];
    parts.push(`  <g>`);
    parts.push(`    <g opacity="0">`);
    // One-shot reveal: begin is relative to scene start; the composite
    // shifts it by the slot offset.
    parts.push(
      `      <animate attributeName="opacity" from="0" to="1" dur="0.01s" begin="${(0.3 + cable.k * 0.11).toFixed(2)}s" fill="freeze"/>`
    );
    parts.push(
      `      <rect x="${cable.cx - 4}" y="66" width="8" height="15" rx="1.5" fill="${cable.color}"/>`
    );
    parts.push(
      `      <path d="${cable.path}" fill="none" stroke="${cable.color}" stroke-width="4"/>`
    );
    if (cable.striped) {
      parts.push(
        `      <path d="${cable.path}" fill="none" stroke="#e8e8e8" stroke-width="4" stroke-dasharray="4 9"/>`
      );
    }
    parts.push(`    </g>`);
    if (BLINKING.has(cable.k)) {
      // Looping ambience: repeatCount="indefinite", begin left as-is.
      parts.push(`    <circle cx="${cable.cx}" cy="49.5" r="2" fill="var(--led-green)">
      <animate attributeName="opacity" values="${BLINK_VALUES[cable.k % BLINK_VALUES.length]}" dur="${(1.3 + (cable.k % 3) * 0.35).toFixed(2)}s" begin="${(1.6 + cable.k * 0.2).toFixed(1)}s" repeatCount="indefinite"/>
    </circle>`);
    } else {
      parts.push(`    <circle cx="${cable.cx}" cy="49.5" r="2" fill="var(--led-green)"/>`);
    }
    parts.push(`  </g>`);
    out.push(parts.join('\n'));
  }

  return { body: out.join('\n'), defs: '' };
}
