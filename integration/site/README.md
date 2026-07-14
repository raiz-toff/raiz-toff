# site kit — tier 3: the site drives the lab penguin

When a visitor's walk ends on the portfolio site's `DcFloor`, the site tells
the living lab where the penguin stopped. The lab repo re-validates the move,
parks the penguin on that tile for 2 hours, and repaints
`assets/story/story-loop.svg` on the GitHub profile.

Flow:

```
DcFloor walk ends
  -> POST /api/lab-penguin  { x, y }            (this route, on the site)
  -> repository_dispatch "penguin-move"          (GitHub API, token stays server-side)
  -> .github/workflows/lab.yml                   (raiz-toff/raiz-toff)
  -> lab/apply-event.mjs validates + parks 2h
  -> lab/generate.mjs repaints the SVG
```

## Files here

| file                 | goes to (in the Next.js site repo)     |
| -------------------- | -------------------------------------- |
| `route.ts`           | `app/api/lab-penguin/route.ts`         |
| `client-example.tsx` | reference only — copy the hook into the component that renders `DcFloor` |

## Setup

### 1. Create the fine-grained PAT

1. GitHub → **Settings** → **Developer settings** → **Fine-grained personal
   access tokens** → **Generate new token**.
2. Name: `lab-penguin-dispatch`. Pick an expiration (set a rotation reminder).
3. **Resource owner:** `raiz-toff`.
4. **Repository access:** *Only select repositories* → `raiz-toff/raiz-toff`.
   Nothing else.
5. **Repository permissions:** `Contents` → **Read and write**. Leave every
   other permission at *No access*. (Contents write is what authorizes the
   `repository_dispatch` endpoint.)
6. Generate and copy the token — it is shown once.

Sanity-check the token before wiring anything (expect `HTTP 204`):

```sh
curl -i -X POST https://api.github.com/repos/raiz-toff/raiz-toff/dispatches \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: Bearer $GITHUB_LAB_TOKEN" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  -d '{"event_type":"penguin-move","client_payload":{"x":5,"y":4}}'
```

### 2. Add the env var on Vercel

- Project → **Settings** → **Environment Variables**:
  - Key: `GITHUB_LAB_TOKEN`
  - Value: the PAT
  - Environments: Production (add Preview only if you want previews poking
    the lab). Mark it **Sensitive**.
- Redeploy so the route picks it up.
- Local dev: put `GITHUB_LAB_TOKEN=github_pat_...` in `.env.local` — never
  commit it.

### 3. Drop in the route

Copy `route.ts` to `app/api/lab-penguin/route.ts` in the site repo. No
dependencies, no config; it exports `POST` and forces the Node runtime.

### 4. Wire the client

See `client-example.tsx`. The whole integration is: debounce `onNear`, POST
the last tile.

```tsx
const syncTile = useLabPenguinSync(); // debounced fire-and-forget POST

<DcFloor onNear={(tile) => syncTile(tile.x, tile.y)} />
```

## Test the deployed route

```sh
curl -i -X POST https://YOUR-SITE.vercel.app/api/lab-penguin \
  -H "Content-Type: application/json" \
  -d '{"x":5,"y":4}'
```

Expect `HTTP 202 {"ok":true}`. Then check the **Actions** tab on
`raiz-toff/raiz-toff` for a `repository_dispatch` run of the lab workflow;
within a minute the profile SVG should show the penguin parked at (5,4).

Rejections to verify while you're at it:

- `{"x":99,"y":4}` → `400` (out of grid `0..12 × 0..8`)
- `{"x":1.5,"y":4}` → `400` (not integers)
- 11th request inside a minute → `429`

## Abuse surface — read before shipping

- **Rate limit is per instance.** The 10/min sliding window lives in module
  memory, so on Vercel each warm serverless instance keeps its own map. The
  effective ceiling is 10/min × instances, and a cold start resets it. Treat
  it as a speed bump. If the route gets hammered, add platform-level rate
  limiting (Vercel WAF / firewall rules) in front.
- **The repo is the real validator.** `lab/apply-event.mjs` re-checks grid
  bounds, that the target cell is not solid, and BFS reachability from the
  penguin's current position. A forged or replayed payload can at worst park
  the penguin on a *legal* tile for 2 hours — annoying, not damaging.
- **Token blast radius.** The PAT can only write Contents on
  `raiz-toff/raiz-toff` (the public profile repo). If it ever leaks, rotate
  it in GitHub and update the Vercel env var; nothing private is reachable.
- **No information leaks.** The route never echoes the token, and upstream
  GitHub status codes/bodies are logged server-side only — the client always
  gets `202` once validation passes, so probing responses reveals nothing
  about the dispatch outcome.
- **Workflow concurrency.** The lab workflow runs in the `lab` concurrency
  group, so a burst of dispatches queues instead of stampeding commits.
