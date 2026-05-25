# Public Repo Sync

This private repository is the source of truth. The public repository is an exported snapshot built from an allowlist of public paths plus generated public-safe root config.

The public export should be conservative: missing a public file is fixable; publishing a private file is not.

## Public Repository

Target repository:

- `CodebuffAI/codebuff` for the current public repo
- `CodebuffAI/freebuff` after the public repo rename, if we do that

The sync should only run from `freebuff-private`. The public repo should not copy changes back into this repo automatically.

## Public Paths

The path allowlist lives in `scripts/public-export-manifest.txt`.

Public source code:

- `agents/`
- `cli/`
- `common/`
- `freebuff/`, excluding `freebuff/web/`
- `packages/agent-runtime/`
- `packages/code-map/`
- `packages/llm-providers/`
- `sdk/`

Public support files:

- `assets/`
- `scripts/tmux/`
- selected public docs
- root project metadata such as `README.md`, `LICENSE`, `NOTICE`, `.gitignore`, `.bun-version`, `bunfig.toml`, and TypeScript/prettier/eslint config

Generated or overridden public files:

- `package.json`
- `tsconfig.json`
- `bun.lock`
- `.github/workflows/ci.yml`
- `AGENTS.md`
- `CONTRIBUTING.md`
- `bunfig.toml`
- package-specific `bunfig.toml` files that would otherwise preload private test setup

## Private Paths

These must not be present in the public export:

- `web/`
- `freebuff/web/`
- `packages/internal/`
- `packages/billing/`
- `packages/bigquery/`
- `packages/build-tools/`
- `scripts/`, except `scripts/tmux/`
- private GitHub workflows and deployment workflows
- `.env*`, `.envrc`, Infisical docs, Render deployment config, deploy hooks, and production secret references

The current `freebuff/web` app stays private because it imports `@codebuff/internal` and `@codebuff/billing`.

## Workflows

Private repo workflows:

- full CI
- backend/web deploys
- DB and billing jobs
- eval workflows that need private services or secrets
- the public sync workflow

Public repo workflows:

- public CI only, starting with install plus SDK/Freebuff build smoke checks
- no backend deploys
- no Render deploys
- no DB, billing, bot-sweep, or eval workflows that require private secrets

## Sync Script

The draft script is `scripts/sync-public-repo.sh`.

Safe local preview:

```bash
PUBLIC_SYNC_DRY_RUN=1 scripts/sync-public-repo.sh
```

Real sync, after review:

```bash
PUBLIC_REPO_URL=https://x-access-token:$PUBLIC_REPO_PUSH_TOKEN@github.com/CodebuffAI/codebuff.git \
PUBLIC_SYNC_DRY_RUN=0 \
scripts/sync-public-repo.sh
```

The script:

1. Exports only allowlisted paths from private `HEAD`.
2. Deletes explicitly excluded paths such as `freebuff/web`.
3. Replaces root `package.json` and `tsconfig.json` with public-safe versions.
4. Installs public-safe root templates and package overlays from `scripts/public-export/`.
5. Regenerates `bun.lock` for the public workspace subset.
6. Runs structural and import leak checks.
7. In dry-run mode, leaves a preview in `.context/public-export-preview`.
8. In real mode, commits and pushes a generated snapshot to the public repo.

## GitHub Action

`.github/workflows/sync-public-repo.yml` is intentionally manual-only for now. It defaults to dry-run and requires a typed confirmation before it can push.

Before enabling scheduled or push-triggered syncs:

1. Review the manifest.
2. Run the script locally in dry-run mode.
3. Inspect `.context/public-export-preview`.
4. Run public CI against the preview.
5. Add `PUBLIC_REPO_PUSH_TOKEN` to `freebuff-private`. The token should only have write access to the public repo.
6. Run the manual workflow in dry-run mode.
7. Run the manual workflow with pushing enabled.
8. Only then add `push` or `schedule` triggers.

## Open Decisions

- Whether the public target remains `CodebuffAI/codebuff` or is renamed to `CodebuffAI/freebuff`.
- Whether `evals/` should remain public after a separate audit. It currently contains code that references private services.
- Whether public docs should include sanitized versions of architecture/request-flow/error-schema docs.
- Whether public PRs are manually ported into private or imported by automation later.
- How much typecheck/test coverage public CI should run after the exported subset is decoupled from private-only test setup.
