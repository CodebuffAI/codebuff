# CLI audit remediation report

All findings in `AUDIT-REPORT.md` were reconciled against the current worktree and implemented from highest to lowest value.

## Trust, release, and state integrity

- Removed PR/push staging publication authority, narrowed secrets, added source/full-suite gates, exact version checks, ARM64 execution smoke, checksums, provenance attestations, and npm provenance.
- Made updates non-disruptive, staged pending activation, preserved offline binaries, bounded redirects, and corrected wrapper/version/documentation drift.
- Isolated project storage by canonical-path hash; validated continuation IDs; made chat/config/provider writes atomic and lossless.
- Made project switching transactional across cwd, direnv, index, agents/MCP, skills, SDK client, and chat state with rollback.
- Unified project agent/skill trust at the CLI boundary while retaining backward-compatible public SDK defaults.

## Runtime and recovery

- Serialized cancellation: a cancelling run retains continuation ownership until the SDK returns its authoritative preserved state.
- Serialized and drained async SDK event/stream callbacks before `run()` resolves.
- Restored rejected queued prompts at the queue head and paused safely instead of dropping or retry-looping.
- Added provider retry/failover/recovery events and a visible ordered resilience timeline.
- Surfaced runtime error events and removed internal stack frames from user-visible/persisted errors.
- Added OAuth exchange/refresh deadlines, atomic `/init` rollback/recovery, bounded cancellable bash commands, and append-safe cross-terminal prompt history.

## Interaction, accessibility, and presentation

- Added keyboard activation to the shared button primitive, explicit project-picker activation, and OAuth keyboard actions.
- Removed git-helper shell injection, fixed Ctrl+B underflow, isolated overlay keyboard ownership, corrected scroll-follow/listener ownership, and searched the complete project in the command palette.
- Added a real React render error boundary, complete shortcut help, unambiguous dollar cost formatting, canonical responsive breakpoints, and explicit side-by-side diff markers.
- Added `openbuff doctor` for provider, trust, agent, skill, MCP, and validation diagnostics.

## Responsiveness, privacy, and dependencies

- Moved project browsing, attachment reads, and chat-history loading off the renderer thread; bounded concurrent history reads and cached mention-tree refreshes.
- Reduced terminal theme probe latency.
- Added `OPENBUFF_TELEMETRY=0` and `DO_NOT_TRACK=1` runtime opt-outs.
- Secured and cleaned clipboard temp images under an Openbuff owner-only namespace.
- Removed CLI lodash usage, declared `picocolors`, and removed unused `terminal-image` plus its lockfile graph.
- Extracted the production CLI parser and made tests exercise it directly.

## Final validation

- Monorepo environment architecture and all workspace typechecks: pass.
- Isolated CLI suite: **2,397 pass / 0 fail / 16 environment-dependent skip**.
- SDK suite: **818 pass / 0 fail / 1 existing TODO skip**.
- Agent runtime suite: **922 pass / 0 fail**.
- Common suite: **647 pass / 0 fail**.
- Agents suite: **529 pass / 0 fail**.
- Keyboard/render overflow regression: passes separately under `NODE_ENV=test` (OpenTUI's test utility imports React `act`, which production React intentionally omits).
- Source `--help` smoke and `git diff --check`: pass.
- Fresh compiled binary build plus built `--version` and `--help` smoke: pass.
