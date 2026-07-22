# Read-path architectural audit

## Scope and files reviewed

This shard followed the read path vertically from tool schemas and result contracts through runtime handlers, SDK filesystem execution/containment, edit-capability minting, CLI rendering, tests, documentation, and the cached/index-derived file context used by discovery.

Primary files reviewed:

- `common/src/tools/params/tool/read-files.ts`
- `common/src/tools/params/tool/read-subtree.ts`
- `common/src/tools/params/tool/read-outline.ts`
- `common/src/tools/params/based-on-read.ts`
- `common/src/tools/results/filesystem.ts`
- `common/src/types/contracts/client.ts`
- `common/src/types/contracts/agent-runtime.ts`
- `common/src/types/filesystem.ts`
- `common/src/util/content-hash.ts`
- `common/src/util/project-path-containment.ts`
- `common/src/util/sensitive-paths.ts`
- `packages/agent-runtime/src/get-file-reading-updates.ts`
- `packages/agent-runtime/src/structural-read.ts`
- `packages/agent-runtime/src/process-str-replace.ts`
- `packages/agent-runtime/src/tools/handlers/tool/read-files.ts`
- `packages/agent-runtime/src/tools/handlers/tool/read-outline.ts`
- `packages/agent-runtime/src/tools/handlers/tool/read-subtree.ts`
- `packages/agent-runtime/src/tools/handlers/tool/edit-read-state.ts`
- `packages/agent-runtime/src/tools/handlers/tool/write-file.ts`
- `sdk/src/run.ts`
- `sdk/src/tools/read-files.ts`
- `sdk/src/tools/path-utils.ts`
- `sdk/src/tools/node-filesystem.ts`
- `sdk/src/tools/mutation-capabilities.ts`
- `cli/src/components/tools/read-files.tsx`
- `cli/src/components/tools/read-subtree.tsx`
- `cli/src/utils/create-run-config.ts`
- Focused read, containment, capability, outline/slice, subtree, and CLI component tests under `common/src/**/__tests__`, `packages/agent-runtime/src/**/__tests__`, `sdk/src/__tests__`, and `cli/src/components/tools/__tests__`
- `docs/architecture.md`, `docs/request-flow.md`, `docs/agents-and-tools.md`, and `sdk/README.md`

Evidence in this report is direct source evidence. Risk statements describe the behavior that follows from the cited implementation; no product code was changed by this shard.

## [HIGH] security / API contract — common/src/util/content-hash.ts:37 — Live read capabilities are not bound to a path or issuer

- **Risk:** The live `cap.v2` token contains only line bounds and a content hash, while its mere presence bypasses the strict read-before-edit gate for whichever target path receives it. A token read from one file can therefore authorize an equal-content range in another unread file, and any caller able to compute the public SHA-256 value can construct the same token. This conflicts with the path-bound `FileCapabilityV1` contract and makes the mechanism a freshness assertion rather than the read authorization described in prompts and docs.
- **Fix:** Replace `cap.v2` with a versioned capability bound to canonical project identity, canonical path, range, content hash, and issuer/run scope; authenticate it with an unforgeable per-run secret or store it in a runtime registry. Route edit authorization through `fileCapabilityAuthorizesV1` (or one equivalent authority implementation) rather than accepting a free-standing hash token. Do not mint a ready-to-use current token inside a stale-read error; require the actual reread to mint it.
- **Evidence:** `common/src/util/content-hash.ts:37-70` encodes only `startLine`, `endLine`, and hash. `common/src/tools/params/based-on-read.ts:16-25` states that presence bypasses strict read-before-edit for the target path. `packages/agent-runtime/src/process-str-replace.ts:800-842` validates the token only against the target file's current range content, with no source-path or issuer check, and `:821-834` mints a fresh token in the stale-anchor error before a new read occurs. In contrast, `common/src/tools/results/filesystem.ts:827-857` defines path- and base-hash-bound authorization, but the live `basedOnRead` path does not call it. `docs/request-flow.md:187-202` and `docs/agents-and-tools.md:706-721` describe these tokens as explicit read authorization.

## [HIGH] correctness / performance — sdk/src/tools/read-files.ts:330 — Distant ranges in one oversized file are collapsed into one bounded window

- **Risk:** For files over 10 MB, all requested ranges for a canonical path are reduced to one `min(start)..max(end)` request with a 1 MiB byte limit. Two individually small but distant ranges can therefore make the later selector fail or become partial because the adapter spends its bounded window on the gap, even though both requested ranges would succeed if read independently. The optimization also causes unnecessary streaming across potentially millions of unrelated lines.
- **Fix:** Plan bounded reads per selector, or coalesce only overlapping/nearby ranges whose estimated byte span fits the byte budget. Cache each returned window by canonical path and covered interval, then correlate every selector to a window that actually covers it.
- **Evidence:** `sdk/src/tools/read-files.ts:330-364` computes a single minimum start and maximum end across every range for an oversized snapshot and performs exactly one `readTextRange` call capped by `MAX_RANGE_READ_BYTES`. `:728-741` returns an error when a selector lies outside that one returned window. Existing same-file multi-range coverage at `sdk/src/__tests__/read-files.test.ts:558-583` uses a small file, while oversized coverage at `:1126-1169` exercises only one range.

## [HIGH] performance / state mutation — packages/agent-runtime/src/tools/handlers/tool/read-subtree.ts:177 — The subtree node limit does not bound recursive task fan-out

- **Risk:** A directory with a very large number of entries eagerly creates one recursive promise per child before most children increment the shared node counter. The 1,000-node cutoff therefore bounds returned nodes but not queued promises, limiter waiters, realpath/stat work, or memory. Because the counter increments after asynchronous I/O, which 1,000 nodes win is completion-order dependent rather than deterministic sorted order; aborting also leaves limiter waiters to drain because the wait path does not observe the signal.
- **Fix:** Use a bounded work queue with admission control: reserve node budget synchronously before scheduling a child, re-check cancellation before and after limiter acquisition, and process directory entries in deterministic batches. Stop enumerating/scheduling as soon as the budget is exhausted.
- **Evidence:** `packages/agent-runtime/src/tools/handlers/tool/read-subtree.ts:29-43` queues an unbounded callback per waiting I/O operation and has no abort-aware wait. `:177-223` checks and increments `nodesSeen` on opposite sides of awaited I/O. `:234-252` maps every directory entry into `Promise.all` eagerly. The cutoff test at `packages/agent-runtime/src/tools/handlers/__tests__/read-subtree.test.ts:587-619` covers only 1,010 flat files and asserts the output count, not scheduled work, deterministic membership, cancellation, or memory behavior.

## [MEDIUM] security / dependency hygiene — packages/agent-runtime/src/tools/handlers/tool/read-subtree.ts:46 — `read_subtree` silently falls back to the host filesystem

- **Risk:** `fileSystem` is optional at the runtime contract boundary, and the handler substitutes `node:fs` when it is absent. An embedding that intended discovery to use only the supplied cached/remote filesystem view can unexpectedly scan paths on the runtime host whenever `fileContext.projectRoot` names an existing host directory. This is also the only audited read handler that owns a direct host-filesystem fallback instead of consistently delegating through the SDK authority.
- **Fix:** Make the filesystem view required for live subtree scans. When it is absent, use only the filtered cached tree and mark the result as cached/stale, or return a typed unsupported error. Remove direct `node:fs` dependency from the runtime handler and resolve paths with the shared filesystem-aware containment helper.
- **Evidence:** `common/src/types/contracts/agent-runtime.ts:74-79` makes `fileSystem` optional. `packages/agent-runtime/src/tools/handlers/tool/read-subtree.ts:46-62` accepts the optional value and defaults to `nodeFs.promises`; `:317-321` then probes the host path from `fileContext.projectRoot`. By comparison, native `read_files` delegates to the SDK path policy and injected filesystem through `sdk/src/run.ts:687-700` and `sdk/src/tools/read-files.ts:146-244`.

## [MEDIUM] error handling / API contract — common/src/types/contracts/client.ts:42 — Optional reads erase typed filesystem errors and reconstruct them from prose

- **Risk:** The SDK has a typed `OptionalFileReadResult`, but the runtime dependency contract reduces it to `Promise<string | null>` and communicates blocked, binary, oversized, cancellation, and I/O states by throwing formatted strings. Runtime handlers then classify those strings with regular expressions. Message wording changes or adapter-specific errors can silently change error codes, retryability, and recovery guidance; raw host error text can also flow directly to the model and UI.
- **Fix:** Promote the typed optional-read result into the shared client/runtime contract and make `read_files.symbols`, `read_outline`, `read_slices`, and edit preflight switch on stable error codes. Preserve a sanitized user message separately from machine-readable code/retry/recovery fields.
- **Evidence:** `common/src/types/contracts/client.ts:42-44` exposes only `string | null`. `sdk/src/tools/read-files.ts:882-927` already produces typed states, but `sdk/src/run.ts:740-748` converts all non-not-found states into thrown strings. `packages/agent-runtime/src/tools/handlers/tool/read-files.ts:276-318` reconstructs error types with regexes over the exception message; `read-outline.ts:55-73` exposes a separate ad hoc shape again.

## [MEDIUM] error handling / correctness — packages/agent-runtime/src/tools/handlers/tool/read-subtree.ts:203 — Subtree I/O failures are indistinguishable from blocked or missing paths

- **Risk:** Permission errors, transient I/O errors, broken filesystem adapters, and unreadable directories are swallowed and rendered either as an omitted node, an empty directory, or the generic message "missing, blocked, ignored, or outside." This prevents reliable retry decisions, hides adapter failures, and can make a partial tree appear authoritative.
- **Fix:** Return a versioned structured subtree result with per-path error code, retryability, recovery, live/cached provenance, and an aggregate partial status. Only collapse sensitive/unauthorized paths into a non-enumerating blocked response; preserve sanitized I/O and cancellation categories for allowed paths.
- **Evidence:** `packages/agent-runtime/src/tools/handlers/tool/read-subtree.ts:203-217` catches all canonicalization/stat errors and returns `null`; `:234-240` converts all `readdir` failures to an empty child list; `:310-315` emits one generic message for missing, blocked, ignored, outside, and failed reads. The current output schema at `common/src/tools/params/tool/read-subtree.ts:56-108` has only a free-form `errorMessage`, unlike the typed `FilesystemError` used by `read_files`.

## [MEDIUM] test coverage gaps — packages/agent-runtime/src/__tests__/process-str-replace.test.ts:1427 — Safety invariants are tested locally but not across authority boundaries

- **Risk:** Tests prove token decoding and per-file hash matching, but not the architectural invariants that a read capability belongs to the path that minted it, a stale failure cannot substitute for a required reread, distant oversized ranges remain independently readable, subtree cancellation bounds outstanding work, or filesystem adapter errors retain typed identity. Regressions in these boundaries can pass all focused unit suites.
- **Fix:** Add cross-layer tests for cross-path token replay with identical content, retrying directly with the token emitted by a stale failure, multiple distant ranges on a >10 MB file, a million-entry synthetic subtree with an early abort and bounded scheduled work, missing `fileSystem` behavior, and distinct EACCES/EIO/cancelled subtree results. Assert the CLI renders the resulting typed partial/error states without heuristic guessing.
- **Evidence:** `packages/agent-runtime/src/__tests__/process-str-replace.test.ts:1427-1469` explicitly expects a current token in the stale error but does not prove a reread occurred before reuse. `sdk/src/__tests__/read-files.test.ts:558-583` covers multiple ranges only on a small file, and `:1126-1169` covers one oversized range. `packages/agent-runtime/src/tools/handlers/__tests__/read-subtree.test.ts:587-619` checks only the returned node cutoff.

## Domain disposition

- **Security:** Findings above cover path/issuer binding and host-filesystem fallback. SDK native `read_files` containment, sensitive-file blocking, canonical alias checking, binary rejection, and symlink containment were otherwise materially strong in the reviewed path.
- **Correctness:** Findings above cover oversized range planning and subtree failure/provenance behavior. No additional high-confidence correctness issue was identified in `read_outline` AST/heuristic fallback or CLI read status rendering.
- **State mutation:** The shared concurrent subtree budget is the material state issue. Whole-file authorization hashing and post-tool persistence otherwise explicitly track current content hashes.
- **Error handling:** Findings above cover optional-read type erasure and subtree error collapse.
- **Performance:** Findings above cover oversized-range over-reading and subtree fan-out. The normal `read_files` canonical snapshot path otherwise uses an explicit concurrency cap and deduplicates aliases.
- **Dependency hygiene:** The direct `node:fs` fallback in the runtime handler is the material dependency-boundary issue. No undeclared or version-related dependency problem was identified in this shard.
- **Test coverage gaps:** The cross-layer gaps are listed above; existing focused coverage is broad for normal reads, containment, truncation, binary/encoding rejection, selector ordering, and CLI summaries.
- **API/ABI contracts:** Findings above cover pathless capability semantics, typed-error erasure, and unstructured subtree errors. The structured `read_files` v1 envelope otherwise validates result ordering, aggregate counts, partial status, and omission of edit capabilities from truncated reads.
