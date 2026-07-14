#!/usr/bin/env node
// lab/fetch-env.mjs — fetch time/github/weather → lab/env.json
// Contract: never exits non-zero; on ANY fetch failure falls back gracefully.
// Usage: node lab/fetch-env.mjs [--mock]

import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const OUT_PATH = path.join(process.cwd(), 'lab', 'env.json');
const FETCH_TIMEOUT_MS = 8000;

const GITHUB_USER = 'raiz-toff';
const GITHUB_EVENTS_URL = `https://api.github.com/users/${GITHUB_USER}/events/public?per_page=100`;
const WEATHER_URL =
  'https://api.open-meteo.com/v1/forecast?latitude=43.65&longitude=-79.38&current=temperature_2m,weather_code';

const FALLBACK_LOAD = 0.4;
const FALLBACK_COMMITS_7D = 16; // keeps the invariant load = min(1, commits7d / 40)
const FALLBACK_CRAC_DUTY = 0.4; // when tempC is null

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

function round3(v) {
  return Math.round(v * 1000) / 1000;
}

/** fetch with an 8s AbortController timeout; throws on non-2xx. */
async function fetchJson(url, headers = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers, signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/** Current hour (0-23) in America/Toronto via Intl. */
function torontoHour(date = new Date()) {
  const s = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto',
    hour: 'numeric',
    hourCycle: 'h23',
  }).format(date);
  const h = parseInt(s, 10);
  return Number.isInteger(h) && h >= 0 && h <= 23 ? h : 12;
}

function isNight(hour) {
  return hour >= 22 || hour < 7;
}

/** Count PushEvent commits over the last 7 days. Throws on any failure. */
async function fetchCommits7d() {
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': `${GITHUB_USER}-living-lab`,
  };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  const events = await fetchJson(GITHUB_EVENTS_URL, headers);
  if (!Array.isArray(events)) throw new Error('unexpected GitHub events payload');
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  let commits = 0;
  for (const ev of events) {
    if (!ev || ev.type !== 'PushEvent') continue;
    const at = Date.parse(ev.created_at ?? '');
    if (!Number.isFinite(at) || at < cutoff) continue;
    const size = ev.payload?.size;
    const n = Number.isInteger(size)
      ? size
      : Array.isArray(ev.payload?.commits)
        ? ev.payload.commits.length
        : 0;
    commits += Math.max(0, n);
  }
  return commits;
}

/** Current Toronto temperature + weather code from Open-Meteo. Throws on any failure. */
async function fetchWeather() {
  const data = await fetchJson(WEATHER_URL);
  const t = data?.current?.temperature_2m;
  const code = data?.current?.weather_code;
  if (typeof t !== 'number' || !Number.isFinite(t)) {
    throw new Error('unexpected Open-Meteo payload');
  }
  return {
    tempC: t,
    weatherCode: Number.isInteger(code) ? code : null,
  };
}

function cracDutyFor(tempC) {
  if (tempC === null) return FALLBACK_CRAC_DUTY;
  return round3(clamp((tempC - 10) / 25, 0.15, 1));
}

function mockEnv() {
  // Fixed deterministic fixture for tests: day, load 0.55, tempC 21, cracDuty 0.44.
  return {
    hourToronto: 14,
    night: false,
    commits7d: 22, // 22 / 40 = 0.55
    load: 0.55,
    tempC: 21,
    weatherCode: 1,
    cracDuty: 0.44, // clamp((21 - 10) / 25, 0.15, 1)
    fetchedAt: '2026-01-01T12:00:00.000Z',
    sources: { github: 'ok', weather: 'ok' },
  };
}

async function realEnv() {
  const hourToronto = torontoHour();

  let commits7d = FALLBACK_COMMITS_7D;
  let load = FALLBACK_LOAD;
  let githubSource = 'fallback';
  try {
    commits7d = await fetchCommits7d();
    load = round3(Math.min(1, commits7d / 40));
    githubSource = 'ok';
  } catch (err) {
    console.error(`fetch-env: github fallback (${err?.message ?? err})`);
  }

  let tempC = null;
  let weatherCode = null;
  let weatherSource = 'fallback';
  try {
    const w = await fetchWeather();
    tempC = w.tempC;
    weatherCode = w.weatherCode;
    weatherSource = 'ok';
  } catch (err) {
    console.error(`fetch-env: weather fallback (${err?.message ?? err})`);
  }

  return {
    hourToronto,
    night: isNight(hourToronto),
    commits7d,
    load,
    tempC,
    weatherCode,
    cracDuty: cracDutyFor(tempC),
    fetchedAt: new Date().toISOString(),
    sources: { github: githubSource, weather: weatherSource },
  };
}

async function main() {
  const mock = process.argv.includes('--mock');
  const env = mock ? mockEnv() : await realEnv();
  await mkdir(path.dirname(OUT_PATH), { recursive: true });
  await writeFile(OUT_PATH, JSON.stringify(env, null, 2) + '\n', 'utf8');
  console.log(
    `fetch-env: wrote lab/env.json (${mock ? 'mock' : 'real'}; github=${env.sources.github}, weather=${env.sources.weather})`
  );
}

main().catch((err) => {
  // Contract: never exit non-zero. Last-resort: write full-fallback env.
  console.error(`fetch-env: unexpected error (${err?.message ?? err}); writing fallback env`);
  const hour = (() => {
    try {
      return torontoHour();
    } catch {
      return 12;
    }
  })();
  const env = {
    hourToronto: hour,
    night: isNight(hour),
    commits7d: FALLBACK_COMMITS_7D,
    load: FALLBACK_LOAD,
    tempC: null,
    weatherCode: null,
    cracDuty: FALLBACK_CRAC_DUTY,
    fetchedAt: new Date().toISOString(),
    sources: { github: 'fallback', weather: 'fallback' },
  };
  return mkdir(path.dirname(OUT_PATH), { recursive: true })
    .then(() => writeFile(OUT_PATH, JSON.stringify(env, null, 2) + '\n', 'utf8'))
    .catch((e) => console.error(`fetch-env: could not write fallback env (${e?.message ?? e})`))
    .finally(() => process.exit(0));
});
