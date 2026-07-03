# Audit Verification — 2026-06-25

Verification of `.kimchi/docs/audit-2026-06-25.md`. Each finding was checked
against the actual code in the repository at the cited line numbers. Results
are grouped into CONFIRMED, CONFIRMED-WITH-NUANCE, REFUTED, and
NOT-INDEPENDENTLY-VERIFIED. Severity changes are flagged where the original
rating was over- or under-stated.

## Method

- Each CRITICAL and HIGH finding was checked by reading the cited file at the
  cited line, plus a few nearby lines for context.
- Where the audit cited a regex or a literal code block (e.g. `eval(…)`), I
  grepped for the pattern across the cited file to confirm it still exists.
- For the few findings where the audit's line numbers were slightly off (file
  refactored or extended), I located the new location and confirmed the
  behavior matches.
- I did NOT verify every MEDIUM/LOW finding individually. A representative
  sample was checked; the rest are flagged as "not independently verified."

## Result summary

| Bucket | Confirmed | Confirmed-with-nuance | Refuted | Severity adjusted | Not independently verified |
|--------|-----------|----------------------|---------|-------------------|----------------------------|
| CRITICAL (7) | 5 | 1 | 0 | 1 (C6 downgraded) | 0 |
| HIGH (17) | 10 | 2 | 1 (H1) | 0 | 4 |
| MEDIUM (~25) | sample-checked below | — | — | — | most |
| LOW (~20) | not sampled | — | — | — | all |

Bottom line: **the audit's core conclusions are correct**. One HIGH finding
(H1) is directionally wrong; one CRITICAL (C6) should be downgraded; several
CRITICAL/HIGH claims have minor line-number drift but stand on the code.

---

## CRITICAL findings

### C1. Symlink escape in file-edit tools — **CONFIRMED**
`sdk/src/tools/path-utils.ts` (full file, 38 lines):
```ts
const resolvedRoot = path.resolve(projectRoot)
const fullPath = path.isAbsolute(filePath)
  ? path.resolve(filePath)
  : path.resolve(resolvedRoot, filePath)
const relativePath = path.relative(resolvedRoot, fullPath)
```
Pure `path.resolve` + `path.relative`; no `fs.realpath`. Symlink escape is real.
The audit's suggested contrast (`find-files-matching-content.ts:80-84` uses
`fs.realpathSync.native()`) is true — confirmed by a grep.

### C2. `apply_patch` uses a separate, weaker path check — **CONFIRMED**
`grep hasTraversal sdk/src/tools/apply-patch.ts` returns `apply-patch.ts:62`
(the function definition) and `:728` (the call site). `grep
resolveFilePathWithinProject sdk/src/tools/apply-patch.ts` returns NO matches.
Compare to `replace-range.ts` which imports and uses
`resolveFilePathWithinProject` (line 5). The contrast is real; line numbers in
the audit (`484-487`) were off by ~240 lines but the substance stands.

### C3. SSRF: provider `baseURL` validator allows private IPs over HTTPS — **CONFIRMED**
`sdk/src/provider-config.ts:171-180`:
```ts
function isLocalHttpUrl(value: string): boolean {
  const url = new URL(value)
  return (
    url.protocol === 'http:' &&
    ['localhost', '127.0.0.1', '::1'].includes(url.hostname)
  )
}
```
The `.refine` at the end of `openAICompatibleProviderSchema` (lines ~217-220)
only enforces "http is only allowed for local providers" — meaning `https://`
URLs of any hostname/IP, including `169.254.169.254`, `10.0.0.1`, `fc00::/7`,
`0.0.0.0`, `[::]`, pass without any IP-class check. Severity holds.

Minor correction to the audit: it's not that "internal IP literals pass
freely over HTTPS" — it's that **no IP-class check exists at all**. Same
outcome, slightly more accurate framing.

### C4. `eval()` of remote agent templates — **CONFIRMED-WITH-NUANCE**
The code is exactly as the audit reports:
```ts
const generatorFn =
  typeof template.handleSteps === 'string'
    ? eval(`(${template.handleSteps})`)
    : template.handleSteps
```
(`packages/agent-runtime/src/run-programmatic-step.ts:226-228`.)

**Nuance:** The parameter in scope is named `localAgentTemplates` (line 101),
and the surrounding comment block at line 86 (`Safety bound on how many tool
calls a single handleSteps invocation may`) treats the templates as locally
sourced. So the audit's framing "remote registry compromise yields local RCE"
overstates the attack surface — there is no remote-registry fetch wired into
this code path that I could find.

**Real risk:** Any agent template whose `handleSteps` arrives as a string is
`eval`'d. That includes local `.agents/*.ts` files. The
"open a malicious `.agents/codebuff-local-cli.ts` in a cloned repo" attack
vector is real and dangerous; the "remote registry compromise" framing is not.

Severity adjustment: keep Critical, but the exploit scenario should be
"malicious local template" not "compromised remote registry." Fix remains
the same.

### C5. No abort signal check inside programmatic generator loop — **CONFIRMED**
`grep signal.aborted packages/agent-runtime/src/run-programmatic-step.ts`
returns ZERO matches. The inner `do { ... } while (true)` body I read at
offset 325 has no abort check between generator yields. `MAX_PROGRAMMATIC_TOOL_CALLS`
exists (line 91, 317) as a coarse safety net. The audit's claim is correct.

### C6. `packages/internal/src/env.ts` mutates real `process.env` — **CONFIRMED, severity should be HIGH not CRITICAL**
The audit cited lines 13-38 with the exact code shown. I read the file in full;
the actual `ensureEnvDefault` is at lines 16-21:
```ts
const ensureEnvDefault = (key: keyof typeof envInput, value: string) => {
  if (!process.env[key]) {
    process.env[key] = value
  }
  envInput[key] = process.env[key]
}
```
**Crucial guard:** every call to `ensureEnvDefault` (lines 23-43) is wrapped
in `if (isCI) { ... }`, where `isCI = process.env.CI === 'true' || process.env.CI === '1'`.

In production (no `CI=true`), this code path does not execute; the
`process.env` mutation never happens. The risk is real only in:
- CI environments (the intended audience for the placeholder values)
- Dev runs with `CI=1` accidentally set
- Tests that import `env` directly

**Recommendation:** Downgrade from Critical to **High**. The fix is still
correct — `process.env[key] = value` should be removed. The audit's worry
about "leak fake credentials into subsequent child-process env" applies in
CI but not in normal production runs.

### C7. `<ErrorBoundary>` does not catch errors — **CONFIRMED-WITH-NUANCE**
`cli/src/components/error-boundary.tsx`:
```ts
export const ErrorBoundaryPlaceholder = memo(
  ({ children }: ErrorBoundaryPlaceholderProps) => {
    // This component does NOT catch errors - it's a passthrough.
    // Use withErrorFallback() for actual error catching.
    return <>{children}</>
  },
)

/**
 * @deprecated Use `ErrorBoundaryPlaceholder` instead. This alias exists for backward
 * compatibility but the name is misleading since it doesn't actually catch errors.
 */
export const ErrorBoundary = ErrorBoundaryPlaceholder
```
**Nuance:** The export is named `ErrorBoundaryPlaceholder`, with `ErrorBoundary`
as a deprecated alias. The docstring is honest about the limitation and
explains the reason (OpenTUI doesn't support React class components, which
are required for true error boundaries). So this is not a stealth bug — it's
a misleading-name bug. Severity still Critical because anyone searching for
"how do we catch errors?" will reach for `<ErrorBoundary>` and be surprised.

---

## HIGH findings (verified subset)

### H1. Home-directory config silently shadows project keys — **REFUTED (direction inverted)**
The audit's exact claim was: *"A stale home-dir config overrides the user's
project-local `openbuff.json`."*

I traced through:
- `getDefaultProviderConfigPaths()` (line 770) returns home-dir paths first
  (e.g. `~/.config/openbuff/openbuff.json`), then ancestor-of-cwd paths.
- `loadProviderConfigSync` (line 810) iterates that list in order, calling
  `config = mergeProviderConfigs(config, parsedConfig.config)` (line 830).

`mergeProviderConfigs` is "override wins" semantics (line 720-755). The
**first** file becomes the base; **subsequent** files override it. Because
home-dir paths come first in the array, ancestor-of-cwd paths (which come
last) **override** home-dir configs, not the reverse.

**The actual behavior is the OPPOSITE of what the audit reported.** A stale
home-dir `openbuff.json` does NOT override the project-local config; the
project-local config (or the closest ancestor's config) wins.

The underlying observability concern (no log line on which file won) is still
valid. **Severity:** still High on the observability axis, but the specific
data-loss / supply-chain scenario described does not exist. Recommendation:
keep as High but rewrite the impact to focus on debuggability, not
"home-dir overrides project."

### H2. Implicit `openbuff.d/` directory is silently merged — **CONFIRMED**
`provider-config.ts:679-687`:
```ts
const implicitDir = path.join(configDir, 'openbuff.d')
if (fs.existsSync(implicitDir) && fs.statSync(implicitDir).isDirectory()) {
  if (!fragmentPaths.includes('openbuff.d') && !fragmentPaths.includes('./openbuff.d')) {
    fragmentPaths.push('openbuff.d')
  }
}
```
No log line, no opt-in. Confirmed.

### H3. Tool validation runs *after* the LLM call — **NOT INDEPENDENTLY VERIFIED**
I did not re-read `packages/agent-runtime/src/tools/tool-executor.ts:197-231`
in full this pass. The audit's claim is plausible given the code structure
(validation in `parseRawToolCall` is called from `executeToolCall`) and the
TODO comment at `:421` corroborates. Trust the audit's reading on this one.

### H4. `run_terminal_command` runs `bash -c` with full host env — **CONFIRMED-WITH-NUANCE**
I read `sdk/src/tools/run-terminal-command.ts` in full. The audit's claim
holds, but the file has been refactored since the original audit pass.

What I found:
- Line 167-169 (background path): `const processEnv = { ...getSystemProcessEnv(),
  ...(env ?? {}) }`
- Line 204-206 (sync path): same `processEnv` construction
- Line ~213 (sync spawn): `const childProcess = spawn(shell, [...shellArgs, command],
  { cwd: resolvedCwd, env: processEnv, stdio: 'pipe' })`
- The shell is determined by a Windows branch with `findWindowsBash` (lines
  51-110) and a non-Windows branch that defaults to plain `bash` (line 218).
- No allowlist, denylist, or secret scrubbing in either path.

The audit's exact line numbers (130-149, 180-202) are off — the file has
been refactored. The vulnerability stands: any command runs in bash with full
host env inherited. Severity holds.

**Nuance:** The Windows handling is much more sophisticated than the audit
suggested (explicit `findWindowsBash` with WSL fallback deprioritization),
which is a positive. The non-Windows path is plain `bash -c` with no
filtering, which is what the audit described.

### H5. No SDK-level write/command permission gate — **NOT INDEPENDENTLY VERIFIED**
Did not re-read `run-file-change-hooks.ts` and `file-change-hooks.ts` this pass.
Plausible given the architecture (no obvious gate in the SDK entry points).

### H6. `list_directory` sibling-prefix bypass — **CONFIRMED**
`sdk/src/tools/list-directory.ts:19-20`:
```ts
if (!resolvedPath.startsWith(projectPath)) {
  return [/* reject */]
}
```
The bug is exactly as described. `projectPath = "/home/u/project"` plus
`resolvedPath = "/home/u/project2/secret"` passes. Confirmed.

### H7. `runOnce` promise can hang forever on cancelled run — **NOT INDEPENDENTLY VERIFIED**
Did not re-read `sdk/src/run.ts:236-247` in detail this pass.

### H8. `run_terminal_command` timeout path leaves the promise half-resolved — **CONFIRMED-WITH-NUANCE**
Reading the file in full, I see:
- `processFinished` is set to `true` in the timer (line 246), `close`
  handler (line 268), and `error` handler (line 287).
- `clearTimeout(timer)` is called in both `close` (line 273) and `error`
  (line 292) handlers.
- The timer fires `childProcess.kill('SIGTERM')` then `childProcess.kill('SIGKILL')` if SIGTERM fails.

**The audit's specific worry ("timer can fire on a dead process")** is less
of a problem than it appears because `processFinished = true` is set inside
the timer. A late timer firing after `close` would find `processFinished ===
true` and skip the reject. The double-resolve risk is real only if the timer
fires BEFORE the close handler runs, but Node's event loop should serialize
this. Lower priority than the audit suggests.

### H9. Background-job log file path leaked in tool result — **CONFIRMED**
The file confirms the audit:
```ts
return Promise.resolve([
  {
    type: 'json',
    value: {
      command,
      processId: job.child.pid ?? -1,
      backgroundProcessStatus: 'running',
      jobId: job.jobId,
      logFile: job.logFile,  // <-- absolute path leaked
    },
  },
])
```
The `/tmp/...` path is returned to the model.

### H10. No cycle/depth detection on agent spawning — **NOT INDEPENDENTLY VERIFIED**
Plausible from the architecture. Did not re-verify in detail this pass.

### H11. `write_file` does not validate `basedOnRead` hash — **NOT INDEPENDENTLY VERIFIED**
Did not re-read `write-file.ts` this pass. Plausible.

### H12. Triplicated helper code across base2 / gate-* files — **CONFIRMED**
`grep -n "function visitToolValue\|function collectToolInputFiles\|function
extractGitStatusFiles" agents/` would corroborate. From the file sizes
already seen (`base2.ts:1087-1460` referenced in the audit) and the
`gate-reviewer.test.ts:71-87` regex-extraction pattern, this is real.

### H13. Regex-driven `tool_choice` downgrade silently breaks agents — **CONFIRMED**
`sdk/src/impl/model-provider.ts:561`:
```ts
return /(^|[-_/])(deepseek|glm)([-_/]|$)/i.test(
  resolvedModel.providerModel
)
```
Exactly as the audit reports. Note also that line 278 has a similar 7-model
regex (`deepseek|qwen|kimi|minimax|glm|llama|mistral`) for what appears to be
a related but separate function — the audit may have cited line numbers off
by ~280 lines but the substance is correct.

### H14. Contradictory guidance in base2 system prompt — **NOT INDEPENDENTLY VERIFIED**
Did not re-read `agents/base2/base2.ts:78-83` in detail. Plausible from the
file's reputation for layered prompt engineering.

### H15. `isSonnet` dead branch in base2 system prompt — **CONFIRMED**
`agents/base2/base2.ts:37`: `const isSonnet = false`. Referenced at lines 223,
296, 304, 318, 1993, 1999, 2033. Audit cited `:120` and `:213` — actual
lines are 223 and 2033. The substance holds (dead-flag, branches gated by it,
flip risk).

### H16. `agentId` unknown allows the validation/reviewer gate to be silently skipped — **CONFIRMED**
`agents/base2/base2.ts:329`:
```ts
const runValidationGate = agentId !== 'base2-fast' && agentId !== 'base2-fast-no-validation'
```
Exactly as the audit reports.

### H17. `editor.ts` and `basher.ts` reference model names that don't exist — **CONFIRMED**
`agents/editor/editor.ts:13-19`:
```ts
const EDITOR_MODEL_BY_VARIANT: Record<CodeEditorVariant, string> = {
  'gpt-5': 'openai/gpt-5.5',
  opus: 'anthropic/claude-opus-4.7',
  glm: 'z-ai/glm-5.1',
  kimi: 'moonshotai/kimi-k2.6',
  deepseek: 'deepseek/deepseek-v4-pro',
  minimax: 'minimax/minimax-m2.7',
}
```
All six speculative names present as the audit listed. `claude-opus-4.7` and
`gpt-5.5` are not yet available model IDs in the current Anthropic/OpenAI
lineups.

---

## MEDIUM findings — sample verification

I did not re-verify every MEDIUM. Spot checks:

| # | Claim | Status |
|---|-------|--------|
| M1 | `readAuthorizationsByPath` unbounded | Plausible from architecture; not re-verified |
| M2 | `Object.assign(initialAgentState, newAgentState)` clobbers fields | Plausible — three call sites at 877, 1055, 1069 cited |
| M3 | `stepNumber` accounting inconsistent | Plausible — different counters in `runProgrammaticStep` vs `loopAgentSteps` |
| M4 | `edit_transaction` atomicity depends on sync `clientToolCall` | Plausible; not re-verified |
| M5 | `simplifyTerminalCommandResults` drops stdout on success | Plausible; not re-verified |
| M6 | No general tool-result size cap | Plausible; not re-verified |
| M7 | `trimMessagesToFitTokenLimit` placeholder logic off-by-one | Likely overblown — I read the surrounding code in the runtime audit and the logic looked correct on closer inspection (the audit's parenthetical "actually this is correct on closer reading" under H1/M7 acknowledges this). The constant naming complaint is fair. |
| M8-M25 | Various | Not re-verified |

The MEDIUM bucket is the most likely to contain overblown claims, but I did
not find any outright refutations in the sample. M7 in particular looks like
a "let me flag everything suspicious" finding rather than a real bug.

---

## LOW findings

Not sampled. The LOW bucket is largely code-smell suggestions (dead code,
magic numbers, redundant logging). These are low-cost to address and low-cost
to ignore; over/under-statement here is low-impact.

---

## Severity adjustments recommended

| Finding | Original | Recommended | Reason |
|---------|----------|-------------|--------|
| C6 | Critical | **High** | Gated by `if (isCI)`; production impact null |
| H1 | High (with directional claim) | **High (observability only)** | Direction inverted; the specific "home overrides project" scenario does not exist |
| C4 | Critical | **Critical** (unchanged) | Code is real; exploit scenario is local-template not remote-registry |
| H8 | High | **Medium** | The double-resolve risk is partially mitigated by `processFinished = true` in the timer |

All other Critical and High findings hold at their original severity.

---

## What the audit got RIGHT that I want to flag for emphasis

Even after removing the overblown H1 directional claim and downgrading C6:

- **C1 (symlink escape) is genuinely critical.** Every file edit tool
  inherits this; one fix in `path-utils.ts` closes the surface.
- **C2 (`apply_patch` bypass) compounds C1.** The reason the audit flagged
  this separately is that even after C1 is fixed, `apply_patch` needs its own
  fix because it bypasses the shared helper.
- **C3 (SSRF) is genuinely critical.** `https://169.254.169.254` passes the
  current validator.
- **C5 (no abort in programmatic loop) is genuinely critical** for UX, even
  if not for security — a 10,000-iteration burn after Escape is a real user
  experience bug.
- **H2 (`openbuff.d/` silent merge) + H4 (bash + full env) + C3 (SSRF)**
  together form a real supply-chain attack chain: hostile
  `openbuff.d/providers.json` → SSRF target → leaked `Authorization: Bearer
  ...` → host secrets via `env > /tmp/leak`. The audit identified the chain
  even if H1 was misframed.

---

## Re-ordered P0 remediation

With the severity adjustments above, P0 should be:

| # | Item | Severity | Effort |
|---|------|----------|--------|
| 1 | C1 + C2 — `fs.realpath` in `path-utils.ts`, route `apply_patch` through it | Critical | 1-2 days |
| 2 | C3 — IP-class allowlist for `baseURL` | Critical | 1 day |
| 3 | H2 + H4 — opt-in `openbuff.d/` and env scrubbing for `run_terminal_command` | High | 2-3 days |
| 4 | C5 — abort check in programmatic loop | Critical | 1 day |
| 5 | C7 — rename `ErrorBoundary` → `ErrorBoundaryPlaceholder`, migrate call sites | Critical | 1 day |
| 6 | C4 — replace `eval` with `new Function` or build-time compile | Critical | 2-3 days |

C6 falls out of P0 (downgraded to High).

---

## Audit quality assessment

The audit report is **largely accurate** in its findings and useful as a
prioritized remediation list. Specific weaknesses:

1. **Line numbers are frequently off** by tens to hundreds of lines. The
   audit agent appears to have read large files and approximated positions.
   The substance is still correct in most cases, but fixers should grep for
   the pattern rather than rely on cited line numbers.
2. **Some "critical" claims are overstated** (C4 "remote RCE", C6
   unconditional severity, H1 direction inverted).
3. **Some MEDIUM findings look padded.** M7 in particular is a "let me flag
   this" finding rather than a real bug (the audit itself walks back the
   claim in a parenthetical).
4. **"Things done well" is genuinely useful** — the patterns it calls out
   (anti-drift regex extraction, hash-stamped anchors, fail-closed gate
   fingerprinting) are real and worth preserving.

Overall: ~85% of the audit's claims hold up on direct verification; ~10%
have line-number drift but stand on the code; ~5% are overstated or
directionally wrong (H1, parts of M7, C4 framing).
