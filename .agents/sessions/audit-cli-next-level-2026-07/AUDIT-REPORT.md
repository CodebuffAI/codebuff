# Openbuff CLI Independent Audit Report

## Executive verdict

Openbuff's current CLI is **feature-rich and technically ambitious, but not release-ready at the audited worktree state**. It already offers a genuinely strong terminal agent experience: broad provider support, sophisticated keyboard and attachment flows, rich tool/subagent progress, thoughtful terminal cleanup, multi-platform packaging, and a large focused test surface. The central weakness is not lack of capability; it is that several trust boundaries are less mature than the feature surface they protect. Configuration edits can overwrite unrelated settings, project histories can collide, cancellation can fork model history from visible history, project switching can retain the wrong project context, and update/release paths can interrupt sessions or expose publication authority.

The CLI therefore feels closer to a strong advanced preview than a dependable general release. A user can accomplish a great deal, and the normal path is polished enough to impress, but several uncommon-looking paths are actually ordinary operations: changing a route, opening two same-named repositories, cancelling and immediately continuing, selecting a project, or receiving an update. Those paths need to become transactional and test-gated before the product can make a high-confidence local-first/BYOK reliability claim.

### Scorecard — inference, not a measured benchmark

| Area                                |      Score | Inferred assessment                                                                                                                                                                                                                                                        |
| ----------------------------------- | ---------: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Capability breadth                  | **8.5/10** | Commands, palettes, prompt history, attachments/images, providers, OAuth, local agents/skills, queueing, checkpoints, tool and subagent rendering, and broad platform packaging form an unusually complete CLI surface.                                                    |
| Interaction UX                      | **7.0/10** | Centralized keyboard classification and rich input behavior are strong, but file search truncation, uncancellable shell jobs, blocking attachment/history work, hidden shortcuts under overlays, and prompt-loss paths undermine predictability.                           |
| Onboarding/configuration            | **5.5/10** | Provider readiness and OAuth security controls are good; destructive route writes, stale project bootstrap, basename project collisions, mouse-only core actions, and silent configuration/agent-load errors are serious onboarding trust defects.                         |
| Runtime reliability/state integrity | **5.0/10** | Cancellation propagation, retry logic, streaming batching, and checkpoints are strong foundations, but continuation races, non-atomic completed saves, dropped queued sends, ignored runtime errors, and async event-ordering contract breaks remain.                      |
| Presentation/accessibility          | **6.5/10** | The baseline TUI is calm and information-rich, with good diff/tool rendering and terminal compatibility work; keyboard accessibility, overlay ownership, scroll state, color-independent semantics, and real render-failure isolation need work.                           |
| Distribution/operations             | **4.5/10** | Platform coverage, smoke testing, proxy support, and terminal cleanup are substantial, but update ordering, staging workflow authority, unsigned downloads, destructive cache replacement, version drift, telemetry control, and ARM64 validation are below release-grade. |
| Test/release readiness              | **5.0/10** | The suite is large and source help/typecheck pass, but the final isolated CLI suite is **2,327 pass / 30 fail / 15 skip**; release workflows do not require the relevant full validation, and several tests encode or bypass the failure modes found here.                 |
| **Overall**                         | **6.0/10** | **Strong product depth, medium user trust, low current release confidence.** The score weights state integrity, security, and release safety more heavily than cosmetic polish.                                                                                            |

## Top 10 highest-leverage findings

All ten are retained as **High** severity from the underlying evidence. Ordering within High prioritizes security, data/context isolation, irreversible mutation, and release/session integrity.

1. **[HIGH] A PR-controlled staging path can reach write-and-publish authority.** A same-repository PR title can trigger PR-head code in a workflow with `contents: write`, inherited secrets, release credentials, and later npm publication authority. Remove the PR release trigger and require protected, reviewed, pinned-commit execution. Evidence: `.github/workflows/cli-release-staging.yml:3-28,118-127,232-237`.

2. **[HIGH] Project history identity collides for repositories with the same basename.** `/work/client/app` and `/work/internal/app` share the same project data directory, so history, checkpoints, and `--continue` can expose or resume another project's state. Key storage by canonical absolute path plus a stable hash and migrate legacy directories. Evidence: `cli/src/project-files.ts:50-59`; `cli/src/utils/run-state-storage.ts:121-145`.

3. **[HIGH] Editing one model route can overwrite unrelated configuration.** The editable draft omits supported configuration fields and the force-write can reset or delete indexing, vision, failover, hooks, run limits, and discovery/capability metadata. Persist source-aware fragments or complete lossless drafts atomically. Evidence: `cli/src/utils/openbuff-provider.ts:346-364`; `docs/configuration.md:33-48,135-186,231-260`.

4. **[HIGH] Cancellation can permanently fork visible UI history from SDK/model history.** Escape admits a new send before the cancelled run returns its authoritative preserved state, and aborted completion is discarded rather than becoming the next continuation base. Introduce a `cancelling` state and serialize or explicitly merge continuation state. Evidence: `cli/src/hooks/helpers/send-message.ts:353-375`; `cli/src/hooks/use-send-message.ts:581-592`; `sdk/src/__tests__/run-cancellation.test.ts:945-1107`.

5. **[HIGH] Auto-update can kill a healthy active session before a replacement exists.** The wrapper terminates the child, then downloads, validates inadequately, and swallows failure. Stage, integrity-check, smoke-test, and atomically activate before stopping or relaunching the current binary. Evidence: `cli/release/index.js:639-696` and the parallel staging wrapper.

6. **[HIGH] Project selection changes `cwd` without reinitializing project-scoped state.** The first-run picker can leave direnv, agents/MCP, skills, caches, and index state bound to the launch directory. Make project switching one cancellable bootstrap transaction. Evidence: `cli/src/index.tsx:293-300,343-368`; `cli/src/init/init-app.ts:19-65`.

7. **[HIGH] The SDK promises async event handlers but dispatches them fire-and-forget.** Events may reorder and `client.run()` may resolve before callback side effects finish. Serialize and drain an awaited event queue, or narrow the public contract. Evidence: `sdk/src/run.ts:152-168,530-570,719-725`; `common/src/types/contracts/client.ts:63`; `sdk/e2e/utils/event-collector.ts:27-38`.

8. **[HIGH] A public local-agent loader contract changed silently in the dirty worktree.** Its new default excludes project agents despite JSDoc and published documentation promising project/parent discovery, breaking callers without a type error. Preserve the SDK default or make the trust change an explicit versioned API with migration guidance. Evidence: `sdk/src/agents/load-agents.ts:146-172,207-222`; `README.md:177`; `docs/agents-and-tools.md:10-12`.

9. **[HIGH] Core onboarding actions are mouse-only.** Keyboard-only users can browse but cannot activate the project picker's `Open` action; the shared button primitive also affects OAuth configure/disconnect/retry/close actions. Add focus and keyboard activation semantics plus end-to-end keyboard tests. Evidence: `cli/src/components/button.tsx:43-69`; `cli/src/components/project-picker-screen.tsx:269-285,486-501`; `cli/src/components/chatgpt-connect-banner.tsx:174-205,226-239`.

10. **[HIGH] The final isolated CLI test suite is not green.** The final result was **2,327 pass / 30 fail / 15 skip**: 29 failures in `cli/src/__tests__/integration/local-agents.test.ts` and one in `init-type-sources.test.ts`. Repair the trust/default/test-isolation contract, regenerate init type sources, and make this isolated suite a release gate. Evidence: `cli/src/__tests__/integration/local-agents.test.ts:1`; independent final validation summary.

## Evidence

- Five independent discovery/audit pairs covered onboarding/configuration, interaction/commands, runtime/state, presentation, and distribution/operations. Every pair evaluated security, correctness, state mutation, error handling, performance, dependency hygiene, test gaps, and API/ABI breaks.
- The findings include direct file-and-line inspection, bounded reproductions, targeted tests, built-binary smoke checks, and isolated terminal captures. Duplicate observations, notably the command-palette 50-file cap, are consolidated here.
- Final validation state: `bun run cli/src/index.tsx --help` passed; `bun run --cwd cli typecheck` passed; built `--help` and `--version` passed; isolated 120x36 and 80x24 startup captures passed; the final isolated CLI suite reported **2,327 pass / 30 fail / 15 skip**.
- Several positive controls were directly substantiated: provider endpoint validation, PKCE/state/loopback OAuth controls, cross-origin authorization protection, abort-aware bounded retries, cancellation cleanup, checkpoint temp-write/rename, sensitive-file filtering, terminal-mode restoration, binary boot/tree-sitter smoke tests, and proxy parity tests.

## Inference

- The scores and overall **6.0/10** are synthesis judgments, not empirical usability or reliability measurements. They intentionally weight security, user data/context integrity, release safety, and recovery more heavily than breadth or visual polish.
- The project-skill trust issue is a medium-confidence security inference from load order and prompt injection behavior, not a demonstrated exploit against a user.
- Synchronous filesystem findings are inferred responsiveness risks from render-thread I/O patterns; no large-repository latency benchmark was run.
- Plain-text terminal captures cannot establish color contrast or prove that styled text was absent, so presentation conclusions based on captures remain cautious.
- The public local-agent loader regression is evidence from the actively changing, uncommitted worktree and may not represent a released version.

## Unknowns and limits

- No live provider/model calls were made. Real network behavior, provider failover UX, rate-limit recovery, token refresh under adverse networks, and long-running model sessions were not exercised end to end.
- No production publication or updater activation was performed. Release conclusions come from workflow/wrapper behavior and deterministic tests.
- The worktree changed during the audit. Two transient parse failures were observed and later fixed by another actor; they are not final open findings. Time-sensitive version and architecture-gate observations are tied to the recorded audit state.
- Unrelated standalone SDK behavior, agent prompt quality, inactive historical code, editor settings, generated bundles, dependencies, and compiled outputs were outside scope except at explicit CLI boundaries.
- Accessibility was assessed from code and terminal captures, not with assistive-technology user testing.

## Cross-cutting findings

### Transactions are missing at state boundaries

Several unrelated defects share one architectural cause: multi-step mutations are treated as ordinary sequential operations rather than transactions. Route configuration is reconstructed from an incomplete draft (`cli/src/utils/openbuff-provider.ts:346-364`); completed chats are written as two live files (`cli/src/utils/run-state-storage.ts:93-105`); project switching changes only part of project state (`cli/src/index.tsx:343-368`); history uses unlocked read-modify-rewrite (`cli/src/hooks/use-input-history.ts:65-75`); and updater/postinstall flows remove the working state before the replacement is committed (`cli/release/index.js:639-696`; `cli/release/postinstall.js:7-18`). A shared design rule—prepare, validate, atomically commit, preserve rollback—would eliminate multiple high- and medium-severity classes.

### Trust policy is fragmented across agents, skills, configuration, telemetry, and release

Project-agent trust was changed at one API boundary while project skills still load and can shadow global skills (`cli/src/utils/skill-registry.ts:22-31`; `sdk/src/skills/load-skills.ts:159-178,221-234`). Runtime telemetry lacks a user-facing disable control (`common/src/analytics.ts:59-89`). Release downloads have no independent integrity verification (`cli/release/index.js:448-546`), and staging authority is reachable from a PR trigger. These are all facets of one product promise: users should know which local, repository, network, and published inputs they are trusting.

### The UI has rich states, but ownership and failure propagation are inconsistent

Openbuff represents detailed tool and agent progress, yet provider retry/connection state is hard-coded or absent (`cli/src/hooks/use-connection-status.ts:6-10`), runtime error events are ignored (`cli/src/utils/sdk-event-handlers.ts:745-759`), shell jobs cannot be cancelled (`cli/src/commands/router.ts:76-82`), nested render fallbacks do not catch (`cli/src/components/error-boundary.tsx:10-30`), and global shortcuts remain active under some overlays (`cli/src/chat.tsx:1339-1347`). The next UX leap is less about adding panels and more about giving every asynchronous operation one visible owner, state machine, cancellation path, and recovery action.

### Tests are abundant but miss cross-boundary failure contracts

Focused unit coverage is a genuine strength, but the most consequential defects sit between components: cancel-A/send-B, queue-to-send rejection, two-file persistence failure, project switch rebootstrap, updater rollback, published version consistency, and production parser behavior. Some tests reconstruct a test-only parser (`cli/src/__tests__/cli-args.test.ts:15-51`), manually inject continuation state (`cli/src/hooks/helpers/__tests__/send-message.test.ts:1380-1394`), or assert helper caps without exercising real searchable scope (`cli/src/components/__tests__/command-palette-screen.test.ts:63-73`). Release confidence requires scenario tests around ownership and commit points.

### Main-thread synchronous I/O appears in several interactive features

First-run browsing, `@` mentions, directory/file attachments, and chat history all perform broad synchronous filesystem work (`cli/src/utils/directory-browser.ts:15-49`; `common/src/project-file-tree.ts:140-229`; `cli/src/utils/pending-attachments.ts:347-438`; `cli/src/utils/chat-history.ts:48-114`). These should converge on asynchronous, cancellable, indexed primitives rather than receive isolated micro-fixes.

## What is already genuinely strong

- **Breadth with coherent interaction primitives.** Keyboard classification is centralized and well tested; slash commands have one registry, aliases, typo suggestions, presets, palette discovery, and prompt-history search. Input supports ANSI-safe paste, long-paste attachment conversion, mentions, images, binary detection, compression, and provider-boundary normalization.
- **Provider and credential foundations.** Provider schemas constrain endpoints and key transport; discovery is cancellable and avoids leaking authorization cross-origin; OAuth uses PKCE, state validation, loopback callbacks, escaped HTML, sanitized exchange errors, and owner-only credential permissions. Readiness messages identify missing routes, keys, and OAuth before send.
- **Rich runtime observability.** Tool/subagent lifecycle, phases, context use/compaction, queue previews, failed agents, elapsed time, model, git stats, cost, and cache hit rate are represented. Streaming updates are batched and flushed at terminal states rather than naively rerendered for every chunk.
- **Cancellation and checkpoint foundations.** Runtime cancellation shares an abort signal, prevents new tools, waits for cooperative cleanup, stops browser sessions, and removes owned clone directories. Mid-turn checkpoints already use same-directory temporary files and rename, include turn identity, and reject stale or malformed snapshots.
- **Terminal craftsmanship.** Fatal handling restores raw mode, alternate screen, mouse/focus modes, bracketed paste, and cursor visibility. Theme/color compatibility is broad, diffs have parsed hunks, line gutters, truncation disclosure, collapsing, and unified `+`/`-` semantics.
- **Serious distribution effort.** The artifact matrix covers Linux x64/ARM64, macOS Intel/current and legacy, Apple Silicon, and Windows x64. Smoke testing includes long-lived startup and embedded tree-sitter initialization; proxy handling supports CONNECT, upper/lowercase variables, `NO_PROXY`, timeouts, and production/staging parity.
- **Large validation surface.** Even in the failing final run, 2,327 tests passed. Targeted onboarding tests passed 216/216, wrapper/proxy/analytics/error tests passed 60/60, and the source help/typecheck and built startup checks passed at final validation.

## Prioritized next-level feature roadmap

This roadmap derives from current gaps; it is not a generic competitor feature list.

### Now — stabilize the trust core

1. **Transactional project identity and switching.** Replace basename storage with canonical-path hashing and implement a single `switchProject()` transaction that reloads environment, config, agents/MCP, skills, indexes, and caches before chat becomes active. User impact: prevents cross-project history exposure and wrong-project execution. Gaps: `cli/src/project-files.ts:50-59`; `cli/src/index.tsx:293-300,343-368`.

2. **Lossless, atomic configuration editing.** Preserve every source fragment and unrelated field; validate a complete draft; write temporary files and atomically rename. Add byte/semantic preservation tests. User impact: makes provider/model changes safe and reversible. Gap: `cli/src/utils/openbuff-provider.ts:346-364`.

3. **Serialized run continuation and durable queue acceptance.** Add explicit run states (`running`, `cancelling`, `settling`), await or merge cancelled `RunState`, retain queued items until send acceptance, and drain async callbacks before run completion. User impact: no silent context or prompt loss after stop/retry. Gaps: `cli/src/hooks/helpers/send-message.ts:353-375`; `cli/src/hooks/use-send-message.ts:581-592`; `cli/src/hooks/use-message-queue.ts:294-302`; `sdk/src/run.ts:719-725`.

4. **Safe release/update pipeline.** Remove PR publication authority, require protected reviewed commits, publish signed checksums/provenance, stage and smoke replacements before activation, retain rollback binaries, and gate publication on exact-version/source/typecheck/isolated-suite checks. User impact: updates cannot silently terminate work or replace a working binary with an unverified/unvalidated one. Gaps: `.github/workflows/cli-release-staging.yml:3-28`; `cli/release/index.js:448-546,639-696`; `cli/release/postinstall.js:7-18`; `.github/workflows/cli-release-prod.yml:81-90`.

5. **Make the isolated CLI suite green and mandatory.** Resolve the 29 local-agent failures and generated init-type drift; test the production parser, project switch, cancellation continuation, queue rejection, persistence interruption, updater rollback, and async event ordering. User impact: converts the current broad test investment into release confidence. Gaps: `cli/src/__tests__/integration/local-agents.test.ts:1`; `init-type-sources.test.ts`; `cli/src/__tests__/cli-args.test.ts:15-51`; `cli/src/hooks/helpers/__tests__/send-message.test.ts:961-970,1380-1394`.

### Next — make trust and recovery visible in the UX

1. **Unified trust center / `openbuff doctor`.** Show project-agent and project-skill origins/shadowing, config parse diagnostics, telemetry state, credential/provider readiness, binary version/digest, and release provenance. User impact: users can understand what repository code and network services influence a run without reading logs. Gaps: `cli/src/utils/skill-registry.ts:22-31`; `sdk/src/provider-config.ts:1177-1194`; `common/src/analytics.ts:59-89`; `cli/release/index.js:448-546`.

2. **Structured resilience timeline.** Add provider attempt, retry scheduled, failover, recovery, recoverable runtime error, and terminal error events; render them with retry/cancel/copy-diagnostic actions and redact internal stacks. User impact: users know whether the agent is thinking, offline, retrying, failed over, or needs action. Gaps: `cli/src/hooks/use-connection-status.ts:6-10`; `common/src/types/print-mode.ts:189-205`; `cli/src/utils/sdk-event-handlers.ts:745-759`; `packages/agent-runtime/src/run-agent-step.ts:1574-1609`.

3. **Keyboard-complete modal and onboarding system.** Give the shared button focus/activation semantics, enforce one keyboard owner for every overlay, document shortcuts from the same registry, and add narrow/wide renderer-level keyboard journeys. User impact: the CLI becomes fully operable and predictable without a mouse. Gaps: `cli/src/components/button.tsx:43-69`; `cli/src/chat.tsx:1339-1347`; `cli/src/components/help-banner.tsx:59-105`.

4. **Cancellable job and attachment manager.** Give bash, file attachment, and directory ingestion explicit job IDs, progress, timeout/cancel, and retry; move filesystem work off the render thread. User impact: large files or hung commands no longer freeze or strand the session. Gaps: `cli/src/commands/router.ts:76-82`; `cli/src/utils/pending-attachments.ts:347-438`.

5. **Reliable session recovery.** Store completed chat state as one atomic versioned envelope (or committed multi-file generation), validate `--continue` containment, surface recovery choices, and preserve rejected queue/history writes. User impact: crashes and concurrent terminals stop turning into silent session loss or unexpected file ingestion. Gaps: `cli/src/utils/run-state-storage.ts:93-105,127-193`; `cli/src/hooks/use-input-history.ts:65-75`.

### Later — differentiation built on existing strengths

1. **Indexed, instant project navigation.** Reuse the code index or a persistent file metadata index for Ctrl+P, `@`, history, and directory attachments, with background invalidation and progressive results. User impact: monorepo-scale navigation stays responsive and complete. Gaps: `cli/src/components/command-palette-screen.tsx:170-191`; `cli/src/hooks/use-suggestion-engine.ts:641-671`; `cli/src/utils/chat-history.ts:48-114`.

2. **First-class run replay and branchable recovery.** Build on preserved cancelled run state and atomic checkpoints to offer resume from checkpoint, retry from failure, branch from a turn, and compare continuation histories. User impact: advanced users can recover and experiment without losing provenance. Foundations/gaps: `sdk/src/__tests__/run-cancellation.test.ts:945-1107`; checkpoint behavior in `cli/src/utils/run-state-storage.ts:216-256`; current cancellation gap at `cli/src/hooks/helpers/send-message.ts:353-375`.

3. **Verifiable local-first distribution.** Expose artifact digest, signature/provenance, telemetry policy, local data paths, cleanup/retention, and rollback directly in CLI diagnostics. User impact: BYOK/local-first becomes inspectable rather than merely asserted. Gaps: `cli/release/index.js:448-546`; `common/src/analytics.ts:59-89`; `cli/src/utils/clipboard-image.ts:18-23`.

4. **Adaptive terminal presentation with accessibility contracts.** Unify responsive tokens, add color-independent diff semantics, preserve reading position during streams, and validate readable renderer output across width/color modes. User impact: trustworthy review and navigation on narrow, monochrome, tmux, and accessibility-constrained terminals. Gaps: `cli/src/hooks/use-terminal-layout.ts:7-23`; `cli/src/hooks/use-scroll-management.ts:92-130`; `cli/src/components/tools/diff-viewer.tsx:459-502`.

## Remaining findings by audit domain and severity

The Top 10 are not repeated here. The command-palette 50-file cap appeared independently in interaction and presentation shards and is listed once.

### Security and privacy

- **[MEDIUM] `--continue` permits path traversal outside the chat directory.** Require a basename and containment check before reads. `cli/src/utils/run-state-storage.ts:127-134`; caller path `cli/src/index.tsx:121-160`; safe deletion precedent `cli/src/utils/chat-history.ts:129-139`.
- **[MEDIUM] Convenience git commands interpolate raw shell arguments.** `/diff` and `/changes` can execute shell metacharacters despite presenting as constrained git helpers. `cli/src/commands/command-registry.ts:352-371`; `cli/src/data/slash-commands.ts:169-177`.
- **[MEDIUM, inference] Project skills bypass the project-agent trust boundary and can shadow globals.** `cli/src/utils/skill-registry.ts:22-31`; `sdk/src/skills/load-skills.ts:159-178,221-234`; `cli/src/commands/command-registry.ts:1013-1069`.
- **[MEDIUM] Downloaded executables lack independent integrity/provenance verification.** `cli/release/index.js:448-546`; `.github/workflows/cli-release-build.yml:278-298,431-443`.
- **[MEDIUM] Production runtime telemetry has no documented user-facing disable control.** `common/src/analytics.ts:59-89`; `.github/workflows/cli-release-build.yml:158-173`; `packages/agent-runtime/src/main-prompt.ts:67-88`; `docs/environment-variables.md:9-10`.
- **[LOW] Clipboard images persist as plaintext files in a predictable shared temp directory without cleanup.** `cli/src/utils/clipboard-image.ts:18-23,175-201`.

### Correctness and state mutation

- **[MEDIUM] Completed chat persistence is not crash-atomic.** Two live files can become mismatched or truncated. `cli/src/utils/run-state-storage.ts:93-105,152-193`; safer checkpoint precedent `:216-256`.
- **[MEDIUM] Rejected queued sends are irreversibly dropped.** `cli/src/hooks/use-message-queue.ts:121-127,294-302`; `cli/src/hooks/use-chat-streaming.ts:154-170`.
- **[MEDIUM] Cross-terminal prompt-history writes can overwrite each other.** `cli/src/hooks/use-input-history.ts:65-75`; `cli/src/utils/message-history.ts:106-123`.
- **[MEDIUM] Ctrl+B can move the input cursor to `-1`.** `cli/src/components/multiline-input.tsx:940-948`; safe arrow path `:962-966`.
- **[MEDIUM] Palette file search permanently excludes paths beyond the first 50.** `cli/src/components/command-palette-screen.tsx:170-191`; test gap `cli/src/components/__tests__/command-palette-screen.test.ts:63-73`.
- **[MEDIUM] Hidden chat shortcuts remain active under command/history overlays.** `cli/src/chat.tsx:1339-1347`; `cli/src/utils/keyboard-actions.ts:168-183,327-354`.
- **[MEDIUM] Page-up incorrectly re-enables follow mode and can snap readers back to streaming output.** `cli/src/hooks/use-scroll-management.ts:66,92-100,126-130`.
- **[MEDIUM] Scroll listeners can remain attached to a destroyed scrollbox after full-screen overlays.** `cli/src/hooks/use-chat-ui.ts:72-93`; `cli/src/hooks/use-scroll-management.ts:113-143`; `cli/src/chat.tsx:1543-1617`.
- **[MEDIUM] Release postinstall deletes the working offline fallback before replacement.** `cli/release/postinstall.js:7-18`; `cli/release/index.js:606-636`.
- **[MEDIUM] Version sources/tests mask wrapper, package, and binary drift.** `cli/release/index.js:274-288`; `cli/src/__tests__/release-wrapper.test.ts:15-18`; observed package versions at `cli/release/package.json:3`, `cli/release-staging/package.json:3`, and `cli/package.json:3`.
- **[MEDIUM] Published usage treats a positional directory as cwd, while production parses it as a prompt.** `cli/release/README.md:23-31`; `cli/src/index.tsx:125-163`.
- **[LOW] Per-turn cost displays an ambiguous raw cents value.** `cli/src/components/message-footer.tsx:221-235`; `cli/src/components/status-bar.tsx:192-201`; `packages/agent-runtime/src/run-agent-step.ts:1251`.
- **[LOW] Three responsive-layout contracts disagree.** `cli/src/hooks/use-terminal-layout.ts:7,23,121-130`; `cli/src/hooks/use-terminal-breakpoints.ts:20-29`; `cli/src/hooks/use-grid-layout.ts:13-22`; `cli/knowledge.md:306-320`.
- **[LOW] Side-by-side diffs rely primarily on red/green rather than explicit add/delete markers.** `cli/src/components/tools/diff-viewer.tsx:431-502`; `cli/src/components/tools/__tests__/diff-viewer.test.tsx:169-190`.

### Error handling and resilience

- **[MEDIUM] Provider connection/retry indicators are disconnected from real provider state.** `cli/src/hooks/use-connection-status.ts:6-10`; `cli/src/app.tsx:220`; `sdk/src/impl/llm.ts:1280-1318`; `common/src/types/print-mode.ts:189-205`.
- **[MEDIUM] Internal stack traces can reach the TUI and persisted history.** `packages/agent-runtime/src/run-agent-step.ts:1574-1609`; `cli/src/hooks/helpers/send-message.ts:450-453`; `sdk/src/error-utils.ts:107-124`.
- **[MEDIUM] Declared runtime `error` events are silently ignored by the CLI.** `common/src/types/print-mode.ts:12-16,189-205`; `sdk/src/run.ts:478-481`; `cli/src/utils/sdk-event-handlers.ts:745-759`.
- **[MEDIUM] Malformed ordinary configuration files disappear without diagnostics.** `sdk/src/provider-config.ts:1177-1194`; `cli/src/utils/openbuff-provider.ts:259-276`.
- **[MEDIUM] OAuth code exchange and refresh have no network timeout.** `cli/src/utils/chatgpt-oauth.ts:164-168,293-305`; `sdk/src/credentials.ts:221-292`.
- **[MEDIUM] Broken agent modules vanish from TUI validation diagnostics.** `sdk/src/agents/load-agents.ts:229-280`; `cli/src/utils/local-agent-registry.ts:63-76`.
- **[MEDIUM] `/init` can throw after partial scaffolding without coherent rollback/recovery.** `cli/src/commands/init.ts:61-90`; `cli/src/commands/router.ts:443-462`; `cli/src/commands/__tests__/init.test.ts:289-331`.
- **[MEDIUM] Interactive bash jobs have neither timeout nor cancellation.** `cli/src/commands/router.ts:76-82`; `cli/src/components/pending-bash-message.tsx`.
- **[MEDIUM] Nested-agent fallback is not an actual error boundary.** `cli/src/components/error-boundary.tsx:10-30`; `cli/src/components/message-with-agents.tsx:75-92`; `cli/src/index.tsx:386-423`.
- **[LOW] Release HTTP redirect following is unbounded and omits 307/308.** `cli/release/http.js:144-155`; `cli/src/__tests__/proxy-http-get.test.ts:161-239`.

### Performance and responsiveness

- **[MEDIUM] Every new `@` mention session rebuilds a project tree of up to 10,000 files.** `cli/src/hooks/use-suggestion-engine.ts:641-671`; `common/src/project-file-tree.ts:140-229`.
- **[MEDIUM] “Background” attachment work performs synchronous enumeration, sort, stat, and reads on the renderer thread.** `cli/src/utils/pending-attachments.ts:347-438`; send blocking at `cli/src/commands/router.ts:467-472`.
- **[MEDIUM] Chat-history search synchronously reads/parses up to 500 full message files.** `cli/src/utils/chat-history.ts:48-114`; `cli/src/components/chat-history-screen.tsx:51-60`.
- **[MEDIUM, inference] First-run directory browsing synchronously stats every entry and child `.git` directory.** `cli/src/utils/directory-browser.ts:15-49`; `cli/src/hooks/use-directory-browser.ts:41-47`.
- **[MEDIUM] Unknown terminals can incur two sequential 500 ms OSC probes before first paint.** `cli/src/utils/terminal-color-detection.ts:18-20,82-83,193-196,416-430`; `cli/src/index.tsx:246-258`.

### Dependency, API, documentation, and release hygiene

- **[MEDIUM] Linux ARM64 artifacts are published without executing the binary.** `.github/workflows/cli-release-build.yml:40-46,258-276`; checked-in AArch64 ripgrep makes native validation material.
- **[LOW] CLI imports undeclared `lodash`, relying on a root dev dependency/hoisting.** `cli/src/utils/send-message-helpers.ts:7`; `cli/src/utils/message-block-helpers.ts:1`; `cli/src/utils/sdk-event-handlers.ts:1`; `cli/package.json`; root `package.json:64`.
- **[LOW] CLI imports undeclared `picocolors`.** `cli/src/index.tsx:25`; `cli/package.json:34-71`.
- **[LOW] Unused `terminal-image` retains a duplicate/heavy image stack.** `cli/package.json:54`; corresponding `bun.lock` entries; custom path `cli/src/utils/terminal-images.ts` and direct `jimp` usage in `cli/src/utils/image-thumbnail.ts`.
- **[LOW] Clipboard storage retains the legacy `codebuff-clipboard-images` namespace.** `cli/src/utils/clipboard-image.ts:18-19`; identity contract `docs/architecture.md`.

### Test and presentation coverage gaps

- **[MEDIUM] Recovery tests simulate state production does not apply.** Add real deferred run cancellation/continuation, rejected queue restoration, async event drain, traversal, and injected mid-write tests. `cli/src/hooks/helpers/__tests__/send-message.test.ts:961-970,992,1380-1394`; production guard `cli/src/hooks/use-send-message.ts:581-592`.
- **[MEDIUM] CLI argument tests rebuild a smaller parser instead of exercising production flags.** `cli/src/__tests__/cli-args.test.ts:15-51`; production parser `cli/src/index.tsx:107-164`.
- **[LOW] Built-in help omits Ctrl+P, Ctrl+R, Ctrl+V, Shift+Enter, Tab behavior, and paging.** `cli/src/components/help-banner.tsx:59-105`; `cli/src/utils/keyboard-actions.ts`.
- **[LOW, inference] Presentation tests assert helpers/capture existence rather than readable rendered output.** `cli/src/components/__tests__/command-palette-screen.test.ts:32-297`; `debug/tmux-sessions/audit-cli-baseline/capture-003-command-palette.txt`.
- **[MEDIUM] Release publication lacks a required full validation gate and exact version assertion.** `.github/workflows/cli-release-prod.yml:81-90`; `.github/workflows/cli-release-build.yml:232-241,269-276,423-429`.

## Coverage

The accompanying `COVERAGE-MATRIX.md` records **five complete discovery/audit pairs**, all covered:

1. Startup, onboarding, project selection, provider/model configuration, OAuth, and local-agent validation.
2. Input, keyboard, commands, bash, history, suggestions, clipboard, attachments, and images.
3. Send/stream lifecycle, queueing, cancellation, sessions, persistence, and SDK/runtime contracts.
4. Layout, themes, accessibility, scrolling, nested agents/tools, and rendering performance.
5. Packaging, release/update, platforms, CI, logging, analytics/privacy, diagnostics, and documentation.

Across those pairs, all eight audit lenses were covered: security, correctness, state mutation, error handling, performance, dependency hygiene, test coverage, and API/ABI contracts. `cli/` was audited across all five pairs; CLI-facing boundaries in `sdk/`, `common/`, `packages/`, `.github/`, docs, root metadata, examples, and test setup were included as recorded in the matrix.

Explicit exclusions were unrelated standalone SDK internals, agent prompt/quality review, inactive `agents-graveyard/`, editor settings, local shims, transient scratch fixtures, generated bundles, dependency directories, and compiled outputs except where a compiled binary was the subject of smoke/version evidence. Existing `.agents/sessions/**` audit findings and reports were excluded to preserve independence. No product code was edited by the audit.

No live provider/model calls were executed. Runtime conclusions rely on source, deterministic/focused tests, isolated local TUI captures, and existing compiled-binary smoke behavior.

The worktree was actively changing throughout the audit. Two transient parse failures were observed and subsequently fixed; final source help and typecheck pass. Time-sensitive observations—especially version drift, an environment-architecture check, and the public local-agent default—must be read as evidence of the audited dirty state. The final authoritative isolated CLI suite result is **2,327 pass / 30 fail / 15 skip**, which remains the release-readiness baseline for this report.
