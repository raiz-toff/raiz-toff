// lab/scenes/far-end.mjs — scene s5 · "04b · the far end"
// Static port of the dual-patch-panel generator (story-04b-far-end/generate.js,
// itself a faithful port of dual-patch-panel.tsx). Emits {body, defs} inner
// markup only; the composite owns the <svg> shell and the shared <style>.
// Deterministic: no randomness, geometry is fully fixed. One-shot reveal
// animates use fill="freeze" with numeric begins relative to scene start (0);
// LED blinks loop with repeatCount="indefinite" and are left unshifted.

export const KEY = 's5';
export const VIEWBOX = '0 0 1300 460';
export const TITLE = '04b · the far end';

const PORT_COUNT = 24;
const PORT_W = 16;
const PORT_H = 22;
const PORT_TOP = 54;
const PANEL_TOP = 44;
const PANEL_H = 44;

function portX(i) {
  return 64 + i * 20 + Math.floor(i / 6) * 6;
}

// T568B: pins 1–8 = o/w, o, g/w, b, b/w, g, br/w, br.
// Wire-jacket hexes stay literal per the palette contract.
const WIRES_568B = [
  { color: '#f97316', striped: true },
  { color: '#f97316', striped: false },
  { color: '#22c55e', striped: true },
  { color: '#3b82f6', striped: false },
  { color: '#3b82f6', striped: true },
  { color: '#22c55e', striped: false },
  { color: '#9a6b3f', striped: true },
  { color: '#9a6b3f', striped: false },
];

// T568A: same as 568B but the orange and green pairs swap (pins 1,2,3,6).
const WIRES_568A = [
  { color: '#22c55e', striped: true },
  { color: '#22c55e', striped: false },
  { color: '#f97316', striped: true },
  { color: '#3b82f6', striped: false },
  { color: '#3b82f6', striped: true },
  { color: '#f97316', striped: false },
  { color: '#9a6b3f', striped: true },
  { color: '#9a6b3f', striped: false },
];

const BLINKING = new Set([1, 4, 6]);
const BLINK_VALUES = ['1;0.2;1;1;0.2;1', '1;1;0.2;1;0.2;1', '1;0.2;1;0.3;1;1'];

const PORTS = Array.from({ length: PORT_COUNT }, (_, i) => portX(i));
const CABLE_START = 8;

// One panel's worth of art, local coordinate system (bottom-exit, left-sweep).
// The caller reflects this through a transform for the other orientations.
function panelArt(wires, blinkStart) {
  const cables = wires.map((wire, k) => {
    const portIndex = CABLE_START + k;
    const cx = portX(portIndex) + 8;
    const landingY = 150 + k * 7;
    const path = `M ${cx} 80 V ${landingY - 26} A 26 26 0 0 1 ${cx - 26} ${landingY} H -4`;
    return { ...wire, k, cx, path };
  });

  const parts = [];

  parts.push(
    `<rect x="24" y="${PANEL_TOP}" width="592" height="${PANEL_H}" rx="4" fill="var(--hw-face-3)" stroke="var(--hw-stroke)"/>`
  );
  parts.push(`<circle cx="34" cy="54" r="2.5" fill="var(--hw-well)" stroke="var(--hw-stroke-strong)"/>`);
  parts.push(`<circle cx="34" cy="78" r="2.5" fill="var(--hw-well)" stroke="var(--hw-stroke-strong)"/>`);
  parts.push(`<circle cx="606" cy="54" r="2.5" fill="var(--hw-well)" stroke="var(--hw-stroke-strong)"/>`);
  parts.push(`<circle cx="606" cy="78" r="2.5" fill="var(--hw-well)" stroke="var(--hw-stroke-strong)"/>`);

  for (const x of PORTS) {
    parts.push(
      `<g>` +
        `<rect x="${x}" y="${PORT_TOP}" width="${PORT_W}" height="${PORT_H}" rx="2.5" fill="var(--hw-well)" stroke="var(--hw-stroke)"/>` +
        `<rect x="${x + 5}" y="${PORT_TOP + 17}" width="6" height="3.5" fill="var(--hw-stroke-strong)"/>` +
        `</g>`
    );
  }

  for (const cable of cables) {
    const popIn =
      `<g opacity="0">` +
      `<animate attributeName="opacity" from="0" to="1" dur="0.01s" begin="${(0.3 + cable.k * 0.11).toFixed(2)}s" fill="freeze"/>` +
      `<rect x="${cable.cx - 4}" y="66" width="8" height="15" rx="1.5" fill="${cable.color}"/>` +
      `<path d="${cable.path}" fill="none" stroke="${cable.color}" stroke-width="4"/>` +
      (cable.striped
        ? `<path d="${cable.path}" fill="none" stroke="#e8e8e8" stroke-width="4" stroke-dasharray="4 9"/>`
        : ``) +
      `</g>`;

    const blink = BLINKING.has(cable.k)
      ? `<animate attributeName="opacity" values="${BLINK_VALUES[cable.k % BLINK_VALUES.length]}" dur="${(
          1.3 + (cable.k % 3) * 0.35
        ).toFixed(2)}s" begin="${(blinkStart + cable.k * 0.2).toFixed(1)}s" repeatCount="indefinite"/>`
      : ``;

    const led = blink
      ? `<circle cx="${cable.cx}" cy="49.5" r="2" fill="var(--led-green)">${blink}</circle>`
      : `<circle cx="${cable.cx}" cy="49.5" r="2" fill="var(--led-green)"/>`;

    parts.push(`<g>${popIn}${led}</g>`);
  }

  return parts.join('\n    ');
}

export function caption(ctx) {
  return ctx.night
    ? 'the crossover holds in the dark: orange for green, pair for pair'
    : 'swap the orange and green pairs by hand: a crossover';
}

export function render(ctx) { // eslint-disable-line no-unused-vars -- static scene, ctx only drives the caption
  const body = `<!-- background: dashed rack rails around each panel + an unbuilt 1U per
       rack (below the near end, above the far end). Stroke/dash doubled:
       this viewBox is ~2x the other scenes. -->
  <g fill="none" stroke-width="2">
    <line x1="14" y1="30" x2="14" y2="430" stroke="var(--hw-stroke-soft)" stroke-dasharray="6 6"/>
    <line x1="626" y1="30" x2="626" y2="430" stroke="var(--hw-stroke-soft)" stroke-dasharray="6 6"/>
    <line x1="674" y1="30" x2="674" y2="430" stroke="var(--hw-stroke-soft)" stroke-dasharray="6 6"/>
    <line x1="1286" y1="30" x2="1286" y2="430" stroke="var(--hw-stroke-soft)" stroke-dasharray="6 6"/>
    <rect x="24" y="264" width="592" height="44" rx="4" stroke="var(--border)" stroke-dasharray="6 6"/>
    <rect x="684" y="152" width="592" height="44" rx="4" stroke="var(--border)" stroke-dasharray="6 6"/>
  </g>

  <!-- 568A, left: vertical flip only — cables exit above, still sweep left -->
  <g transform="translate(0,296) scale(1,-1)">
    ${panelArt(WIRES_568A, 1.6)}
  </g>

  <!-- 568B, right: horizontal flip only — stays bottom-exit, sweeps right -->
  <g transform="translate(1300,164) scale(-1,1)">
    ${panelArt(WIRES_568B, 2.0)}
  </g>

  <!-- dark fiber trunk, joining the two panels across the gap -->
  <rect x="609" y="222" width="10" height="16" rx="2" fill="var(--hw-well)" stroke="var(--hw-stroke-strong)"/>
  <rect x="681" y="222" width="10" height="16" rx="2" fill="var(--hw-well)" stroke="var(--hw-stroke-strong)"/>
  <path d="M 619 230 Q 650 248 681 230" fill="none" stroke="var(--hw-cable)" stroke-width="7" stroke-linecap="round"/>
  <path d="M 619 230 Q 650 248 681 230" fill="none" stroke="var(--hw-stroke-strong)" stroke-width="1.5" stroke-dasharray="1 5" stroke-linecap="round"/>

  <text x="608" y="246" font-size="11" fill="var(--hw-label)" text-anchor="end" letter-spacing="1.5">568A</text>
  <text x="1268" y="214" font-size="11" fill="var(--hw-label)" text-anchor="end" letter-spacing="1.5">568B</text>`;

  return { body, defs: '' };
}
