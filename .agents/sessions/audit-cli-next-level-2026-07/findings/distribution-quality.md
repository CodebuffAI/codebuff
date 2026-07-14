## [HIGH] Correctness / State mutation / Error handling — cli/release/index.js:639 — Auto-update can silently terminate a healthy in-progress session

- **Risk:** The wrapper removes the child exit listener and kills the running CLI before the replacement has downloaded or validated, then swallows update failures, so a transient network, extraction, or filesystem error can end the user's active session with no actionable error while the old binary was still usable.
- **Fix:** Download, integrity-check, smoke-test, and atomically stage the replacement before asking the running CLI to exit, and preserve/relaunch the old binary with a visible warning if activation fails.
- **Evidence:** `checkForUpdates()` calls `runningProcess.removeListener('exit', exitListener)` at line 653 and `runningProcess.kill('SIGTERM')` at line 661 before `await downloadBinary(latestVersion)` at line 674; its catch at lines 694-696 is only `// Ignore update failures`. The staging wrapper duplicates this flow, while `release-wrapper.test.ts` has no update-failure/rollback scenario.
- **Confidence:** High — Evidence.

## [HIGH] Security — .github/workflows/cli-release-staging.yml:3 — PR-controlled code can enter a write-and-publish workflow with inherited secrets

- **Risk:** A same-repository pull request whose author adds `[codecane]` to its title can cause PR-head code and repository scripts to run in a workflow with `contents: write`, the release token, inherited client secrets, and later npm publication authority.
- **Fix:** Remove `pull_request` as a release trigger, require an environment-protected manual dispatch or trusted post-merge branch, pin the reviewed commit, and give each job only its minimum token/secrets.
- **Evidence:** The workflow listens to `pull_request` at lines 3-7, grants `contents: write` at lines 13-14, gates only on PR title text at lines 19-21, checks out `github.event.pull_request.head.sha` with a token at lines 25-28, and passes `secrets: inherit` into the reusable binary build at lines 118-127; the publish job then uses `NPM_TOKEN` at lines 232-237.
- **Confidence:** High — Evidence (fork PRs normally lose secrets, but same-repository PR heads remain in scope).

## [MEDIUM] Security / Dependency hygiene — cli/release/index.js:448 — Downloaded executables have no independent integrity or provenance verification

- **Risk:** The updater automatically executes a GitHub-release tarball after TLS download and extraction without checking a release manifest, digest, signature, or attestation, so a compromised release asset/CDN path or authorized release account becomes direct arbitrary-code execution on every updating client.
- **Fix:** Publish per-platform SHA-256 manifests plus signed provenance/Sigstore attestations, embed or fetch a trusted verification key/manifest, verify every archive before extraction, and expose the verified digest in diagnostics.
- **Evidence:** `downloadUrl` is constructed at lines 448-451 (and is runtime-overridable by `OPENBUFF_DOWNLOAD_BASE`), the response is streamed directly through gunzip and `tar.x()` at lines 498-507, and the resulting file is renamed into the executable cache at lines 527-546; `cli-release-build.yml` creates and uploads tarballs at lines 278-298 and 431-443 without checksum/signing/SBOM steps.
- **Confidence:** High — Evidence.

## [MEDIUM] State mutation / Error handling — cli/release/postinstall.js:7 — Package installation destroys the offline fallback before replacement is available

- **Risk:** Every npm install/upgrade deletes the cached working executable immediately, so the next invocation becomes network-dependent and cannot roll back or continue offline if the registry, GitHub, proxy, or new release is unavailable.
- **Fix:** Retain versioned binaries and metadata, download into a new slot on first launch, atomically switch only after verification/smoke, and provide `openbuff update --rollback` plus an explicit cache-prune command.
- **Evidence:** The postinstall script says `Clean up managed binaries so the wrapper downloads a fresh copy` and unconditionally calls `fs.unlinkSync(...)` at lines 7-18; `ensureBinaryExists()` then exits when it cannot resolve/download latest at `cli/release/index.js:606-636`. Staging repeats the destructive postinstall behavior.
- **Confidence:** High — Evidence.

## [MEDIUM] Test coverage gaps / Correctness — .github/workflows/cli-release-prod.yml:81 — Release publication is not gated by repository validation or an exact version assertion

- **Risk:** The production workflow can tag and publish a compiled binary from a repository state that fails the normal architecture/typecheck gate, and its smoke step accepts any successfully printed version rather than proving it equals the release version.
- **Fix:** Make release depend on the exact commit's required CI checks, run the env architecture check and CLI tests in the reusable workflow, and assert `"$($BIN --version)" = "${{ inputs.new-version }}"` before packaging.
- **Evidence:** Production goes directly from version bump to the reusable build at lines 81-90; the reusable workflow compiles at `cli-release-build.yml:232-241` and merely runs `"$BIN" --version` at lines 269-276/423-429. At 2026-07-11 23:22 EAT, `bun scripts/check-env-architecture.ts` failed on direct `process.env` use at `cli/src/native/ripgrep.ts:24`, while `bun run --cwd cli typecheck` passed, demonstrating a release-relevant repository gate that this workflow does not run.
- **Confidence:** High — Evidence, time-of-check stated because the dirty worktree was changing concurrently.

## [MEDIUM] API/ABI contract breaks / Correctness — cli/release/index.js:274 — Version sources and tests mask release-wrapper/binary drift

- **Risk:** Local wrapper tests and source invocations report the private workspace version instead of the published wrapper version, allowing release metadata, compiled binaries, and wrapper behavior to drift without a failing gate or trustworthy diagnostic.
- **Fix:** Define one release-version source, make source and packed-package tests exercise the actual published layout, assert wrapper/binary/npm/GitHub tag equality, and never keep a stale executable at the canonical development path.
- **Evidence:** `getLocalPackageVersion()` checks `../package.json` before its own package at lines 274-288; `release-wrapper.test.ts:15-18` deliberately reads `cli/package.json`, so both wrapper tests passed while source `node cli/release/index.js --version`, staging, and `cli/bin/openbuff --version` all reported `1.0.0`. At 2026-07-11 23:22 EAT, `cli/release/package.json:3` was `1.2.4`, `cli/release-staging/package.json:3` was `1.0.420`, `cli/package.json:3` was `1.0.0`, and the built binary was dated 2026-06-29 while current source files were dated 2026-07-11.
- **Confidence:** High — Evidence.

## [MEDIUM] Security / API contract breaks — common/src/analytics.ts:59 — Production runtime telemetry has no user-facing disable control

- **Risk:** Local/BYOK users can have runtime events sent to PostHog whenever production analytics configuration is embedded, but the code and documentation provide controls to increase telemetry detail rather than a documented opt-out, weakening the product's local-first privacy contract.
- **Fix:** Default telemetry off or add a clearly documented `OPENBUFF_TELEMETRY=off`/`DO_NOT_TRACK` gate honored by both runtime and wrapper paths, expose current telemetry state in `openbuff doctor`, and publish the exact event/property policy.
- **Evidence:** `common/src/analytics.ts` lazily creates a real PostHog client in production and captures events at lines 59-89; the production binary workflow exports client secrets/env at `cli-release-build.yml:158-173`; agent runtime calls it from `packages/agent-runtime/src/main-prompt.ts:67-88`. `docs/environment-variables.md:9-10` documents only `CODEBUFF_FULL_TELEMETRY*`, which disables sampling and may send full log payloads, not a disable switch. Separately, `cli/src/utils/analytics.ts:140-160` is now a no-op, making `common/src/analytics.knowledge.md:73-114` stale about CLI alias/identify behavior.
- **Confidence:** High — Evidence.

## [MEDIUM] Test coverage gaps / Platform parity — .github/workflows/cli-release-build.yml:40 — Linux ARM64 is published without executing its binary

- **Risk:** ABI, loader, native dependency, tree-sitter, and startup regressions specific to Linux ARM64 can pass release automation and reach users because that artifact is never booted.
- **Fix:** Add a native ARM64 runner or QEMU/container execution lane that runs the same version, tree-sitter, boot, and ripgrep smoke suite before upload.
- **Evidence:** The `linux-arm64` matrix entry explicitly sets `smoke_test: false` at lines 40-46, and the smoke job is skipped when false at lines 258-276; the checked-in `sdk/vendor/ripgrep/arm64-linux/rg` is an AArch64 dynamically linked ELF, making loader/platform validation material.
- **Confidence:** High — Evidence.

## [LOW] Error handling / Performance — cli/release/http.js:144 — Redirect following is unbounded and incompletely tested

- **Risk:** A bad proxy/CDN redirect loop can keep allocating requests and sockets until failure, while 307/308 responses are not followed even though artifact hosts may use them.
- **Fix:** Implement a small redirect budget, validate `Location`, support the intended redirect status set, preserve timeout/cancellation across the chain, and test loops, missing locations, downgrade attempts, proxy auth, custom CA, and `NO_PROXY` edge cases.
- **Evidence:** `httpGet()` recursively calls itself for 301/302 at lines 144-155 with no redirect counter; `proxy-http-get.test.ts:161-239` covers exactly one 302 redirect and has no loop/limit, TLS failure, CA, timeout, or `NO_PROXY` assertions.
- **Confidence:** High — Evidence.

## [MEDIUM] API/ABI contract breaks / Documentation — cli/release/README.md:23 — Published usage documents a positional project directory that the CLI parses as a prompt

- **Risk:** Users following `openbuff [project-directory]` can accidentally send a filesystem path as the initial agent prompt while Openbuff operates in the current directory, potentially editing the wrong project.
- **Fix:** Document `cd <project> && openbuff` or `openbuff --cwd <project>` everywhere, add an end-to-end docs contract test, and consider rejecting a directory-looking positional argument with migration guidance.
- **Evidence:** The published README says `openbuff [project-directory]` and claims it changes the directory at lines 23-31 (staging says the same at lines 25-33), while `cli/src/index.tsx:125-140` defines only `--cwd <directory>` plus positional `[prompt...]`, and lines 152-163 join all positional args into `initialPrompt`.
- **Confidence:** High — Evidence.

## Strengths observed

- The supported artifact matrix is explicit and now covers Linux x64/ARM64, macOS Intel/current, macOS Intel legacy, macOS Apple Silicon, and Windows x64; macOS legacy deployment targets are checked with `vtool`.
- The compiled-binary gate goes beyond `--help`/`--version`: `smoke-binary.ts` holds the process open, checks a visible boot signal, and separately validates tree-sitter initialization. The existing 2026-06-29 Linux binary passed this smoke at audit time.
- Proxy support is factored into a shared production/staging HTTP helper, uses CONNECT tunneling for HTTPS, honors upper/lowercase proxy variables and `NO_PROXY`, applies request timeouts, and has parity tests for the two wrappers.
- Runtime fatal handling deliberately restores raw mode, alternate-screen state, mouse/focus modes, bracketed paste, and cursor visibility; native crash diagnostics include platform/hardware/target details.
- Production/staging wrapper HTTP files were byte-identical, and their larger entrypoints were close enough in structure for direct parity comparison; targeted wrapper/proxy/analytics/error tests passed 60/60 at audit time.

## Coverage / files actually read

All eight domains were evaluated: Security, Correctness, State mutation, Error handling, Performance, Dependency hygiene, Test coverage gaps, and API/ABI contract breaks. Read or selectively inspected: `cli/release/{index.js,http.js,postinstall.js,package.json,README.md}`, all corresponding `cli/release-staging/*` files, `cli/scripts/{build-binary.ts,smoke-binary.ts,release.ts}`, `cli/package.json`, root `package.json`, `.bun-version`, `bunfig.toml`, relevant `bun.lock` entries, checked-in Linux ripgrep binary metadata, all four CLI/release workflows plus `ci.yml`, `nightly-e2e.yml`, and `sdk-release.yml`; `cli/src/index.tsx`, logger/analytics/error handling/error UI files; common analytics core/dispatcher/sampling/contracts/knowledge and their tests; wrapper/proxy/error tests; and the listed top-level/CLI/Windows/development/testing/environment/local-mode/configuration/security/contribution docs. Existing `.agents/sessions/**` audit reports/findings were not read.
