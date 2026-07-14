// lab/weather.mjs — weather mood, the big HUD panel, and ambient overlay FX.
//
// Pure rendering: given ctx (built by generate.mjs, which already derived
// ctx.weather = { code, mood, tempMood, label } from lab/env.json's
// weatherCode + tempC), produce two independent SVG fragments that composite.mjs
// drops on top of whichever scene is active:
//
//   renderPanel(ctx)   — fixed HUD box, top-right: icon + big temp + condition
//   renderOverlay(ctx) — ambient FX across the whole 640x370 scene canvas
//                        (rain / snow / fog / storm-flash / heat-shimmer / cold-tint)
//
// All ids are prefixed "wx_" (unique within the document; not scene-owned,
// so the per-scene KEY-prefix rule in composite.mjs doesn't apply to these).
// Deterministic by construction — no Math.random(), only index arithmetic —
// so a render is reproducible for a given ctx.

const fmt = (n) => String(+n.toFixed(3));

// ── mood / label derivation (WMO weather codes, Open-Meteo's `weather_code`) ─
const RAIN_CODES = new Set([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82]);
const SNOW_CODES = new Set([71, 73, 75, 77, 85, 86]);
const STORM_CODES = new Set([95, 96, 99]);
const FOG_CODES = new Set([45, 48]);

export function moodFromCode(code) {
  if (code === null || code === undefined || !Number.isInteger(code)) return "clear";
  if (STORM_CODES.has(code)) return "storm";
  if (SNOW_CODES.has(code)) return "snow";
  if (RAIN_CODES.has(code)) return "rain";
  if (FOG_CODES.has(code)) return "fog";
  if (code === 0 || code === 1) return "clear";
  if (code === 2 || code === 3) return "cloudy";
  return "clear";
}

const LABELS = {
  0: "clear skies", 1: "mostly clear", 2: "partly cloudy", 3: "overcast",
  45: "foggy", 48: "rime fog",
  51: "light drizzle", 53: "drizzle", 55: "heavy drizzle",
  56: "freezing drizzle", 57: "freezing drizzle",
  61: "light rain", 63: "rain", 65: "heavy rain",
  66: "freezing rain", 67: "freezing rain",
  71: "light snow", 73: "snow", 75: "heavy snow", 77: "snow grains",
  80: "rain showers", 81: "rain showers", 82: "heavy showers",
  85: "snow showers", 86: "snow showers",
  95: "thunderstorm", 96: "storm + hail", 99: "storm + hail",
};

export function conditionLabel(code) {
  if (code === null || code === undefined) return "toronto weather";
  return LABELS[code] ?? "toronto weather";
}

export function tempMoodFromC(tempC) {
  if (tempC === null || tempC === undefined || !Number.isFinite(Number(tempC))) return "mild";
  const t = Number(tempC);
  if (t >= 28) return "hot";
  if (t <= 0) return "cold";
  return "mild";
}

function tempColorVar(tempMood) {
  if (tempMood === "hot") return "var(--led-amber)";
  if (tempMood === "cold") return "var(--led-teal)";
  return "var(--foreground)";
}

// ── icon (mood-only; temperature is conveyed by the big number's color and
// by the ambient overlay, not by the icon) — drawn in a local ~32x30 box,
// caller wraps in <g transform="translate(x y)"> ──────────────────────────
function cloudPath(fill, opacity) {
  return (
    '<g fill="' + fill + '" opacity="' + opacity + '">' +
    '<circle cx="10" cy="13" r="6.2"/>' +
    '<circle cx="18" cy="9.5" r="7.4"/>' +
    '<circle cx="25.5" cy="13" r="5.6"/>' +
    '<rect x="5" y="13" width="23" height="8.4" rx="4.2"/>' +
    "</g>"
  );
}

function sunIcon() {
  return (
    '<g transform="translate(16 12)">' +
    '<g>' +
    '<animateTransform attributeName="transform" type="rotate" values="0;360" dur="52s" repeatCount="indefinite"/>' +
    ['0', '60', '120', '180', '240', '300']
      .map(
        (deg) =>
          '<line x1="0" y1="-9" x2="0" y2="-13" stroke="var(--led-amber)" stroke-width="2" ' +
          'stroke-linecap="round" transform="rotate(' + deg + ')"/>'
      )
      .join("") +
    "</g>" +
    '<circle r="7" fill="var(--led-amber)" opacity="0.92">' +
    '<animate attributeName="opacity" values="0.82;1;0.82" dur="3.1s" repeatCount="indefinite"/>' +
    "</circle>" +
    "</g>"
  );
}

function cloudyIcon() {
  return (
    '<g>' +
    '<animateTransform attributeName="transform" type="translate" values="0 0;1.6 0;0 0" dur="6.4s" repeatCount="indefinite"/>' +
    cloudPath("var(--muted-foreground)", "0.8") +
    "</g>"
  );
}

function fogIcon() {
  const rows = [8, 14.5, 21];
  return rows
    .map((y, i) => {
      const dur = fmt(5.2 + i * 0.6);
      const beg = fmt(i * 0.4);
      return (
        '<g transform="translate(0 ' + y + ')">' +
        '<animateTransform attributeName="transform" type="translate" ' +
        'values="0 ' + y + ';2.5 ' + y + ';0 ' + y + '" dur="' + dur + 's" begin="' + beg + 's" repeatCount="indefinite"/>' +
        '<path d="M 2 0 Q 8 -2 14 0 T 26 0" fill="none" stroke="var(--muted-foreground)" ' +
        'stroke-width="2" stroke-linecap="round" opacity="0.65"/>' +
        "</g>"
      );
    })
    .join("");
}

function rainDrops(n, x0, yTop, yBottom, colorVar, opacity) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const x = x0 + i * 6.5;
    const dur = fmt(0.85 + (i % 3) * 0.12);
    const beg = fmt(-((i * 0.27) % 1));
    out.push(
      '<line x1="' + fmt(x) + '" y1="' + yTop + '" x2="' + fmt(x - 2) + '" y2="' + (yTop + 5) +
      '" stroke="' + colorVar + '" stroke-width="1.8" stroke-linecap="round" opacity="' + opacity + '">' +
      '<animateTransform attributeName="transform" type="translate" ' +
      'values="0 0;0 ' + (yBottom - yTop) + '" dur="' + dur + 's" begin="' + beg + 's" repeatCount="indefinite"/>' +
      "</line>"
    );
  }
  return out.join("");
}

function rainIcon() {
  return cloudPath("var(--hw-stroke-strong)", "0.85") + rainDrops(3, 9, 22, 30, "var(--hw-cable)", "0.85");
}

function snowIcon() {
  const flakes = [0, 1, 2]
    .map((i) => {
      const cx = fmt(10 + i * 7);
      const dur = fmt(2.6 + i * 0.4);
      const beg = fmt(i * 0.5);
      return (
        '<circle cx="' + cx + '" cy="21" r="1.7" fill="var(--muted-foreground)" opacity="0.8">' +
        '<animateTransform attributeName="transform" type="translate" ' +
        'values="0 0;1.5 5;-1.5 10" dur="' + dur + 's" begin="' + beg + 's" repeatCount="indefinite"/>' +
        '<animate attributeName="opacity" values="0.8;0.8;0" keyTimes="0;0.7;1" ' +
        'dur="' + dur + 's" begin="' + beg + 's" repeatCount="indefinite"/>' +
        "</circle>"
      );
    })
    .join("");
  return cloudPath("var(--muted-foreground)", "0.55") + flakes;
}

function stormIcon() {
  const bolt =
    '<path d="M 17 11 L 12 20 L 16 20 L 13 27 L 21 17 L 16.5 17 Z" fill="var(--led-amber)" opacity="0">' +
    '<animate attributeName="opacity" values="0;0;1;0.2;1;0;0" ' +
    'keyTimes="0;0.55;0.6;0.65;0.7;0.76;1" dur="5.6s" repeatCount="indefinite"/>' +
    "</path>";
  return cloudPath("var(--hw-stroke-strong)", "0.9") + bolt + rainDrops(2, 8, 21, 28, "var(--hw-cable)", "0.6");
}

function iconMarkup(mood) {
  if (mood === "rain") return rainIcon();
  if (mood === "snow") return snowIcon();
  if (mood === "storm") return stormIcon();
  if (mood === "fog") return fogIcon();
  if (mood === "cloudy") return cloudyIcon();
  return sunIcon();
}

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const BAR_GLYPHS = ["▁", "▃", "▅", "▇", "█"];
function loadBar(load) {
  const l = Number.isFinite(load) ? Math.max(0, Math.min(1, load)) : 0;
  const filled = Math.round(l * BAR_GLYPHS.length);
  return BAR_GLYPHS.map((g, i) => (i < filled ? g : BAR_GLYPHS[0])).join("");
}

// ── the HUD panel: fixed top-right, icon + BIG temp + condition + shift line ─
const PANEL_X = 452;
const PANEL_Y = 10;
const PANEL_W = 178;
const PANEL_H = 90;

export function renderPanel(ctx) {
  const w = (ctx && ctx.weather) || {};
  const mood = w.mood || "clear";
  const tempMood = w.tempMood || "mild";
  const label = w.label || "toronto weather";
  const tempC = ctx.tempC;
  const tempText = tempC === null || tempC === undefined ? "—" : Math.round(Number(tempC)) + "°";
  const color = tempColorVar(tempMood);
  const shiftLine = (ctx.night ? "night shift" : "day shift") + " · load " + loadBar(Number(ctx.load));

  return [
    '<g id="wx_panel">',
    '<rect x="' + PANEL_X + '" y="' + PANEL_Y + '" width="' + PANEL_W + '" height="' + PANEL_H +
      '" rx="9" fill="var(--muted)" fill-opacity="0.9" stroke="var(--border)" stroke-width="1"/>',
    '<text x="' + (PANEL_X + 14) + '" y="' + (PANEL_Y + 17) +
      '" font-size="9" letter-spacing="2" fill="var(--hw-label-dim)">TORONTO</text>',
    '<g transform="translate(' + (PANEL_X + 12) + ' ' + (PANEL_Y + 22) + ')">' + iconMarkup(mood) + "</g>",
    '<text x="' + (PANEL_X + 50) + '" y="' + (PANEL_Y + 50) +
      '" font-size="32" font-weight="700" fill="' + color + '">' + esc(tempText) + "</text>",
    '<text x="' + (PANEL_X + 14) + '" y="' + (PANEL_Y + 68) +
      '" font-size="13" fill="var(--muted-foreground)">' + esc(label) + "</text>",
    '<text x="' + (PANEL_X + 14) + '" y="' + (PANEL_Y + 82) +
      '" font-size="9" fill="var(--hw-label-dim)">' + esc(shiftLine) + "</text>",
    "</g>",
  ].join("\n");
}

// ── ambient overlay: full 640x370 scene canvas, drawn above the active scene ─
const CANVAS_W = 640;
const CANVAS_H = 370;

function overlayRain(density, colorOpacity) {
  const lines = [];
  const count = density;
  for (let i = 0; i < count; i++) {
    const x = (i * 41 + 13) % CANVAS_W;
    const len = 14 + (i % 4) * 3;
    const dur = fmt(0.7 + ((i * 7) % 5) * 0.09);
    const beg = fmt(-((i * 0.31) % 1) * parseFloat(dur));
    lines.push(
      '<line x1="' + x + '" y1="-20" x2="' + (x - 6) + '" y2="' + (-20 + len) +
      '" stroke="var(--hw-cable)" stroke-width="1.6" stroke-linecap="round" opacity="' + colorOpacity + '">' +
      '<animateTransform attributeName="transform" type="translate" ' +
      'values="0 0;0 ' + (CANVAS_H + 40) + '" dur="' + dur + 's" begin="' + beg + 's" repeatCount="indefinite"/>' +
      "</line>"
    );
  }
  return lines.join("\n");
}

function overlaySnow(count) {
  const flakes = [];
  for (let i = 0; i < count; i++) {
    const x = (i * 53 + 20) % CANVAS_W;
    const r = 1.4 + (i % 3) * 0.5;
    const dur = fmt(4.5 + ((i * 11) % 6) * 0.4);
    const beg = fmt(-((i * 0.37) % 1) * parseFloat(dur));
    const sway = 12 + (i % 3) * 6;
    flakes.push(
      '<circle cx="' + x + '" cy="-10" r="' + fmt(r) + '" fill="var(--muted-foreground)" opacity="0.55">' +
      '<animateTransform attributeName="transform" type="translate" ' +
      'values="0 0;' + sway + ' ' + (CANVAS_H * 0.5 + 10) + ';0 ' + (CANVAS_H + 20) + '" ' +
      'keyTimes="0;0.5;1" dur="' + dur + 's" begin="' + beg + 's" repeatCount="indefinite"/>' +
      "</circle>"
    );
  }
  return flakes.join("\n");
}

function overlayFog() {
  const bands = [
    { y: 60, h: 70, op: 0.14 },
    { y: 190, h: 90, op: 0.1 },
  ];
  return bands
    .map((b, i) => {
      const dur = fmt(13 + i * 3);
      return (
        '<rect x="-40" y="' + b.y + '" width="' + (CANVAS_W + 80) + '" height="' + b.h +
        '" fill="var(--hw-well)" opacity="' + b.op + '">' +
        '<animateTransform attributeName="transform" type="translate" ' +
        'values="0 0;18 0;0 0" dur="' + dur + 's" repeatCount="indefinite"/>' +
        "</rect>"
      );
    })
    .join("\n");
}

function overlayStormFlash() {
  return (
    '<rect x="0" y="0" width="' + CANVAS_W + '" height="' + CANVAS_H + '" fill="var(--foreground)" opacity="0">' +
    '<animate attributeName="opacity" values="0;0;0.1;0.02;0.14;0;0" ' +
    'keyTimes="0;0.55;0.6;0.65;0.7;0.76;1" dur="6.8s" repeatCount="indefinite"/>' +
    "</rect>"
  );
}

function overlayHeatShimmer() {
  const rows = [318, 336, 354];
  return rows
    .map((y, i) => {
      const dur = fmt(1.9 + i * 0.3);
      const beg = fmt(i * 0.4);
      return (
        '<path d="M -20 ' + y + ' Q 60 ' + (y - 6) + ' 140 ' + y + ' T 300 ' + y + ' T 460 ' + y + ' T 660 ' + y +
        '" fill="none" stroke="var(--led-amber)" stroke-width="1.4" opacity="0.22">' +
        '<animateTransform attributeName="transform" type="translate" ' +
        'values="-4 0;4 0;-4 0" dur="' + dur + 's" begin="' + beg + 's" repeatCount="indefinite"/>' +
        "</path>"
      );
    })
    .join("\n");
}

function overlayColdTint() {
  return (
    '<rect x="0" y="0" width="' + CANVAS_W + '" height="' + CANVAS_H + '" fill="var(--led-teal)" opacity="0.04">' +
    '<animate attributeName="opacity" values="0.03;0.06;0.03" dur="9s" repeatCount="indefinite"/>' +
    "</rect>"
  );
}

export function renderOverlay(ctx) {
  const w = (ctx && ctx.weather) || {};
  const mood = w.mood || "clear";
  const tempMood = w.tempMood || "mild";
  const parts = [];

  if (mood === "rain") {
    parts.push(overlayRain(16, 0.32));
  } else if (mood === "storm") {
    parts.push(overlayRain(22, 0.4));
    parts.push(overlayStormFlash());
  } else if (mood === "snow") {
    parts.push(overlaySnow(14));
  } else if (mood === "fog") {
    parts.push(overlayFog());
  }

  // temperature accents layer only on top of calm skies — heavy weather
  // already carries its own mood, no need to double up.
  if (mood === "clear" || mood === "cloudy") {
    if (tempMood === "hot") parts.push(overlayHeatShimmer());
    else if (tempMood === "cold") parts.push(overlayColdTint());
  }

  if (!parts.length) return "";
  return '<g id="wx_overlay" pointer-events="none">' + parts.join("\n") + "</g>";
}
