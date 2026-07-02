# Shard S9 — CLI: streaming, hooks, send-message, abort

**Auditor:** harness-audit-2026-06-30 / S9
**Scope:** `cli/src/chat.tsx`, `cli/src/app.tsx`, `cli/src/index.tsx`, `cli/src/project-files.ts`, and all hooks under `cli/src/hooks/` listed in the shard plan (plus `helpers/send-message.ts`, `stream-state.ts`).
**Files inspected (line counts):**
- `cli/src/chat.tsx` (1704)
- `cli/src/hooks/use-send-message.ts` (668)
- `cli/src/hooks/use-suggestion-engine.ts` (725)
- `cli/src/hooks/helpers/send-message.ts` (459)
- `cli/src/hooks/use-chat-keyboard.ts` (331)
- `cli/src/hooks/use-message-queue.ts` (264)
- `cli/src/hooks/use-chat-messages.ts` (254)
- `cli/src/hooks/use-chat-streaming.ts` (247)
- `cli/src/hooks/use-chat-state.ts` (218)
- `cli/src/hooks/use-input-history.ts` (173)
- `cli/src/hooks/use-clipboard.ts` (144)
- `cli/src/hooks/use-chat-ui.ts` (131)
- `cli/src/hooks/use-exit-handler.ts` (111)
- `cli/src/project-files.ts` (105)
- `cli/src/hooks/stream-state.ts` (95)
- `cli/src/hooks/use-ask-user-bridge.ts` (92)
- `cli/src/hooks/use-chat-input.ts` (76)
- `cli/src/hooks/use-publish-mutation.ts` (72)
- `cli/src/hooks/use-fingerprint.ts` (61)
- `cli/src/hooks/use-connection-status.ts` (10)
- `cli/src/app.tsx` (320), `cli/src/index.tsx` (415) — sampled

## Audit Domains Covered
1. AbortController lifecycle / leaks
2. Stale closures over session / store state
3. Render storms / batched updaters
4. Escape-key cancel correctness
5. Message-queue race conditions / locks
6. `useEffect` dep arrays — missing values
7. Resource lifecycle (timeouts/intervals/listeners)
8. Cross-cutting correctness (exit, history, suggestions, clipboard)

---

## Findings

### S9-F01 — AbortController is never `abort()`-ed on a superseding run; controllers accumulate across the session
**Severity:** High
**Domain:** 1 (Abort lifecycle), 5 (queue races)
**Files:**
- `cli/src/hooks/helpers/send-message.ts` (`setupStreamingContext`, lines ~256–311)
- `cli/src/hooks/use-send-message.ts` (lines ~436–633)
- `cli/src/chat.tsx` (`onInterruptStream`, line 1035–1039)

**Observation.** `setupStreamingContext` does:
```ts
const abortController = new AbortController()
abortControllerRef.current = abortController
abortController.signal.addEventListener('abort', () => { ...releases chain lock... })
```
The only call site that invokes `.abort()` is the Escape/Ctrl-C handler (`onInterruptStream`). When a new `sendMessage` starts (e.g. a queued message processed back-to-back, or `routeUserPrompt` calling `sendMessage` again while a prior run is somehow still in-flight), the **previous controller's reference is overwritten in `abortControllerRef.current` without first aborting it**. The previous run's `addEventListener('abort', …)` closure (capturing the older `updater`, `setStreamStatus`, `updateChainInProgress`, etc.) is retained for the lifetime of the AbortController, which is itself retained by the SDK's in-flight `client.run` promise.

Likewise, on normal completion (`handleRunCompletion`) the controller is left alive but no longer reachable through the ref (the next `setupStreamingContext` replaces it). The signal listener and signal object are GC-eligible only when the SDK fully releases its retained signal — which is not guaranteed if the SDK keeps the signal in any long-lived structure (cache, telemetry, etc.).

**Impact.**
- If the SDK ever holds a reference to `signal` after completion, the abort listener (and the closure over per-run state) survives, creating a slow memory leak proportional to messages sent in a session.
- If a stale controller is aborted later by mistake (e.g., a future code path keys off `abortControllerRef` after it was already swapped), the *current* run's chain lock gets released — see F02.

**Recommendation.**
1. In `setupStreamingContext`, if `abortControllerRef.current` is non-null and not yet aborted, call `abortControllerRef.current.abort()` before assigning the new one (defensive, no-op in the normal case).
2. On `handleRunCompletion` / `handleRunError`, explicitly null `abortControllerRef.current` (only if it still points at *this* controller — compare identity to avoid clobbering a newer controller).
3. Consider keeping the listener function reference and calling `removeEventListener` on completion to drop the closure deterministically.

---

### S9-F02 — `onInterruptStream` aborts via `abortControllerRef.current` without identity check, can cancel the *new* run
**Severity:** High
**Domain:** 4 (Escape), 1 (abort lifecycle)
**Files:** `cli/src/chat.tsx` lines 1035–1039.

```ts
onInterruptStream: () => {
  abortControllerRef.current?.abort()
  if (queuedMessages.length > 0) {
    pauseQueue()
  }
}
```

**Sequence that breaks correctness.**
1. User sends message A. Stream is in `'waiting'`.
2. User presses Escape: handler enqueues an `abort()` call.
3. Between read of `abortControllerRef.current` and the actual `.abort()` invocation (synchronous in practice, but consider re-entrant batched setState in concurrent mode), the abort listener releases the chain lock (`updateChainInProgress(false)`, `setCanProcessQueue(!isQueuePausedRef?.current)`).
4. If the queue is *not* paused at that moment (because `queuedMessages.length === 0` at the time of the keypress and `pauseQueue()` therefore was never called for this Escape) and a queued message exists but is added in the same tick (e.g. user mashed Enter+Escape), the queue processor can start run B *before* `pauseQueue` runs.
5. The next call to `setupStreamingContext` overwrites `abortControllerRef.current` with B's controller, but `onInterruptStream` is closed over `abortControllerRef` (a ref, fine) — however a *second* Escape press would now abort run B instead of run A.

In addition, `useMemo`'s dep array for `chatKeyboardHandlers` includes `queuedMessages.length`, so the handler identity changes every time the queue length changes — this is mostly fine, but it means `useKeyboard` re-binds frequently (see F09).

**Recommendation.**
- Capture the controller in a local before aborting *and* pause the queue first, unconditionally, so the order is: pause → abort. The current order can leak a queued message into a partially-cancelled state.
- Add a debounce/dedupe on Escape so repeated Escape presses don't try to abort a controller belonging to a newly-started run.

---

### S9-F03 — `processNextMessage` reads `streamStatus` / `canProcessQueue` from closure, scheduling effect retriggers it but blocks are racy
**Severity:** Medium-High
**Domain:** 5 (queue races), 6 (deps)
**Files:** `cli/src/hooks/use-message-queue.ts` lines 60–195.

**Observation.** `processNextMessage` is a `useCallback` whose deps include `canProcessQueue` and `streamStatus`, and is invoked from a `useEffect` keyed on `[canProcessQueue, streamStatus, queuedMessages.length, processNextMessage, isChainInProgressRef]`. The function compares both **state** (closed-over `streamStatus`, `canProcessQueue`) and **refs** (`isChainInProgressRef`, `activeAgentStreamsRef`, `streamMessageIdRef`, `isQueuePausedRef`, `isProcessingQueueRef`).

Concrete bugs:
1. **Stale-closure read of `streamStatus`/`canProcessQueue`.** `sendMessage` (from `useSendMessage`) **synchronously** sets `isChainInProgressRef.current = true` then asynchronously updates React state via `updateChainInProgress(true)` and `setCanProcessQueue(false)`. The next render rebuilds `processNextMessage` with the new values, but `processNextMessage` is *also* invoked synchronously from within the same `setQueuedMessages` → `useEffect` chain. Between the moment `sendMessage` returns and React commits the new render, an additional queue push (`addToQueue`) can fire `processNextMessage` with **stale** `streamStatus === 'idle'` *and* the new `isChainInProgressRef.current === true`, so the function returns at the chain-in-progress guard — which is the correct outcome by luck, not by design. If any future refactor removes the chain-in-progress ref while keeping the state guards, the queue will double-fire.
2. **Effect dep array contains a ref object** (`isChainInProgressRef`). Refs have stable identity; this is harmless but misleading — and notably the effect does **not** depend on the ref's `.current`, so changes to the ref do not retrigger processing. If the chain finishes via a path that clears the ref but doesn't change `canProcessQueue` or `streamStatus` (e.g., the abort handler races with finalize), the next queued message will not auto-process until something else nudges state.
3. **`sendMessage(messageToProcess).catch().finally()` releases `isProcessingQueueRef`** but does *not* check that the sendMessage we're awaiting is for the message we dequeued. If `sendMessage` resolves and a new turn begins (queue processed again) before the `finally` fires, `isProcessingQueueRef.current = false` will clobber the *new* turn's true value. (`useSendMessage` also sets it false on abort/completion, so this is a triple-release pattern — see F05.)

**Recommendation.**
- Replace `streamStatus` / `canProcessQueue` reads inside `processNextMessage` with refs synchronized from state via a small `useEffect` (mirroring how `isChainInProgressRef` is synced in `use-chat-state.ts`).
- Guard the `finally` release behind a sequence number / token so only the owner of the lock releases it.
- Drop `isChainInProgressRef` from the effect deps (or replace with the state `isChainInProgress` that lives in the store — currently we sync the ref from store state, but the effect doesn't observe the store).

---

### S9-F04 — Chain lock / queue lock can be released by abort handler *while* the SDK promise is still resolving, allowing a new run to start with the old run's state still mutating
**Severity:** High
**Domain:** 1, 5
**Files:** `cli/src/hooks/helpers/send-message.ts` (abort listener, lines 279–310); `cli/src/hooks/use-send-message.ts` (lines ~600–640, finally block).

**Observation.** The abort listener releases the chain lock immediately:
```ts
updateChainInProgress(false)
setCanProcessQueue(!isQueuePausedRef?.current)
if (isProcessingQueueRef) { isProcessingQueueRef.current = false }
```
The comment in `setupStreamingContext` openly documents the trade-off ("the user explicitly cancelled, … client.run() will update previousRunStateRef when it eventually resolves"). But the SDK `client.run()` is still in flight and continues to call event handlers that mutate:
- `streamRefs.state.*` via `createEventHandlerState`'s setters
- `setMessages` via the `updater` (`createBatchedMessageUpdater`)
- `setStreamingAgents`
- `setContextWindowUsage`

If the user fires off a new `sendMessage` immediately after Escape, `setupStreamingContext` calls `streamRefs.reset()` (clearing `wasAbortedByUser`, accumulators, etc.) **while the old SDK call is still streaming events into the same `streamRefs`**. The new run's accumulators will be polluted with the tail of the old run's stream chunks, and the old run's eventual `client.run` resolution will then call `previousRunStateRef.current = runState` overwriting the *new* run's state when it completes.

The use-send-message code partially mitigates this with `if (!abortController.signal.aborted)` guards around the post-await finalization, but `streamRefs` is *shared* across runs (it is constructed once in `useSendMessage` via `streamRefsRef`).

**Recommendation.**
- Make `streamRefs` per-run instead of shared, OR
- Have the abort handler synchronously set a generation counter that all event handlers consult before mutating shared state, OR
- Wait for the old `client.run` promise to settle before allowing a new `setupStreamingContext` to call `streamRefs.reset()`.

This is also called out in `helpers/__tests__/send-message.test.ts:1153` ("This is why we use per-run abortController.signal.aborted instead.") — the test acknowledges the shared-refs race but only protects the chain-lock release, not the event-handler mutations.

---

### S9-F05 — Triple-release of `isProcessingQueueRef.current = false` (idempotent but masks bugs)
**Severity:** Low (defect smell)
**Domain:** 5
**Files:** `cli/src/hooks/use-send-message.ts` finally block + `helpers/send-message.ts` `finalizeQueueState`/abort handler + `use-message-queue.ts` `.finally()`.

`isProcessingQueueRef.current = false` is set in at least four code paths:
1. `setupStreamingContext` abort listener.
2. `finalizeQueueState` (called from completion / error paths).
3. `use-send-message.ts` `finally` block ("safety net").
4. `use-message-queue.ts` `processNextMessage`'s `.finally()`.

The comment "Redundant releases are safe (idempotent)" is true today but **brittle**: if any future field is added that depends on lock ownership (e.g., a sequence number, a per-run queue), three of these four sites will silently corrupt it. The error-path release also happens *before* `updater.dispose()` in the finally, so the queue can pick up the next message before the previous `updater` is disposed, racing with batched message updates targeting the same `aiMessageId`.

**Recommendation.** Centralize lock release in a single helper that the abort handler, completion, error path, and the queue's `.finally()` all delegate to, with the centralized helper enforcing ownership via a sequence number.

---

### S9-F06 — Watchdog timer in `useMessageQueue` cancels itself only when processing completes "normally"; on abort it leaks
**Severity:** Medium
**Domain:** 5, 7
**Files:** `cli/src/hooks/use-message-queue.ts` lines 130–185.

`watchdogTimeoutRef` is set when processing begins and cleared in three places:
- The early-return on empty `messageToProcess` (good).
- `processNextMessage`'s `.finally()` after `sendMessage` settles.
- Unmount cleanup.

But when the **abort handler in `setupStreamingContext`** releases `isProcessingQueueRef.current = false` directly, it does **not** touch the watchdog. The watchdog will still fire ~60s later, log a "stuck" warning, and call `setCanProcessQueue(!isQueuePausedRef.current)` — which can re-enable queue processing in the middle of a session where the user already paused it via a different mechanism (e.g., feedback mode, ask-user). Worst case: a queued message is dispatched 60s after the user thought they were paused.

The watchdog also reads `isQueuePausedRef.current` at firing time, not at scheduling time, which is correct, but combined with the abort-path release it creates a spurious "stuck queue" warning every time the user hits Escape during a long run.

**Recommendation.** Clear `watchdogTimeoutRef` from the abort handler as well (or pass a clear callback into `setupStreamingContext`).

---

### S9-F07 — `useChatStreaming`'s ask-user-driven timer pause uses `mainAgentTimer` (an unstable object) as dep → potential render storm
**Severity:** Medium
**Domain:** 3 (render storms), 6 (deps)
**Files:** `cli/src/hooks/use-chat-streaming.ts` lines 113–122.

```ts
useEffect(() => {
  if (askUserState !== null) {
    mainAgentTimer.pause()
  } else if (mainAgentTimer.isPaused) {
    mainAgentTimer.resume()
  }
}, [askUserState, mainAgentTimer])
```

`mainAgentTimer` is the object returned by `useElapsedTime()`. Looking at `use-elapsed-time.ts`, the returned object is **not memoized into a stable identity** — it is rebuilt on every render (functions `start`, `stop`, `pause`, `resume` are `useCallback`'d, but the *object literal* returned to consumers is new each render unless the file uses `useMemo` around the return, which the read of lines 1–90 does not show). Each rerender therefore re-runs this effect: when `askUserState !== null`, it calls `.pause()` on every render, which sets state (`setAccumulatedSeconds`, `setElapsedSeconds`, `setIsPaused`) → triggers another render. The `pause` callback's body guards with `if (startTime && !isPaused)`, breaking the loop, but the cost is high: an extra render per timer tick during ask-user.

**Recommendation.** Either:
- Memoize the timer object: `useMemo(() => ({ start, stop, pause, resume, elapsedSeconds, startTime, isPaused }), [...])`, OR
- Depend only on the *methods* via refs, not the whole tracker object.

---

### S9-F08 — `useChatInput`'s auto-submit effect omits `setInputValue`/`setAgentMode` from deps and depends on `agentMode` (changing mid-mount races the auto-submit)
**Severity:** Medium
**Domain:** 6 (deps), 2 (stale closure)
**Files:** `cli/src/hooks/use-chat-input.ts` lines 58–70.

```ts
useEffect(() => {
  if (initialPrompt && !hasAutoSubmittedRef.current) {
    hasAutoSubmittedRef.current = true
    setTimeout(() => { onSubmitPrompt(initialPrompt, agentMode) }, 100)
  }
}, [initialPrompt, agentMode, onSubmitPrompt])
```

- Including `agentMode` in deps means if the user changes agent mode within 100ms of mount, the effect re-runs but the early `hasAutoSubmittedRef.current` guard suppresses re-submission — so the *intended* `agentMode` for auto-submit is whichever mode was active during the *first* effect run. That is probably what was wanted, but the dep is misleading.
- The 100ms `setTimeout` is never cleaned up; if the component unmounts within 100ms of mount (e.g., the user `/exit`s during init), `onSubmitPrompt` fires on an unmounted component, which can throw inside `routeUserPrompt`.

**Recommendation.** Use `useEvent`/ref pattern to read the *current* `agentMode` at firing time and store the timeout id in a ref to clear on unmount.

---

### S9-F09 — `useChatKeyboard` rebuilds the `useKeyboard` listener on every `state`/`handlers` change; render storm during streaming
**Severity:** Medium
**Domain:** 3, 6
**Files:** `cli/src/hooks/use-chat-keyboard.ts` lines 300–340; consumer in `cli/src/chat.tsx`.

`useKeyboard(useCallback(..., [state, handlers, disabled]))`. The `state` value is `createDefaultChatKeyboardState(...)`-like object reconstructed every render of `chat.tsx`; `handlers` is `useMemo` but its deps include `queuedMessages.length`, `slashMatches`, `agentMatches`, etc. — i.e., almost everything in the chat surface.

During streaming, every batched message update changes `messages`, which propagates to `slashMatches/agentMatches/fileMatches` deps in some paths, which changes `handlers`, which re-binds `useKeyboard`. If `useKeyboard` internally subscribes/unsubscribes on identity change, this means **hundreds of subscribe/unsubscribe cycles per stream**.

**Recommendation.**
- Stash `state` and `handlers` in refs that the inner `useKeyboard` callback reads at fire time. The `useCallback` should have an empty (or near-empty) dep array.

---

### S9-F10 — `use-chat-messages.ts` `setTimeout(() => isUserCollapsingRef.current = false, 0)` is not cleaned up
**Severity:** Low
**Domain:** 7
**Files:** `cli/src/hooks/use-chat-messages.ts` `handleCollapseToggle` (lines ~155–165) and `handleToggleAll` (lines ~215–225).

If the user rapidly toggles collapse during scroll, multiple `setTimeout(…, 0)` are queued, and on unmount the flag stays whatever the last queued timer set it to. The flag is read by `isUserCollapsing()` which feeds `useChatScrollbox`'s auto-scroll-suppression logic — if the timer fires after unmount, no harm, but if a parent remounts the chat, the ref is fresh, so this is benign **today**.

**Recommendation.** Track timeout id in a ref and clear on subsequent collapses or unmount.

---

### S9-F11 — `useInputHistory.saveToHistory` re-reads disk on every send (synchronous I/O on hot path)
**Severity:** Low-Medium
**Domain:** 7, 3
**Files:** `cli/src/hooks/use-input-history.ts` lines 60–75.

`saveToHistory` calls `loadMessageHistory()` synchronously every time a message is submitted, then writes back. This is intentional ("re-read from disk to pick up messages from other terminals") but performs blocking I/O on the JS thread inside a hook invoked from `routeUserPrompt`. For users with large history files, this stalls UI between Enter and the user-message render.

**Recommendation.** Debounce the disk read or load on focus/blur rather than per-send.

---

### S9-F12 — `useInputHistory.navigateUp/Down` set `isNavigatingRef.current = false` via `setTimeout(…, 0)` — collides with `inputMode` reset effect
**Severity:** Medium
**Domain:** 2, 6
**Files:** `cli/src/hooks/use-input-history.ts` lines 58–66, 100–115.

```ts
useEffect(() => {
  if (!isNavigatingRef.current) resetHistoryNavigation()
}, [inputMode, resetHistoryNavigation])
```
`navigateUp` calls `setInputMode(mode)` *and* sets `isNavigatingRef.current = true`, then schedules `isNavigatingRef.current = false` via `setTimeout(0)`. The `useEffect` listening on `inputMode` is fired *synchronously* after the React batch commits the new mode — typically before the `setTimeout(0)` fires. The effect therefore sees `isNavigatingRef.current === true` and skips the reset, which is the intended behavior. **But** in StrictMode or under React 19 concurrent rendering, the effect can be deferred past microtask boundaries, in which case the `setTimeout(0)` callback fires first, `isNavigatingRef.current` flips to `false`, the effect runs, and `resetHistoryNavigation()` clobbers `historyIndexRef.current`, kicking the user back to draft mid-history-browse.

**Recommendation.** Use a generation counter compared synchronously inside the effect rather than a flag flipped by `setTimeout`.

---

### S9-F13 — `useExitHandler`: module-level `exitHandlerRegistered` + `exiting` flags break in tests and HMR
**Severity:** Medium
**Domain:** 7, 8
**Files:** `cli/src/hooks/use-exit-handler.ts` lines 19–48.

Module-scope `let exitHandlerRegistered = false` and `let exiting = false` persist across HMR reloads and Jest module isolation boundaries. In tests that mount `useExitHandler` repeatedly, the SIGINT/exit handlers from the first mount remain registered (the `useEffect` that registers SIGINT returns a cleanup that removes the SIGINT handler, but the `process.on('exit', ...)` from `setupExitMessageHandler` is never removed). After many test runs or many HMR cycles, the `'exit'` event has many stale listeners, all calling `getCurrentChatId()` and writing to stdout.

Also: the `useEffect(() => { setupExitMessageHandler() }, [])` runs on every mount, but the inner function guards with `exitHandlerRegistered`. Combined with HMR's tendency to recreate module state, this can either (a) re-register many times or (b) skip registration entirely if HMR partially preserves state.

**Recommendation.** Replace module-level flags with a ref or store-scoped flag; explicitly `process.off('exit', …)` on unmount.

---

### S9-F14 — `useExitHandler.handleCtrlC` two-press exit warning timer is *never* started; `nextCtrlCWillExit` reset is via plain `setTimeout` without ref
**Severity:** Low-Medium
**Domain:** 4, 7
**Files:** `cli/src/hooks/use-exit-handler.ts` lines 65–95.

```ts
if (!nextCtrlCWillExit) {
  setNextCtrlCWillExit(true)
  setTimeout(() => { setNextCtrlCWillExit(false) }, 2000)
  return true
}
if (exitWarningTimeoutRef.current) { clearTimeout(exitWarningTimeoutRef.current); ... }
```
- The `setTimeout` that resets `nextCtrlCWillExit` is **not stored in `exitWarningTimeoutRef`** — the subsequent `clearTimeout(exitWarningTimeoutRef.current)` is a dead code path because the ref is never assigned. Two consecutive Ctrl-Cs always fall through to `exitCli()` correctly, but the "abort the exit warning" cleanup branch does nothing.
- If the component unmounts within the 2s window, the deferred `setNextCtrlCWillExit(false)` fires on an unmounted component → React warning ("Can't perform a React state update on an unmounted component").

**Recommendation.** Assign the `setTimeout` return value to `exitWarningTimeoutRef.current` and clear in cleanup.

---

### S9-F15 — `useClipboard` selection handler: dep array misses `renderer.off`/registration race
**Severity:** Low
**Domain:** 6, 7
**Files:** `cli/src/hooks/use-clipboard.ts` lines 60–125.

The `useEffect` that subscribes to `renderer.on('selection', handleSelection)` depends only on `[renderer]`. The `handleSelection` closure captures `autoCopyEnabledRef.current` (fine; ref) and calls `setHasSelection`/`copyTextToClipboard` (stable). Looks OK, but:
- `loadSettings().autoCopySelection` is read in a *separate* `useEffect` with deps `[]`. If a user toggles the setting at runtime (e.g., via `/settings`), the ref isn't refreshed — selection auto-copy state is locked to mount-time value. Documented? No.
- `pendingCopyTimeoutRef` is cleared on unmount, but the **outstanding `copyTextToClipboard` promise** is not cancellable — it may resolve after unmount and call `setHasSelection(false)` on an unmounted component.

**Recommendation.** Re-read settings via a store subscription; track an `unmountedRef` and bail out of post-await state updates.

---

### S9-F16 — `useChatStore.getState()` reads inside `sendMessage` capture setters at call time — correct, but stale `runState` and `messages` are still possible
**Severity:** Medium
**Domain:** 2 (stale session reads)
**Files:** `cli/src/hooks/use-send-message.ts` lines ~115–130, 260–280, 400–420, 510–560.

The hook's comment ("Read store setters fresh on each callback invocation via useChatStore.getState() rather than capturing them once at component scope") shows the team is aware of store-recreation issues. However:
- `previousRunStateRef.current` is captured at hook mount and only updated after `await client.run(...)` resolves. If the user calls `clearMessages()` mid-run (via slash command), the ref is set to `null`, but if `client.run` then resolves it overwrites the ref with the just-finished `runState` — silently re-creating session state the user just cleared.
- `resumableCheckpointRef.current` is read **once** at the top of `sendMessage` (after the validation checks) and compared against `effectivePrompt`. If a second `sendMessage` starts while the first is still running (race documented in F04), both can read the same checkpoint and both try to resume, leading to double application of mid-turn state.

**Recommendation.**
- In `clearMessages`, *also* invalidate any in-flight `sendMessage`'s ability to write back — e.g., set a "cleared since started" flag tied to the run's abortController.
- Make checkpoint consumption atomic (read-and-clear).

---

### S9-F17 — `use-chat-state.ts`: `streamingAgents` stabilization via key string can desync if Set elements contain commas
**Severity:** Low
**Domain:** 3
**Files:** `cli/src/hooks/use-chat-state.ts` lines 132–144.

```ts
const streamingAgentsKey = useMemo(
  () => Array.from(rawStreamingAgents).sort().join(','),
  [rawStreamingAgents],
)
```
Agent IDs are expected to be alphanumeric, so the comma collision is theoretical. But if an agent id ever contains a comma (e.g., a future user-defined agent name allowing it), `{"a,b"}` and `{"a", "b"}` produce the same key and `streamingAgents` won't re-memo when the actual set changes.

**Recommendation.** Use `JSON.stringify(Array.from(rawStreamingAgents).sort())` or join with a delimiter forbidden in agent IDs (e.g., `\x00`).

---

### S9-F18 — `useFingerprint`: `setState` after unmount during async fingerprint generation
**Severity:** Low
**Domain:** 7
**Files:** `cli/src/hooks/use-fingerprint.ts` lines 30–55.

The `cancelled` flag guards `setState(...)` correctly. However, if `calculateFingerprint` throws after unmount, the catch path's `if (!cancelled) setState(prev => ({ ...prev, isLoading: false }))` is correctly guarded. The only concern is **logger.error** is called regardless of cancellation, which is fine but adds noise during fast unmount/remount cycles (e.g., test isolation).

---

### S9-F19 — `useSuggestionEngine`: file-tree refresh effect's `mentionContext.active` boolean dep ignores query changes — stale file list during typing
**Severity:** Medium
**Domain:** 6, 2
**Files:** `cli/src/hooks/use-suggestion-engine.ts` lines ~500–540.

```ts
useEffect(() => {
  if (!mentionContext.active) return
  ...
  void refreshFilePaths()
  return () => { cancelled = true }
}, [mentionContext.active])
```
The effect refreshes the file tree from disk **only when the mention context transitions from inactive → active**, not when the query changes. If the project file tree changes during a long-lived mention session (the user is typing `@foo` while files are being created/deleted by the agent), suggestions remain stale until the user closes and reopens the menu.

The `fileRefreshIdRef` request-id mechanism prevents stale results from clobbering newer ones but only within the single refresh per activation.

**Recommendation.** Either re-refresh on query change (debounced) or watch the file tree via fs events.

---

### S9-F20 — `useChatUI` overflow-check effect has empty dep array but reads `scrollRef.current` — listener may never re-bind if scrollbox is replaced
**Severity:** Low
**Domain:** 6, 7
**Files:** `cli/src/hooks/use-chat-ui.ts` lines 65–95.

```ts
useEffect(() => {
  const scrollbox = scrollRef.current
  if (!scrollbox) return
  ...
  scrollbox.verticalScrollBar.on('change', checkOverflow)
  return () => { scrollbox.verticalScrollBar.off('change', checkOverflow) }
}, [])
```
The empty dep array means the effect runs once on mount. If `scrollRef.current` is still `null` at that moment (it's assigned via `ref={scrollRef}` and the underlying renderable mounts asynchronously in OpenTUI), the effect bails and never re-tries → `hasOverflow` is stuck at `false` for the session. The chat history then renders without overflow indicators.

**Recommendation.** Depend on a stable signal that fires once the scrollbox is attached (or add a layout effect that polls / uses a ref callback).

---

### S9-F21 — `useAskUserBridge`: subscription returns `unsubscribe`, but if `setAskUserState` identity changes between renders the bridge is resubscribed needlessly
**Severity:** Low
**Domain:** 6, 7
**Files:** `cli/src/hooks/use-ask-user-bridge.ts` lines 50–75.

`setAskUserState` from zustand is referentially stable within a store instance, so the dep `[setAskUserState]` is fine in practice — but the hook subscribes to the `AskUserBridge` singleton, which is process-wide. If the chat unmounts (e.g., switching to a different screen) and remounts (back to chat), the bridge accumulates subscribers because the cleanup runs but the unmounted hook may have already produced an in-flight `request` that triggers `setAskUserState` on the next mount.

In practice this is benign; flagging for completeness.

---

### S9-F22 — `chat.tsx` `chatKeyboardHandlers` `useMemo` deps over-include large arrays (`slashMatches`, `agentMatches`, `fileMatches`)
**Severity:** Medium
**Domain:** 3, 6
**Files:** `cli/src/chat.tsx` lines ~1244–1260 (deps array tail).

The `useMemo` deps include `slashMatches`, `agentMatches`, `fileMatches`, `queuedMessages.length`, `inputValue`, `agentMode`, and others. During heavy typing in the input, `agentMatches`/`fileMatches` change every keystroke → `chatKeyboardHandlers` identity changes every keystroke → propagates through `useChatKeyboard` (F09) → propagates through `ChatInputBar`'s `onInterruptStream` prop (line 1698) and `MessageBlock`'s `onStop` prop (line 1643) → re-render storm.

**Recommendation.** Read these collections via refs synchronized in a separate effect, or split handlers into smaller memos each with a narrower dep set.

---

### S9-F23 — `project-files.ts`: `setProjectRoot` installs a global `setProjectRootResolver` that closes over module-scope `projectRoot` — testable but leaks across test runs
**Severity:** Low
**Domain:** 7, 8
**Files:** `cli/src/project-files.ts` lines 13–25.

`setProjectRootResolver(() => projectRoot as string)` registers a callback into `@codebuff/common/util/plan-artifacts`. Across multiple test files that import `project-files.ts`, the resolver is installed once and points at whichever module instance loaded first. With Bun's module caching this works; with Vitest's vm pool it can yield a stale resolver returning `undefined`. Cast to `string` masks the undefined return.

**Recommendation.** Throw if `projectRoot` is undefined when the resolver is called, or use a getter that explicitly returns `string | undefined`.

---

### S9-F24 — `getCurrentChatId()` auto-generates a chat ID on first read, with no caller-side mutation guard
**Severity:** Low
**Domain:** 8
**Files:** `cli/src/project-files.ts` lines 27–35.

`getCurrentChatId()` lazy-initializes `currentChatId` on first read using `new Date().toISOString()`. Any code path that reads the chat id *before* `--continue <chatId>` is wired through `setCurrentChatId` (which happens inside `useSendMessage`'s `useEffect`, after first render) will lock in a freshly-generated ID. The exit handler `setupExitMessageHandler` reads `getCurrentChatId()` from `process.on('exit')` and would print this auto-generated ID instead of the resumed one if exit fires before `setCurrentChatId` is called.

**Recommendation.** Resolve `continueChatId` synchronously during CLI bootstrap (`index.tsx`), not inside a React effect.

---

### S9-F25 — `useMessageQueue.stopStreaming` ignores `streamMessageIdRef`; status flips to idle but ref retains stale id
**Severity:** Low
**Domain:** 5
**Files:** `cli/src/hooks/use-message-queue.ts` lines 220–230.

```ts
const stopStreaming = useCallback(() => {
  setStreamStatus('idle')
  setCanProcessQueue(!isQueuePausedRef.current)
}, [])
```
Doesn't clear `streamMessageIdRef.current`. The queue processor then refuses to dequeue because `streamMessageIdRef.current` is truthy (line ~92), even though the stream is "idle". The only path that nullifies `streamMessageIdRef` is `clearStreaming()`, which is called on unmount. So in a normal session where `stopStreaming` is called (e.g., from `routeUserPrompt`), the queue can hang.

**Recommendation.** Either (a) clear `streamMessageIdRef.current = null` in `stopStreaming`, or (b) only set it in paths that also drive `streamStatus !== 'idle'` and rely solely on `streamStatus` in the dequeue guard.

---

## Summary

| Domain | Findings |
|---|---|
| 1. Abort lifecycle | F01, F02, F04, F05 |
| 2. Stale closures | F03, F12, F16, F19 |
| 3. Render storms | F07, F09, F17, F22 |
| 4. Escape correctness | F02, F14 |
| 5. Queue races | F03, F04, F05, F06, F25 |
| 6. useEffect deps | F03, F08, F12, F15, F19, F20, F22 |
| 7. Resource lifecycle | F06, F10, F13, F14, F15, F18, F20, F21, F23 |
| 8. Cross-cutting | F11, F13, F23, F24 |

**Top three risks to prioritize:**
1. **F04 (shared `streamRefs` across runs)** — silently corrupts streaming state when a new run starts before the previous one's promise settles. High-impact, hard to repro, easy to ship.
2. **F01 + F02 (AbortController churn + Escape identity)** — combine to leak listeners and potentially cancel the wrong run.
3. **F25 (`stopStreaming` doesn't clear `streamMessageIdRef`)** — concrete dead-lock path with a one-line fix.

**No source edits performed.** All observations are derived from static reading of the listed files at HEAD of the audit snapshot.
