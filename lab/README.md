# the living lab

The banner on this profile — `assets/story/story-loop.svg` — is not a static image.
It is a six-scene animated SVG that a GitHub Action repaints from two small JSON
files: a **world** (where the penguin is, who visited) and an **environment**
(what time it is in Toronto, how busy the last week of commits was, what the
weather outside is doing). Star the repo, open an issue, or walk the penguin on
[rajkumarneupane.com](https://rajkumarneupane.com/) and the picture changes.

Plain Node >= 20, ES modules, zero npm dependencies. Runs identically on
ubuntu-latest and on Windows.

## how the pieces fit

```
  GitHub event ──> apply-event.mjs ──> lab/world.json
                                            │
  hourly cron ──> fetch-env.mjs ──> lab/env.json
                                            │
                        generate.mjs ───────┤  builds ctx = world + env
                                            │
                  scenes/*.mjs (s1..s6) <───┘  each returns { body, defs }
                                            │
                        composite.mjs ──────┘  one cycling SVG, 6 × 8s slots
                                            │
                     assets/story/story-loop.svg  (committed by the Action)
```

- `generate.mjs` never fetches anything — it only reads `world.json` and
  `env.json`. All network I/O lives in `fetch-env.mjs` (and in the workflow's
  `gh api` step for issue comments).
- Every scene render is deterministic for a given context (seeded PRNGs, no
  `Math.random()`), so reruns without state changes produce a byte-identical
  SVG and the Action commits nothing.

## the environment (lab/env.json)

| signal | source | effect |
|---|---|---|
| `hourToronto`, `night` | `Intl` in `America/Toronto`; night = 22:00–06:59 | lights dim, fewer flickers, the penguin sleeps |
| `commits7d`, `load` | github public events API; `load = min(1, commits7d / 40)` | more blinking LEDs, faster switch blinks, more packets on the bench traces |
| `tempC`, `cracDuty` | open-meteo current temp for Toronto; `cracDuty = clamp((tempC − 10) / 25, 0.15, 1)` | airflow lines in the cold aisle speed up on hot days |

Any fetch failure falls back (load 0.4, tempC null) and never fails the run.
A status line at the bottom-right of the SVG always shows the current shift,
a load bar, and the Toronto temperature.

## the world (lab/world.json)

```json
{
  "version": 1,
  "penguin": { "x": 10, "y": 8, "mode": "patrol", "parkedUntil": null, "setBy": null },
  "visitors": [ { "login": "somebody", "at": "ISO8601" } ],
  "updatedAt": "ISO8601"
}
```

- `penguin.mode` is `patrol` or `parked`. Sleep is never stored — it is derived
  at render time: Toronto night puts the penguin to bed beside pve-01 no matter
  what the world says.
- `visitors` are stargazers, newest last, capped at 50. The latest one gets an
  amber "guest // {login}" pill on a rack in scene 1.

## event surfaces

All five surfaces funnel through `.github/workflows/lab.yml` (single job,
concurrency group `lab`):

| trigger | what happens |
|---|---|
| `schedule` (hourly, :17) | refresh env, expire `parkedUntil` back to patrol, repaint |
| `workflow_dispatch` | manual repaint |
| `watch` (starred) | stargazer joins `visitors`, repaint |
| `issues` (opened, title `penguin: ...`) | move the penguin, bot comments + closes the issue |
| `repository_dispatch` (`penguin-move`) | site hook moves the penguin, parks 2h |
| `repository_dispatch` (`lab-sync`) | same expiry/repaint pass as the cron |

## moving the penguin via issue

Open an issue on this repo titled exactly one of:

```
penguin: goto 5,4
penguin: north      (or south / east / west)
```

Title casing doesn't matter; the body is ignored. The bot validates the move,
comments with the outcome, and closes the issue. A successful move parks the
penguin at the target for 6 hours, then the hourly cron sends it back on patrol.

The floor is a 13 × 9 tile grid (`x` = column 0–12, `y` = row 0–8). Racks and
pillars are solid; everything else is walkable, and the target must also be
reachable on foot (BFS) from wherever the penguin currently stands:

```
      x 0 1 2 3 4 5 6 7 8 9 10 11 12
  y 0   . . . # . . # . . #  .  .  .
  y 1   . . # # # # # # # #  #  .  .
  y 2   . . . . . . . . . .  .  .  .
  y 3   . . # # # # # # # #  #  .  .
  y 4   . . . . . . . . . .  .  .  .
  y 5   . . # # # # # # # #  #  .  .
  y 6   . . . . . . . . . .  .  .  .
  y 7   . . # # # # # # # #  #  .  .
  y 8   . . . . . . . . . .  .  .  .

  # solid (rack rows at y 1/3/5/7, x 2–10, plus pillars at (3,0) (6,0) (9,0))
  . walkable — (10,8) is the sleep spot beside pve-01
```

Aiming at a rack, an off-grid tile, or an unreachable cell gets a polite
explanation in the bot's comment and no move (`ok: false`), but the issue still
closes cleanly.

## how the site hook works

The interactive data-center floor on rajkumarneupane.com mirrors this grid.
When a visitor finishes walking the penguin there, the site fires a debounced
POST of the final tile to its own `/api/lab-penguin` route. That route
(a Next.js App Router handler, rate-limited to 10 req/min per IP) forwards a
`repository_dispatch` event of type `penguin-move` with `client_payload
{x, y}` to this repo, authenticated with a fine-grained PAT (Contents:
read/write) stored as a Vercel env var. The workflow re-validates the move
against the same grid rules — the site is never trusted — and parks the penguin
for 2 hours.

The drop-in kit (route handler, client snippet, setup notes) lives in
[`integration/site/`](../integration/site/).

## run it locally

```sh
node lab/fetch-env.mjs --mock   # deterministic env: day, load 0.55, 21°C
node lab/generate.mjs           # writes assets/story/story-loop.svg
```

Drop `--mock` to hit the real APIs (set `GITHUB_TOKEN` for a higher rate
limit; weather needs no key). To simulate GitHub events against the world:

```sh
node lab/apply-event.mjs watch  lab/test/fixtures/watch-started.json
node lab/apply-event.mjs issues lab/test/fixtures/issue-move-valid.json
```

The applier prints its result JSON to stdout and edits `lab/world.json` in
place — `git checkout -- lab/world.json lab/env.json` undoes an experiment.

## file map

| path | role |
|---|---|
| `lab/world.json` | canonical world state |
| `lab/env.json` | last fetched environment |
| `lab/fetch-env.mjs` | time / github / weather -> `env.json` (`--mock` for tests) |
| `lab/apply-event.mjs` | event payload -> `world.json` mutation + result JSON on stdout |
| `lab/generate.mjs` | orchestrator: world + env -> ctx -> scenes -> composite -> SVG |
| `lab/composite.mjs` | assembles the 48s cycling loop, captions, status line, chapter dots |
| `lab/scenes/*.mjs` | the six scenes: floor, cold-aisle, rack, layer1, far-end, bench |
| `lab/test/fixtures/` | simulated GitHub event payloads |
| `.github/workflows/lab.yml` | the Action that ties it all together |
| `integration/site/` | Next.js kit for the website hook |
