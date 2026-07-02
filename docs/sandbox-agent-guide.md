# Sandbox Environment Agent Guide

Instructions for agents running inside Freebuff Cloud (Daytona) sandboxes when
working on **this repo** (`freebuff-private`). The goal is to stay within the
sandbox disk budget: install only what Freebuff Web needs, avoid producing large
build artifacts, and clean up reproducible outputs.

Cloud disk tiers (see `freebuff/web/codebase-utils/golden-image.ts`):

- **Cloud Standard** — 2 vCPU / 4 GB RAM / **6 GB disk** (use this for full
  install + typecheck of the monorepo)
- **Limited** — 1 vCPU / 2 GB RAM / **4 GB disk** (too tight for a full monorepo
  install; only use for light edits)

---

## 1. Installation — install the Freebuff Web workspace only

Do **not** run a plain root `bun install`. A full monorepo install is ~5+ GB and
will not fit comfortably on the sandbox disk.

Use the setup script, which does a filtered install, builds the SDK, and
typechecks Freebuff Web (no build output):

```bash
bash freebuff/web/scripts/cloud-typecheck-setup.sh
```

Under the hood:

```bash
bun install --filter '@codebuff/freebuff-web'   # only this workspace + its deps
cd sdk && bun run build                          # @codebuff/sdk dist
cd freebuff/web && bun run typecheck             # tsc --noEmit, no next build
```

Approximate footprint on a 6 GB Cloud disk:

| Component                     | Size          |
| ----------------------------- | ------------- |
| Shallow blobless clone        | ~80–150 MB    |
| Filtered `node_modules`       | ~900 MB–1.4 GB|
| `sdk/dist`                    | ~60 MB        |
| **Total**                     | **~1–1.6 GB** |

### Shallow clone

Cloud repo connect clones shallow + blobless + single-branch automatically
(`DaytonaCodebase.cloneRepo` defaults; `connectRepo.ts` passes the branch). If
you clone manually inside a sandbox, do the same:

```bash
git clone --depth 1 --filter=blob:none --single-branch \
  --branch main https://github.com/<org>/freebuff-private.git .
```

- `--depth 1` — latest commit only, no history
- `--filter=blob:none` — blobless; file contents fetched lazily on checkout
- `--single-branch` — only the default branch's ref

For this repo a shallow blobless clone is ~80–150 MB vs. the full history.

---

## 2. Do NOT build

Do not run `next build` (or `bun run build` / `build:next`) on a sandbox unless
you are explicitly deploying from it.

- `next build` produces `.next/`, and `.next/cache` alone can be **multiple GB**.
- Iterating with `next dev` and validating with `bun run typecheck` do **not**
  create that artifact.

If you need to verify the code, use:

```bash
cd freebuff/web && bun run typecheck
```

---

## 3. Cleanup — prune reproducible artifacts

If a build did run (or a build failed partway, or disk is getting low), reclaim
space with the prune script:

```bash
bash freebuff/web/scripts/prune-sandbox-artifacts.sh
```

It removes: `freebuff/web/.next`, `web/.next`, `node_modules/.cache`, `.turbo`,
and stray `*.tsbuildinfo` files.

From agent/backend code, call the equivalent method instead:

```ts
await codebase.pruneBuildArtifacts() // DaytonaCodebase
```

---

## Quick checklist

- [ ] Clone shallow (`--depth 1 --filter=blob:none --single-branch`) — automatic on connect
- [ ] Install with `cloud-typecheck-setup.sh` (filtered), not a root `bun install`
- [ ] Validate with `bun run typecheck`, not `next build`
- [ ] Never leave `.next/` on the sandbox — run `prune-sandbox-artifacts.sh` after any build
- [ ] Use the 6 GB Cloud Standard tier for install + typecheck; avoid the 4 GB Limited tier

## Related files

- `freebuff/web/scripts/cloud-typecheck-setup.sh` — filtered install + typecheck
- `freebuff/web/scripts/prune-sandbox-artifacts.sh` — artifact cleanup
- `freebuff/web/codebase-utils/codebase/DaytonaCodebase.ts` — `cloneRepo`, `pruneBuildArtifacts`
- `freebuff/web/codebase-utils/golden-image.ts` — disk/resource tiers
