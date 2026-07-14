// lab/composite.mjs — assembles scene renders into the cycling loop SVG.
//
//   export function compose(scenes, ctx) → full SVG string
//
// Ported from the surviving story-loop generator: same stage (640x400, scene
// area 640x370 centered-fit), same film timing (n slots x 8s per slot,
// 0.7s crossfade, slot 0 visible at t=0), same begin-shifting rule (one-shot
// fill="freeze"/<set> numeric begins in slot k move by +8k s; looping
// repeatCount="indefinite" ambience is left untouched), same caption strip
// and chapter dots. New here: the always-visible status line (bottom right).
//
// Scene modules must export KEY, VIEWBOX, TITLE, caption(ctx), render(ctx)
// → { body, defs } with every id prefixed KEY + "_". compose() validates
// all of that and throws on any violation — nothing is written on error.

import { renderPanel, renderOverlay } from "./weather.mjs";

const STAGE_W = 640;
const STAGE_H = 400;
const SCENE_H = 370;
const SLOT = 8; // seconds per slot
const F = 0.7; // crossfade seconds

// The single shared <style>: light+dark palette identical to the existing
// assets/story SVGs (composite is the only emitter of <style>).
const STYLE_BLOCK = `<style>
    :root { color-scheme: light dark; }
    svg {
      --background: #ffffff; --foreground: #1f2328;
      --border: #d1d9e0; --line: #d8dee4; --ring: #6e7781;
      --muted: #f6f8fa; --muted-foreground: #59636e;
      --hw-stroke: #6e7781; --hw-stroke-soft: #d1d9e0; --hw-stroke-strong: #454c54;
      --hw-face-1: #e7ebf0; --hw-face-2: #f0f3f6; --hw-face-3: #f8fafc;
      --hw-well: #dbe2e9; --hw-label: #57606a; --hw-label-dim: #8b949e;
      --hw-cable: #59636e;
      --led-green: #1f883d; --led-amber: #bf8700; --led-teal: #1b7c83;
    }
    @media (prefers-color-scheme: dark) {
      svg {
        --background: #0d1117; --foreground: #e6edf3;
        --border: #30363d; --line: #21262d; --ring: #8b949e;
        --muted: #161b22; --muted-foreground: #8b949e;
        --hw-stroke: #8b949e; --hw-stroke-soft: #30363d; --hw-stroke-strong: #c9d1d9;
        --hw-face-1: #161b22; --hw-face-2: #1c2128; --hw-face-3: #21262d;
        --hw-well: #0d1117; --hw-label: #9ea7b3; --hw-label-dim: #6e7781;
        --hw-cable: #768390;
        --led-green: #3fb950; --led-amber: #d29922; --led-teal: #39c5cf;
      }
    }
    text { font-family: ui-monospace, "Cascadia Mono", "Segoe UI Mono", Menlo, Consolas, monospace; }
  </style>`;

const fmt = (n) => String(+n.toFixed(4));

function fail(msg) {
  throw new Error("composite: " + msg);
}

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ── status line ────────────────────────────────────────────────────────────
// "{day shift|night shift} · load {▁▃▅▇█ bar} · {tempC}°c toronto"
// (temperature segment omitted when tempC is null/non-finite)
const BAR_GLYPHS = ["▁", "▃", "▅", "▇", "█"]; // ▁▃▅▇█

function loadBar(load) {
  const l = Number.isFinite(load) ? Math.max(0, Math.min(1, load)) : 0;
  const filled = Math.round(l * BAR_GLYPHS.length);
  return BAR_GLYPHS.map((g, i) => (i < filled ? g : BAR_GLYPHS[0])).join("");
}

function statusLine(ctx) {
  const parts = [];
  const w = ctx.weather;
  if (w && w.label) parts.push(w.label);
  parts.push(ctx.night ? "night shift" : "day shift", "load " + loadBar(Number(ctx.load)));
  const t = Number(ctx.tempC);
  if (ctx.tempC !== null && ctx.tempC !== undefined && Number.isFinite(t)) {
    parts.push(Math.round(t) + "°c toronto");
  }
  return parts.join(" · ");
}

// ── window animation (values/keyTimes over the full cycle) ────────────────
function windowSpec(k, n) {
  const T = SLOT * n;
  let values, times;
  if (k === 0) {
    values = ["1", "1", "0", "0", "1"];
    times = [0, SLOT, SLOT + F, T - F, T];
  } else if (k === n - 1) {
    // Fade out across T-F..T so the wrap is a true sum-to-1 crossfade with
    // slot 0's final ramp (and value-continuous at the repeat boundary: 0->0).
    values = ["0", "0", "1", "1", "0"];
    times = [0, SLOT * k, SLOT * k + F, T - F, T];
  } else {
    values = ["0", "0", "1", "1", "0", "0"];
    times = [0, SLOT * k, SLOT * k + F, SLOT * (k + 1), SLOT * (k + 1) + F, T];
  }
  const keyTimes = times.map((t) => fmt(t / T));
  for (let i = 1; i < keyTimes.length; i++) {
    if (!(parseFloat(keyTimes[i]) > parseFloat(keyTimes[i - 1])))
      fail("windowSpec slot " + k + ": keyTimes not ascending: " + keyTimes.join(";"));
  }
  return { values: values.join(";"), keyTimes: keyTimes.join(";"), T };
}

function windowAnimate(k, n) {
  const w = windowSpec(k, n);
  return (
    '<animate attributeName="opacity" dur="' + w.T + 's" repeatCount="indefinite" calcMode="linear" values="' +
    w.values + '" keyTimes="' + w.keyTimes + '"/>'
  );
}

// ── begin shifting ─────────────────────────────────────────────────────────
// One-shot reveals (fill="freeze" animates, <set>s) carry numeric begins
// relative to scene start; shift them by the slot offset. Looping ambience
// (repeatCount="indefinite") is phase-free and stays untouched.
function shiftBegins(markup, offsetSec) {
  let shifted = 0;
  const out = markup.replace(
    /<(animate|animateTransform|animateMotion|set)\b[^>]*?>/g,
    (tag) => {
      if (/repeatCount="indefinite"/.test(tag)) return tag;
      const beginM = tag.match(/\bbegin="([\d.]+)s?"/);
      if (!beginM) return tag;
      const v = parseFloat(beginM[1]);
      shifted++;
      return tag.replace(/\bbegin="[\d.]+s?"/, 'begin="' + fmt(v + offsetSec) + 's"');
    }
  );
  return { out, shifted };
}

// ── whole-document validation (ported from the story-loop generator) ──────
function validateDoc(doc) {
  // duplicate ids
  const allIds = [...doc.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
  const dupes = allIds.filter((id, i) => allIds.indexOf(id) !== i);
  if (dupes.length) fail("duplicate ids: " + [...new Set(dupes)].join(", "));

  // url(#) and syncbase begin/end refs resolve
  const idSet = new Set(allIds);
  for (const m of doc.matchAll(/url\(#([^)]+)\)/g)) {
    if (!idSet.has(m[1])) fail("unresolved url(#" + m[1] + ")");
  }
  for (const m of doc.matchAll(/\b(?:begin|end)="([A-Za-z_][\w-]*)\.(?:begin|end|click)/g)) {
    if (!idSet.has(m[1])) fail("unresolved syncbase ref " + m[1]);
  }

  // keyTimes lists: 0-start, 1-end, ascending, length matches values/keyPoints
  for (const m of doc.matchAll(/<(animate|animateTransform|animateMotion|set)\b[^>]*?>/g)) {
    const tag = m[0];
    const kt = tag.match(/\bkeyTimes="([^"]+)"/);
    if (!kt) continue;
    const times = kt[1].split(";").map((x) => parseFloat(x.trim()));
    if (times[0] !== 0) fail("keyTimes not 0-start: " + tag);
    if (times[times.length - 1] !== 1) fail("keyTimes not 1-end: " + tag);
    for (let i = 1; i < times.length; i++)
      if (!(times[i] > times[i - 1])) fail("keyTimes not ascending: " + tag);
    const vals = tag.match(/\bvalues="([^"]+)"/);
    const kps = tag.match(/\bkeyPoints="([^"]+)"/);
    if (vals) {
      if (vals[1].split(";").length !== times.length)
        fail("keyTimes/values length mismatch: " + tag);
    } else if (kps) {
      if (kps[1].split(";").length !== times.length)
        fail("keyTimes/keyPoints length mismatch: " + tag);
    } else {
      fail("keyTimes without values/keyPoints: " + tag);
    }
  }

  // no className, no braces outside <style>, no leaked JS tokens
  if (/className/.test(doc)) fail("found className");
  const noStyle = doc.replace(/<style>[\s\S]*?<\/style>/, "");
  if (/[{}]/.test(noStyle)) fail("stray brace outside <style>");
  if (/undefined|NaN|\[object/.test(noStyle)) fail("bad token (undefined/NaN/[object) in output");
}

// ── compose ────────────────────────────────────────────────────────────────
export function compose(scenes, ctx) {
  if (!Array.isArray(scenes) || scenes.length < 1) fail("need at least 1 scene module");
  const n = scenes.length;

  const hoistedDefs = [];
  const sceneGroups = [];
  const dotOverlays = [];
  const dotBases = [];

  scenes.forEach((mod, k) => {
    const key = mod.KEY;
    if (!/^[a-z][a-z0-9]*$/.test(String(key))) fail("scene " + k + ": bad KEY " + key);

    // viewBox → centered fit into the 640x370 scene area
    const vb = String(mod.VIEWBOX).trim().split(/\s+/).map(Number);
    if (vb.length !== 4 || vb.some((x) => !Number.isFinite(x))) fail(key + ": bad VIEWBOX");
    const [minX, minY, vw, vh] = vb;
    if (minX !== 0 || minY !== 0) fail(key + ": viewBox min not 0 0");
    if (!(vw > 0 && vh > 0)) fail(key + ": non-positive viewBox size");
    const s = Math.min(STAGE_W / vw, SCENE_H / vh);
    const tx = (STAGE_W - s * vw) / 2;
    const ty = (SCENE_H - s * vh) / 2;

    // render + id-prefix check
    const r = mod.render(ctx);
    if (!r || typeof r.body !== "string") fail(key + ": render() must return { body, defs }");
    const defs = typeof r.defs === "string" ? r.defs : "";
    for (const m of (r.body + "\n" + defs).matchAll(/\bid="([^"]+)"/g)) {
      if (!m[1].startsWith(key + "_")) fail(key + ": id not prefixed: " + m[1]);
    }
    if (defs.trim()) hoistedDefs.push(defs.trim());

    // shift one-shot begins into this scene's slot
    const sh = shiftBegins(r.body, SLOT * k);

    // caption strip (title + per-ctx caption); shrink if it would overflow
    const captionText = mod.TITLE + " — " + mod.caption(ctx);
    let fontSize = 11;
    if (10 + captionText.length * 0.62 * 11 > STAGE_W) fontSize = 10;

    const transform = "translate(" + fmt(tx) + " " + fmt(ty) + ") scale(" + fmt(s) + ")";
    const sceneGroup = [
      '<g' + (n === 1 ? ' opacity="1"' : ' opacity="0"') + '>',
    ];
    if (n > 1) sceneGroup.push(windowAnimate(k, n));
    sceneGroup.push(
      '<g transform="' + transform + '">',
      sh.out,
      "</g>",
      '<text x="10" y="389" font-size="' + fontSize + '" fill="var(--muted-foreground)">' +
        esc(captionText) + "</text>",
      "</g>"
    );
    sceneGroups.push(sceneGroup.join("\n"));

    // chapter dots: only show when cycling (n > 1)
    if (n > 1) {
      const cx = 630 - (n - 1 - k) * 12;
      dotBases.push('<circle cx="' + cx + '" cy="386" r="2.2" fill="var(--border)"/>');
      dotOverlays.push(
        '<circle cx="' + cx + '" cy="386" r="2.2" fill="var(--led-green)" opacity="0">' +
          windowAnimate(k, n) + "</circle>"
      );
    }
  });

  // big weather HUD: an ambient FX layer over the whole canvas, plus a
  // fixed top-right panel (icon + big temperature + condition + shift/load)
  const overlay = renderOverlay(ctx);
  const panel = renderPanel(ctx);

  const status = statusLine(ctx);
  const ariaLabel = n === 1
    ? scenes[0].TITLE + ". " + scenes[0].caption(ctx) + ". Current conditions: " + status + "."
    : "A quiet " + n + "-scene film loop through a homelab story. Current conditions: " + status + ".";

  const defsBlock = hoistedDefs.length ? "<defs>\n" + hoistedDefs.join("\n") + "\n</defs>" : "";

  const doc = [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + STAGE_W + " " + STAGE_H +
      '" role="img" aria-label="' + esc(ariaLabel).replace(/"/g, "&quot;") + '">',
    STYLE_BLOCK,
    defsBlock,
    sceneGroups.join("\n"),
    overlay,
    "<g>",
    dotBases.join("\n"),
    dotOverlays.join("\n"),
    "</g>",
    panel,
    "</svg>",
  ]
    .filter(Boolean)
    .join("\n");

  validateDoc(doc);
  return doc;
}
