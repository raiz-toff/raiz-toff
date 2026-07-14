// lab/scenes/rack.mjs — scene 3: the rack.
// Two patch panels on the diagonal joined by a dark fiber run, plus a 1U switch.
// Port of scratchpad story-03-rack/generate.js (itself a port of crossover-rack.tsx).
// Dynamics: load scales the switch LED blink durations (dur_base * (1.4 - 0.8*load)).

export const KEY = "s3";
export const VIEWBOX = "0 0 640 396";
export const TITLE = "03 · the rack";

const GREEN = "#22c55e";
const ORANGE = "#f97316";
const BLUE = "#3b82f6";
const BROWN = "#9a6b3f";
const WHITE = "#e8e8e8";

// T568A and T568B pinouts, index 0 = pin 1.
const PINS_568A = [
  { color: GREEN, striped: true },
  { color: GREEN, striped: false },
  { color: ORANGE, striped: true },
  { color: BLUE, striped: false },
  { color: BLUE, striped: true },
  { color: ORANGE, striped: false },
  { color: BROWN, striped: true },
  { color: BROWN, striped: false },
];

const PINS_568B = [
  { color: ORANGE, striped: true },
  { color: ORANGE, striped: false },
  { color: GREEN, striped: true },
  { color: BLUE, striped: false },
  { color: BLUE, striped: true },
  { color: GREEN, striped: false },
  { color: BROWN, striped: true },
  { color: BROWN, striped: false },
];

const fmt = (n) => String(+n.toFixed(3));

function cxOf(x0, i) {
  return x0 + i * 19 + (i >= 6 ? 5 : 0) + 7.5;
}

// 12 keystone ports for a patch panel row.
function ports(x0, y0, notchTop) {
  const out = [];
  for (let i = 0; i < 12; i++) {
    const x = x0 + i * 19 + (i >= 6 ? 5 : 0);
    out.push(
      `  <g>`,
      `    <rect x="${x}" y="${y0}" width="15" height="22" rx="2.5" fill="var(--hw-well)" stroke="var(--hw-stroke)"/>`,
      `    <rect x="${x + 4.5}" y="${notchTop ? y0 + 1 : y0 + 18}" width="6" height="3" fill="var(--hw-stroke-strong)"/>`,
      `  </g>`
    );
  }
  return out.join("\n");
}

// Band A: 8 cables exiting up from panel A's ports, curving left off-canvas.
const BAND_A = PINS_568A.map((_, j) => {
  const pin = 7 - j;
  const cx = cxOf(60, j + 2);
  const y = 14 + pin * 7;
  const wire = PINS_568A[pin];
  const d = `M ${cx} 108 V ${y + 26} A 26 26 0 0 0 ${cx - 26} ${y} H -4`;
  return { ...wire, j, cx, d, bootY: 104 };
});

// Band B: 8 cables exiting down from panel B's ports, curving right off-canvas.
const BAND_B = PINS_568B.map((_, j) => {
  const pin = 7 - j;
  const cx = cxOf(356, j + 2);
  const y = 336 + pin * 7;
  const wire = PINS_568B[pin];
  const d = `M ${cx} 274 V ${y - 26} A 26 26 0 0 0 ${cx + 26} ${y} H 644`;
  return { ...wire, j, cx, d, bootY: 258 };
});

const SWITCH_LIT = new Set([0, 2, 4, 5, 7]);
const SWITCH_BLINKING = new Set([2, 5]);
const BLINK_VALUES = {
  2: "1;0.15;1;1;0.15;1",
  5: "1;1;0.15;1;0.15;1",
};
const BLINK_BASE_DUR = { 2: 0.9, 5: 1.3 };

function cableBand(cables, baseDelay) {
  return cables
    .map((cable) => {
      const begin = fmt(baseDelay + cable.j * 0.1);
      const lines = [
        `  <g opacity="0">`,
        `    <animate attributeName="opacity" from="0" to="1" dur="0.01s" begin="${begin}s" fill="freeze"/>`,
        `    <rect x="${cable.cx - 4}" y="${cable.bootY}" width="8" height="17" rx="1.5" fill="${cable.color}"/>`,
        `    <path d="${cable.d}" fill="none" stroke="${cable.color}" stroke-width="4"/>`,
      ];
      if (cable.striped) {
        lines.push(
          `    <path d="${cable.d}" fill="none" stroke="${WHITE}" stroke-width="4" stroke-dasharray="4 9"/>`
        );
      }
      lines.push(`  </g>`);
      return lines.join("\n");
    })
    .join("\n");
}

// Switch port row (starts clear of the "SW-01" label so the text never clips).
// Blink durations scale with load: busier week, faster activity LEDs.
function switchPorts(load) {
  const durScale = 1.4 - 0.8 * Math.min(1, Math.max(0, load));
  const out = [];
  for (let i = 0; i < 8; i++) {
    const x = 482 + i * 15;
    const led = [];
    if (SWITCH_LIT.has(i) && !SWITCH_BLINKING.has(i)) {
      led.push(
        `      <animate attributeName="opacity" from="0" to="1" dur="0.01s" begin="3.6s" fill="freeze"/>`
      );
    }
    if (SWITCH_BLINKING.has(i)) {
      const dur = fmt(BLINK_BASE_DUR[i] * durScale);
      led.push(
        `      <animate attributeName="opacity" values="${BLINK_VALUES[i]}" dur="${dur}s" begin="3.6s" repeatCount="indefinite"/>`
      );
    }
    out.push(
      `  <g>`,
      `    <rect x="${x}" y="60" width="11" height="9" rx="1.5" fill="var(--hw-well)" stroke="var(--hw-stroke)"/>`,
      led.length
        ? `    <circle cx="${x + 5.5}" cy="55" r="1.7" fill="var(--led-green)" opacity="0">\n${led.join("\n")}\n    </circle>`
        : `    <circle cx="${x + 5.5}" cy="55" r="1.7" fill="var(--led-green)" opacity="0"/>`,
      `  </g>`
    );
  }
  return out.join("\n");
}

export function caption(ctx) {
  return ctx.night
    ? "night shift: the crossover holds in the dark, blink by patient blink"
    : "t568a up top, t568b below, one dark fiber between";
}

export function render(ctx) {
  const load = typeof ctx.load === "number" ? ctx.load : 0.4;

  const body = `  <!-- background: dashed rail stubs grounding each panel in an implied rack,
       plus dashed continuations running off-canvas. Panel A's right rail is
       omitted: the dark fiber exits through that spot. -->
  <g fill="none">
    <line x1="32" y1="96" x2="32" y2="172" stroke="var(--hw-stroke-soft)" stroke-dasharray="3 3"/>
    <line x1="332" y1="216" x2="332" y2="292" stroke="var(--hw-stroke-soft)" stroke-dasharray="3 3"/>
    <line x1="608" y1="216" x2="608" y2="292" stroke="var(--hw-stroke-soft)" stroke-dasharray="3 3"/>
    <path d="M 32 134 H -8" stroke="var(--border)" stroke-dasharray="4 4"/>
    <path d="M 608 254 H 648" stroke="var(--border)" stroke-dasharray="4 4"/>
    <path d="M 624 64 H 648" stroke="var(--border)" stroke-dasharray="4 4"/>
  </g>

  <!-- band A: 8 cables exiting up from panel A, sweeping left off-canvas -->
${cableBand(BAND_A, 0.3)}

  <!-- panel A - 568A -->
  <rect x="40" y="112" width="260" height="44" rx="4" fill="var(--hw-face-3)" stroke="var(--hw-stroke)"/>
  <circle cx="48" cy="122" r="2.5" fill="var(--hw-well)" stroke="var(--hw-stroke-strong)"/>
  <circle cx="48" cy="146" r="2.5" fill="var(--hw-well)" stroke="var(--hw-stroke-strong)"/>
  <circle cx="293" cy="122" r="2.5" fill="var(--hw-well)" stroke="var(--hw-stroke-strong)"/>
  <circle cx="293" cy="146" r="2.5" fill="var(--hw-well)" stroke="var(--hw-stroke-strong)"/>
  <text x="42" y="176" font-size="11" fill="var(--hw-label)" letter-spacing="1.5">T568A</text>
${ports(60, 122, true)}

  <!-- switch - SW-01 -->
  <rect x="420" y="48" width="196" height="32" rx="4" fill="var(--hw-face-3)" stroke="var(--hw-stroke)"/>
  <circle cx="428" cy="56" r="2" fill="var(--hw-well)" stroke="var(--hw-stroke-strong)"/>
  <circle cx="428" cy="72" r="2" fill="var(--hw-well)" stroke="var(--hw-stroke-strong)"/>
  <circle cx="608" cy="56" r="2" fill="var(--hw-well)" stroke="var(--hw-stroke-strong)"/>
  <circle cx="608" cy="72" r="2" fill="var(--hw-well)" stroke="var(--hw-stroke-strong)"/>
  <text x="438" y="69" font-size="11" fill="var(--hw-label)" letter-spacing="1">SW-01</text>
${switchPorts(load)}

  <!-- uplink: switch port 7 down into panel B -->
  <g opacity="0">
    <animate attributeName="opacity" from="0" to="1" dur="0.5s" begin="2.4s" fill="freeze"/>
    <rect x="556" y="78" width="8" height="13" rx="1.5" fill="var(--hw-stroke-strong)"/>
    <line x1="560" y1="90" x2="560" y2="226" stroke="var(--hw-cable)" stroke-width="3"/>
    <rect x="556" y="222" width="8" height="12" rx="1.5" fill="var(--hw-stroke-strong)"/>
  </g>

  <!-- dark fiber, panel A to panel B, with a service loop -->
  <rect x="296" y="129" width="12" height="9" rx="1.5" fill="var(--hw-label)" opacity="0">
    <animate attributeName="opacity" from="0" to="1" dur="0.01s" begin="1.3s" fill="freeze"/>
  </rect>
  <path d="M 308 134 C 330 134, 346 142, 352 156 C 357 168, 355 186, 362 202 C 369 218, 358 238, 346 250" fill="none" stroke="var(--hw-cable)" stroke-width="3" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1">
    <animate attributeName="stroke-dashoffset" from="1" to="0" dur="0.9s" begin="1.3s" fill="freeze" calcMode="spline" keySplines="0.22 1 0.36 1"/>
  </path>
  <circle cx="374" cy="180" r="15" fill="none" stroke="var(--hw-cable)" stroke-width="3" opacity="0">
    <animate attributeName="opacity" from="0" to="1" dur="0.4s" begin="2.2s" fill="freeze"/>
  </circle>
  <circle cx="374" cy="180" r="10" fill="none" stroke="var(--hw-cable)" stroke-width="3" opacity="0">
    <animate attributeName="opacity" from="0" to="1" dur="0.4s" begin="2.2s" fill="freeze"/>
  </circle>
  <rect x="340" y="248" width="9" height="12" rx="1.5" fill="var(--hw-label)" opacity="0">
    <animate attributeName="opacity" from="0" to="1" dur="0.01s" begin="2.2s" fill="freeze"/>
  </rect>
  <text x="404" y="184" font-size="11" fill="var(--hw-label-dim)" font-style="italic" opacity="0">dark fiber<animate attributeName="opacity" from="0" to="1" dur="0.01s" begin="2.2s" fill="freeze"/></text>

  <!-- panel B - 568B -->
  <rect x="340" y="232" width="260" height="44" rx="4" fill="var(--hw-face-3)" stroke="var(--hw-stroke)"/>
  <circle cx="348" cy="242" r="2.5" fill="var(--hw-well)" stroke="var(--hw-stroke-strong)"/>
  <circle cx="348" cy="266" r="2.5" fill="var(--hw-well)" stroke="var(--hw-stroke-strong)"/>
  <circle cx="593" cy="242" r="2.5" fill="var(--hw-well)" stroke="var(--hw-stroke-strong)"/>
  <circle cx="593" cy="266" r="2.5" fill="var(--hw-well)" stroke="var(--hw-stroke-strong)"/>
  <text x="598" y="296" font-size="11" fill="var(--hw-label)" letter-spacing="1.5" text-anchor="end">T568B</text>
${ports(356, 242, false)}

  <!-- band B: 8 cables exiting down from panel B, sweeping right off-canvas -->
${cableBand(BAND_B, 2.7)}`;

  return { body, defs: "" };
}
