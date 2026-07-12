# Distribution and operational quality file manifest

## Scope

Independent file-picker manifest for packaging/release wrappers and versioning; binary build and smoke validation; Linux/macOS/Windows/WSL compatibility; native dependencies; analytics/privacy/logging; crash/error containment; dependency hygiene; CLI-facing documentation; CI/release testing; release freshness and operational diagnostics. This is navigation only, not an audit or recommendation set.

## Subshard A — production npm wrapper, updater, download, and crash diagnostics (1,187 LOC)

- `cli/release/index.js` — production Node wrapper entry point. Key flow: `createConfig` → platform detection (`getHardwareArch`, `getMacOSVersion`, `getPlatformKey`, `assertSupportedPlatform`) → registry/version resolution (`getLatestVersion`, `getCurrentVersion`, `compareVersions`) → `downloadBinary`/extraction/metadata → `ensureBinaryExists` → child execution/update checking → `printCrashDiagnostics`.
- `cli/release/http.js` — proxy-aware HTTP(S), TLS, redirect and timeout client used for registry and binary downloads; main symbol `createReleaseHttpClient`.
- `cli/release/postinstall.js` — installation messaging and cached-binary cleanup behavior.
- `cli/release/package.json` — published package version, aliases (`openbuff`, `cb`), supported OS/CPU matrix, Node floor, tar dependency, uninstall cleanup.
- `cli/release/README.md` — user installation, platform support, cache/update and corporate proxy troubleshooting.

Related tests:

- `cli/src/__tests__/release-wrapper.test.ts` — wrapper/platform/version/update/crash behavior.
- `cli/src/__tests__/release/proxy-http-get.test.ts` — HTTP client proxy, TLS and redirect behavior.

## Subshard B — staging wrapper parity and release freshness (1,166 LOC)

- `cli/release-staging/index.js` — staging (`codecane`) counterpart to the production updater; compare flow and drift against `cli/release/index.js`.
- `cli/release-staging/http.js` — staging copy of release HTTP client.
- `cli/release-staging/postinstall.js` — staging cache cleanup/install messaging.
- `cli/release-staging/package.json` — staging package identity/version/platform matrix.
- `cli/release-staging/README.md` — staging install and troubleshooting documentation.

Key flow: staging package/workflow version → npm registry lookup → platform artifact URL → local `~/.config/openbuff` cache → child binary. Treat production/staging duplication and synchronization as an explicit audit boundary.

## Subshard C — binary compilation, native assets, smoke gates, and release trigger (802 LOC)

- `cli/scripts/build-binary.ts` — Bun compile target selection, injected version/env values, OpenTUI native bundle acquisition/patching, tree-sitter WASM and ripgrep bundling, legacy macOS handling. Key symbols: `getTargetInfo`, `main`, `assertLegacyMacOSBuildConfig`, `patchOpenTuiNativeEntryForLegacy`, `patchOpenTuiAssetPaths`, `ensureOpenTuiNativeBundle`.
- `cli/scripts/smoke-binary.ts` — boot-level binary validation beyond `--help`/`--version`; detects boot signals and fatal patterns and exercises tree-sitter startup.
- `cli/scripts/release.ts` — local GitHub workflow-dispatch client and token/version input handling.

Related manifests/native inputs:

- `cli/package.json` — binary/release scripts and runtime/native-adjacent dependencies (`@opentui/*`, `jimp`, `systeminformation`, `terminal-image`, `yoga-layout`, `node-machine-id`).
- `package.json`, `bun.lock`, `.bun-version`, `bunfig.toml` — workspace runtime pinning, overrides and dependency-resolution source of truth. `bun.lock` is large (~270 KB); inspect selectively by relevant package names rather than linearly.
- `sdk/vendor/ripgrep/x64-linux/rg`, `sdk/vendor/ripgrep/arm64-linux/rg` — checked-in Linux native executables consumed by distribution-related flows; binary inspection only, no generated-bundle review.

## Subshard D — release and CI automation matrix (1,240 LOC)

- `.github/workflows/cli-release-build.yml` — cross-platform artifact build matrix, native dependency preparation, smoke/upload orchestration. Large single workflow (443 LOC), but group remains below ~3k LOC.
- `.github/workflows/cli-release-prod.yml` — production versioning/publish/release orchestration.
- `.github/workflows/cli-release-staging.yml` — staging versioning/publish/release orchestration.
- `.github/workflows/ci.yml` — normal typecheck/test/build gates and platform coverage.
- `.github/workflows/nightly-e2e.yml` — scheduled CLI/runtime end-to-end signal.
- `.github/workflows/sdk-release.yml` — adjacent release conventions and package-version hygiene for comparison.

Key flow: workflow dispatch/tag/version selection → matrix binary build → smoke gate → GitHub release artifacts → npm wrapper publication. Verify OS/architecture runners, artifact naming, secrets, caching, permissions, concurrency, failure diagnostics and production/staging parity.

Related tests/scripts:

- `cli/src/__tests__/e2e-cli.test.ts`, `cli/src/__tests__/integration-tmux.test.ts`, `cli/scripts/validate-cli-with-tmux.sh` — executable/TUI integration coverage.
- `scripts/openbuff-smoke.ts` — provider-level local smoke path (`OPENBUFF_SMOKE_OK` contract), distinct from compiled-binary boot smoke.
- `scripts/run-tests-summary`, `docs/testing.md` — repository test execution/reporting conventions.

## Subshard E — runtime fatal paths, logging, analytics, and privacy boundary (1,509 LOC)

- `cli/src/index.tsx` — CLI version loading/argument parsing, initialization, platform-specific TTY handling, early `uncaughtException`/`unhandledRejection` handlers and transition to normal runtime.
- `cli/src/utils/logger.ts` — Pino file logging, log location/lifecycle, context enrichment, analytics-dispatch coupling and analytics error reporting.
- `cli/src/utils/analytics.ts` — current CLI analytics API/stubs, dependency seams, identification/error APIs.
- `cli/src/utils/error-handling.ts` — safe user-facing error extraction vs internal diagnostic logging.
- `cli/src/components/error-boundary.tsx` — React/OpenTUI error fallback boundary behavior.
- `cli/src/components/user-error-banner.tsx`, `cli/src/utils/error-messages.ts`, `cli/src/utils/validation-error-helpers.ts` — adjacent user-visible failure presentation.
- `common/src/analytics.ts`, `common/src/analytics-core.ts` — shared PostHog client/config and tracking behavior.
- `common/src/util/analytics-log.ts`, `common/src/util/analytics-dispatcher.ts`, `common/src/util/analytics-sampling.ts` — event recognition, routing and sampling policy.
- `common/src/constants/analytics-events.ts`, `common/src/types/contracts/analytics.ts`, `common/src/types/contracts/logger.ts`, `common/src/analytics.knowledge.md` — event/schema/contracts and intended policy.

Related tests:

- `common/src/util/__tests__/analytics-log.test.ts`, `common/src/util/__tests__/analytics-dispatcher.test.ts`, `common/src/util/__tests__/analytics-sampling.test.ts`.
- `cli/src/components/__tests__/user-error-banner.test.tsx`, `cli/src/utils/__tests__/validation-error-formatting.test.ts`.

## Subshard F — cross-platform and operational documentation (800 LOC)

- `README.md`, `README.zh-CN.md` — top-level install/upgrade/feature and support claims.
- `WINDOWS.md` — Windows native/WSL setup, shell/toolchain and known-platform guidance.
- `cli/README.md` — CLI development and invocation notes.
- `docs/development.md` — supported development/runtime workflow and operational logs.
- `docs/testing.md` — CI/local/TMUX test strategy.
- `docs/environment-variables.md` — environment-variable and diagnostics configuration contract.
- `docs/local-mode.md`, `docs/configuration.md`, `SECURITY.md`, `CONTRIBUTING.md` — adjacent BYOK/privacy, config, vulnerability-reporting and contributor operational claims.

Cross-check documentation claims against the published wrapper OS/CPU matrix, workflow matrix, Bun/Node requirements, binary cache path, update behavior, proxy support, diagnostics/log paths and analytics state.

## Explicit exclusions

- `node_modules/**`, compiled `dist/**`/`build/**`, release archives, generated agent/type-source bundles, and binary contents beyond identifying checked-in native artifacts.
- Existing audit manifests/findings under `.agents/sessions/**`; this manifest was independently discovered from `MAP.md`, repository paths, manifests and symbol searches.
- Provider/model UX, chat interaction design, agent orchestration quality, indexing/retrieval quality, and general SDK API design except where directly required by CLI packaging, native assets, logging, analytics, tests or release operations.
- Historical changelog entries under `scripts/changelog/**` except a later auditor may sample them solely to compare documented release cadence/freshness.

## Size notes

No proposed subshard exceeds ~3k source LOC. The combined surface is intentionally split because the full set is ~7.6k LOC plus the lockfile and binary assets. The largest individual files are the production/staging wrappers (~800 LOC each) and `cli/scripts/build-binary.ts` (~500 LOC).
