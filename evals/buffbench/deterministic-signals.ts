/**
 * P2-1: Deterministic judge signals.
 *
 * The LLM judge is subjective and high-variance. When an eval configures
 * `finalCheckCommands` (e.g. `bun run typecheck`, `bun run test`, `bun run lint`),
 * the agent-runner already captures their exit codes as `FinalCheckOutput[]`.
 * This module derives deterministic pass/fail signals from those exit codes and
 * uses them to clamp the LLM judge's scores — so a compile failure can never
 * yield a 7/10, regardless of how lenient the LLM judge feels.
 *
 * Design principles:
 * - Pure functions, no I/O, no side effects → trivially unit-testable.
 * - Clamping only ever *reduces* scores, never inflates them. The LLM judge
 *   remains the authority on subjective dimensions; deterministic signals only
 *   enforce hard upper bounds when the build/tests/lint are broken.
 * - Classification of a command as compile/test/lint is heuristic (by command
 *   substring) and intentionally conservative: an unrecognized command is treated
 *   as a generic check that still contributes to the overall fail count, but
 *   does not trigger a category-specific clamp.
 */

import type { FinalCheckOutput } from './types'
import type { JudgingResult } from './judge'

/** Classification of a single final-check command based on its command string. */
export type CheckCategory = 'compile' | 'test' | 'lint' | 'generic'

/** Per-command parsed result. */
export interface ParsedCheck {
  command: string
  category: CheckCategory
  passed: boolean
  exitCode: number
}

/** Aggregate deterministic signals derived from a set of final-check outputs. */
export interface DeterministicSignals {
  /** Total number of final-check commands that ran. */
  commandCount: number
  /** Number of commands that exited non-zero. */
  failCount: number
  /** At least one compile-category command ran and all passed (undefined if none ran). */
  compiles?: boolean
  /** At least one test-category command ran and all passed (undefined if none ran). */
  testsPass?: boolean
  /** At least one lint-category command ran and all passed (undefined if none ran). */
  lintPass?: boolean
  /** True if any command failed. */
  hasAnyFailure: boolean
  /** True if no commands ran at all (no deterministic signal available). */
  isEmpty: boolean
}

/**
 * Classify a single command string into a check category.
 *
 * Heuristics are deliberately conservative and match the conventions observed
 * in the eval configs (e.g. `bun run typecheck`, `bun run test`, `bun run lint`,
 * `npm run build`, `tsc --noEmit`). Unknown commands fall through to `generic`.
 */
export function classifyCommand(command: string): CheckCategory {
  const normalized = command.toLowerCase().trim()
  if (
    normalized.includes('typecheck') ||
    normalized.includes('type-check') ||
    normalized.includes('tsc ') ||
    normalized.includes('build') ||
    normalized.includes('compile')
  ) {
    return 'compile'
  }
  if (
    normalized.includes('lint') ||
    normalized.includes('eslint') ||
    normalized.includes('biome check') ||
    normalized.includes('prettier') ||
    normalized.includes('cargo clippy') ||
    normalized.includes('cargo fmt') ||
    normalized.includes('ruff') ||
    normalized.includes('go vet') ||
    normalized.includes('gofmt') ||
    normalized.includes('rubocop') ||
    normalized.includes('swift-format') ||
    normalized.includes('dotnet format')
  ) {
    return 'lint'
  }
  if (
    normalized.includes('test') ||
    normalized.includes('vitest') ||
    normalized.includes('jest') ||
    normalized.includes('pytest')
  ) {
    return 'test'
  }
  return 'generic'
}

/**
 * Parse a list of final-check outputs into per-command results with categories.
 */
export function parseFinalCheckOutputs(
  outputs: readonly FinalCheckOutput[],
): ParsedCheck[] {
  return outputs.map((output) => ({
    command: output.command,
    category: classifyCommand(output.command),
    passed: output.exitCode === 0,
    exitCode: output.exitCode,
  }))
}

/**
 * Compute aggregate deterministic signals from a list of final-check outputs.
 *
 * A category's signal is `true` only if at least one command in that category
 * ran AND every command in that category passed. If no command in a category
 * ran, the signal is `undefined` (no information — not a pass, not a fail).
 */
export function computeDeterministicSignals(
  outputs: readonly FinalCheckOutput[] | undefined,
): DeterministicSignals {
  if (!outputs || outputs.length === 0) {
    return {
      commandCount: 0,
      failCount: 0,
      hasAnyFailure: false,
      isEmpty: true,
    }
  }

  const parsed = parseFinalCheckOutputs(outputs)
  const commandCount = parsed.length
  const failCount = parsed.filter((p) => !p.passed).length
  const hasAnyFailure = failCount > 0

  const byCategory = (cat: CheckCategory): ParsedCheck[] =>
    parsed.filter((p) => p.category === cat)

  const categorySignal = (cat: CheckCategory): boolean | undefined => {
    const cmds = byCategory(cat)
    if (cmds.length === 0) return undefined
    return cmds.every((c) => c.passed)
  }

  return {
    commandCount,
    failCount,
    compiles: categorySignal('compile'),
    testsPass: categorySignal('test'),
    lintPass: categorySignal('lint'),
    hasAnyFailure,
    isEmpty: false,
  }
}

/**
 * Score caps applied per category when a deterministic failure is present.
 *
 * These are intentionally upper bounds, not hard overrides — the LLM judge may
 * still score *below* the cap. A compile failure is the most severe (the code
 * doesn't even build), so it caps hardest. Test failures are next. Lint
 * failures are the mildest (style), so they cap gently.
 */
const CAP_BY_CATEGORY_FAILED: Record<
  Exclude<CheckCategory, 'generic'>,
  number
> = {
  compile: 3,
  test: 5,
  lint: 7,
}

/**
 * Clamp an LLM judge result based on deterministic signals.
 *
 * Rules (applied in priority order, most severe first):
 * 1. If a compile-category command ran and failed → cap overall & completion at 3.
 * 2. Else if a test-category command ran and failed → cap overall & completion at 5.
 * 3. Else if a lint-category command ran and failed → cap overall & completion at 7.
 * 4. Else if any generic command ran and failed → cap overall & completion at 6.
 *
 * `codeQualityScore` is capped by the same bound as `overallScore` — broken
 * builds should not get high quality marks. If no deterministic signals are
 * available (`isEmpty`), the result is returned unchanged.
 *
 * A `clampedBy` note is appended to `analysis` when clamping occurs, so the
 * eval report records *why* a score was reduced (auditable + explains variance
 * reduction vs. unclamped runs).
 */
export function clampScoresByDeterministicSignals(
  result: JudgingResult,
  signals: DeterministicSignals,
): JudgingResult {
  if (signals.isEmpty || !signals.hasAnyFailure) {
    return result
  }

  let cap: number | undefined
  let reason: string | undefined

  if (signals.compiles === false) {
    cap = CAP_BY_CATEGORY_FAILED.compile
    reason = 'compile'
  } else if (signals.testsPass === false) {
    cap = CAP_BY_CATEGORY_FAILED.test
    reason = 'test'
  } else if (signals.lintPass === false) {
    cap = CAP_BY_CATEGORY_FAILED.lint
    reason = 'lint'
  } else {
    // Some generic command failed but no compile/test/lint signal failed.
    cap = 6
    reason = 'generic'
  }

  if (cap === undefined || reason === undefined) {
    return result
  }

  const clamped = {
    ...result,
    overallScore: Math.min(result.overallScore, cap),
    completionScore: Math.min(result.completionScore, cap),
    codeQualityScore: Math.min(result.codeQualityScore, cap),
  }

  const note = `[deterministic clamp: ${reason} check failed → scores capped at ${cap}]`
  // Prepend the note so it's visible in reports without burying the analysis.
  clamped.analysis = clamped.analysis
    ? `${note}\n${clamped.analysis}`
    : note

  return clamped
}
