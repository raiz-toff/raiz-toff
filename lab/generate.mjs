#!/usr/bin/env node
// lab/generate.mjs — orchestrator: world+env → assets/story/story-loop.svg
//
//   node lab/generate.mjs [--out <path>]
//
// Reads lab/world.json (canonical world state) and lab/env.json (written by
// lab/fetch-env.mjs — this script NEVER fetches). Builds the render context
// per the lab contract, renders the six scenes, composes the film loop and
// writes it. Runs from the repo root (paths resolve against process.cwd()).
//
// Not this script's job: parkedUntil expiry (apply-event.mjs reverts the
// penguin to patrol); sleep mode is derived here from env.night at render
// time and is never stored in world.json.

import fs from "node:fs";
import path from "node:path";
import { compose } from "./composite.mjs";
import * as floor from "./scenes/floor.mjs";
import * as coldAisle from "./scenes/cold-aisle.mjs";
import * as rack from "./scenes/rack.mjs";
import * as layer1 from "./scenes/layer1.mjs";
import * as farEnd from "./scenes/far-end.mjs";
import * as bench from "./scenes/bench.mjs";

const SCENES = [floor, coldAisle, rack, layer1, farEnd, bench];

const ROOT = process.cwd();
const WORLD_FILE = path.join(ROOT, "lab", "world.json");
const ENV_FILE = path.join(ROOT, "lab", "env.json");
const DEFAULT_OUT = path.join(ROOT, "assets", "story", "story-loop.svg");

const LOGIN_RE = /^[a-zA-Z0-9-]{1,39}$/;

function clamp(v, lo, hi, dflt) {
  const n = Number(v);
  if (!Number.isFinite(n)) return dflt;
  return Math.max(lo, Math.min(hi, n));
}

function readJson(file, label) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    process.stderr.write(
      "generate: could not read " + label + " (" + file + "): " + err.message + " — using defaults\n"
    );
    return null;
  }
}

function buildCtx(world, env) {
  const w = world && typeof world === "object" ? world : {};
  const e = env && typeof env === "object" ? env : {};

  const night = !!e.night;
  const load = clamp(e.load, 0, 1, 0.4);
  const cracDuty = clamp(e.cracDuty, 0, 1, 0.4);
  const tempC = Number.isFinite(Number(e.tempC)) && e.tempC !== null ? Number(e.tempC) : null;
  const hourToronto = clamp(e.hourToronto, 0, 23, 12);

  const p = w.penguin && typeof w.penguin === "object" ? w.penguin : {};
  const storedMode = p.mode === "parked" ? "parked" : "patrol";
  const penguin = {
    x: Math.round(clamp(p.x, 0, 12, 10)),
    y: Math.round(clamp(p.y, 0, 8, 8)),
    mode: night ? "sleep" : storedMode, // night overrides everything
  };

  const visitors = (Array.isArray(w.visitors) ? w.visitors : []).filter(
    (v) => v && typeof v.login === "string" && LOGIN_RE.test(v.login)
  );
  const latestVisitor = visitors.length ? visitors[visitors.length - 1].login : null;

  return {
    night,
    load,
    cracDuty,
    tempC,
    hourToronto,
    penguin,
    visitors,
    latestVisitor,
    visitorCount: visitors.length,
  };
}

function parseArgs(argv) {
  let out = DEFAULT_OUT;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--out") {
      if (!argv[i + 1]) {
        process.stderr.write("generate: --out requires a path\n");
        process.exit(1);
      }
      out = path.resolve(ROOT, argv[++i]);
    }
  }
  return { out };
}

function main() {
  const { out } = parseArgs(process.argv.slice(2));

  const world = readJson(WORLD_FILE, "world");
  const env = readJson(ENV_FILE, "env");
  const ctx = buildCtx(world, env);

  const doc = compose(SCENES, ctx);

  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, doc, "utf8");

  process.stdout.write(
    JSON.stringify({
      out,
      bytes: Buffer.byteLength(doc, "utf8"),
      scenes: SCENES.map((s) => s.KEY),
      night: ctx.night,
      load: ctx.load,
      tempC: ctx.tempC,
      penguin: ctx.penguin,
      visitorCount: ctx.visitorCount,
      latestVisitor: ctx.latestVisitor,
    }) + "\n"
  );
}

main();
