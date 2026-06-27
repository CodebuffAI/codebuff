import { expect, describe, test } from 'bun:test'

import type { FinalCheckOutput } from '../types'
import type { JudgingResult } from '../judge'

import {
  classifyCommand,
  parseFinalCheckOutputs,
  computeDeterministicSignals,
  clampScoresByDeterministicSignals,
  type DeterministicSignals,
} from '../deterministic-signals'

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function makeOutput(
  command: string,
  exitCode: number,
  overrides: Partial<FinalCheckOutput> = {},
): FinalCheckOutput {
  return {
    command,
    exitCode,
    stdout: overrides.stdout ?? '',
    stderr: overrides.stderr ?? '',
  }
}

function makeJudgeResult(
  overrides: Partial<JudgingResult> = {},
): JudgingResult {
  return {
    analysis: overrides.analysis ?? 'Looks reasonable.',
    strengths: overrides.strengths ?? ['covers the prompt'],
    weaknesses: overrides.weaknesses ?? [],
    completionScore: overrides.completionScore ?? 8,
    codeQualityScore: overrides.codeQualityScore ?? 8,
    overallScore: overrides.overallScore ?? 8,
  }
}

// ---------------------------------------------------------------------------
// classifyCommand
// ---------------------------------------------------------------------------

describe('classifyCommand', () => {
  test('classifies typecheck commands as compile', () => {
    expect(classifyCommand('bun run typecheck')).toBe('compile')
    expect(classifyCommand('npm run type-check')).toBe('compile')
    expect(classifyCommand('tsc --noEmit')).toBe('compile')
    expect(classifyCommand('yarn build')).toBe('compile')
    expect(classifyCommand('npm run compile')).toBe('compile')
  })

  test('classifies test commands as test', () => {
    expect(classifyCommand('bun run test')).toBe('test')
    expect(classifyCommand('vitest run')).toBe('test')
    expect(classifyCommand('jest --ci')).toBe('test')
    expect(classifyCommand('pytest -q')).toBe('test')
  })

  test('classifies lint commands as lint', () => {
    expect(classifyCommand('bun run lint')).toBe('lint')
    expect(classifyCommand('eslint . --max-warnings 0')).toBe('lint')
    expect(classifyCommand('biome check src/')).toBe('lint')
    expect(classifyCommand('prettier --check .')).toBe('lint')
  })

  test('falls back to generic for unrecognized commands', () => {
    expect(classifyCommand('echo hello')).toBe('generic')
    expect(classifyCommand('git status')).toBe('generic')
    expect(classifyCommand('rm -rf node_modules')).toBe('generic')
  })

  test('is case-insensitive and trims whitespace', () => {
    expect(classifyCommand('  BUN RUN TYPECHECK  ')).toBe('compile')
    expect(classifyCommand('  ESLint .  ')).toBe('lint')
  })

  test('precedence: "build" in a test command still classifies as compile', () => {
    // "build" is checked before "test" in classification order. This documents
    // the deliberate compile-priority design: a build step is more severe.
    expect(classifyCommand('npm run build:test')).toBe('compile')
  })
})

// ---------------------------------------------------------------------------
// parseFinalCheckOutputs
// ---------------------------------------------------------------------------

describe('parseFinalCheckOutputs', () => {
  test('parses per-command category and pass/fail', () => {
    const outputs: FinalCheckOutput[] = [
      makeOutput('bun run typecheck', 0),
      makeOutput('bun run test', 1),
      makeOutput('bun run lint', 0),
      makeOutput('echo done', 0),
    ]
    const parsed = parseFinalCheckOutputs(outputs)
    expect(parsed).toHaveLength(4)
    expect(parsed[0]).toEqual({
      command: 'bun run typecheck',
      category: 'compile',
      passed: true,
      exitCode: 0,
    })
    expect(parsed[1].category).toBe('test')
    expect(parsed[1].passed).toBe(false)
    expect(parsed[1].exitCode).toBe(1)
    expect(parsed[2].category).toBe('lint')
    expect(parsed[3].category).toBe('generic')
  })

  test('treats non-zero exit codes as failures', () => {
    const parsed = parseFinalCheckOutputs([
      makeOutput('tsc --noEmit', 2),
      makeOutput('tsc --noEmit', 127),
    ])
    expect(parsed.every((p) => !p.passed)).toBe(true)
  })

  test('empty input yields empty parse', () => {
    expect(parseFinalCheckOutputs([])).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// computeDeterministicSignals
// ---------------------------------------------------------------------------

describe('computeDeterministicSignals', () => {
  test('returns empty signals for undefined/empty input', () => {
    expect(computeDeterministicSignals(undefined).isEmpty).toBe(true)
    expect(computeDeterministicSignals([]).isEmpty).toBe(true)
  })

  test('empty signals have no category fields and no failures', () => {
    const s = computeDeterministicSignals([])
    expect(s.commandCount).toBe(0)
    expect(s.failCount).toBe(0)
    expect(s.hasAnyFailure).toBe(false)
    expect(s.compiles).toBeUndefined()
    expect(s.testsPass).toBeUndefined()
    expect(s.lintPass).toBeUndefined()
  })

  test('all-pass yields true signals with no failures', () => {
    const s = computeDeterministicSignals([
      makeOutput('bun run typecheck', 0),
      makeOutput('bun run test', 0),
      makeOutput('bun run lint', 0),
    ])
    expect(s.commandCount).toBe(3)
    expect(s.failCount).toBe(0)
    expect(s.hasAnyFailure).toBe(false)
    expect(s.isEmpty).toBe(false)
    expect(s.compiles).toBe(true)
    expect(s.testsPass).toBe(true)
    expect(s.lintPass).toBe(true)
  })

  test('compile failure sets compiles=false and counts the fail', () => {
    const s = computeDeterministicSignals([
      makeOutput('bun run typecheck', 2),
      makeOutput('bun run test', 0),
      makeOutput('bun run lint', 0),
    ])
    expect(s.compiles).toBe(false)
    expect(s.testsPass).toBe(true)
    expect(s.lintPass).toBe(true)
    expect(s.failCount).toBe(1)
    expect(s.hasAnyFailure).toBe(true)
  })

  test('partial-category failure reports that category as false', () => {
    // Two compile commands: one passes, one fails → compiles should be false
    const s = computeDeterministicSignals([
      makeOutput('tsc --noEmit', 0),
      makeOutput('npm run build', 1),
      makeOutput('bun run test', 0),
    ])
    expect(s.compiles).toBe(false)
    expect(s.testsPass).toBe(true)
    expect(s.lintPass).toBeUndefined() // no lint command ran
    expect(s.failCount).toBe(1)
  })

  test('category signal is undefined when no command in that category ran', () => {
    const s = computeDeterministicSignals([
      makeOutput('bun run test', 0),
      makeOutput('echo done', 0),
    ])
    expect(s.compiles).toBeUndefined()
    expect(s.testsPass).toBe(true)
    expect(s.lintPass).toBeUndefined()
  })

  test('generic-only failure is tracked in failCount and hasAnyFailure', () => {
    const s = computeDeterministicSignals([
      makeOutput('bun run typecheck', 0),
      makeOutput('echo step', 1),
    ])
    expect(s.compiles).toBe(true)
    expect(s.failCount).toBe(1)
    expect(s.hasAnyFailure).toBe(true)
    // No compile/test/lint category failed, so those stay true/undefined
    expect(s.testsPass).toBeUndefined()
    expect(s.lintPass).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// clampScoresByDeterministicSignals
// ---------------------------------------------------------------------------

describe('clampScoresByDeterministicSignals', () => {
  test('returns result unchanged when signals are empty', () => {
    const result = makeJudgeResult({ overallScore: 9 })
    const clamped = clampScoresByDeterministicSignals(result, {
      commandCount: 0,
      failCount: 0,
      hasAnyFailure: false,
      isEmpty: true,
    })
    expect(clamped).toBe(result)
  })

  test('returns result unchanged when there are no failures', () => {
    const result = makeJudgeResult({ overallScore: 9 })
    const clamped = clampScoresByDeterministicSignals(result, {
      commandCount: 3,
      failCount: 0,
      compiles: true,
      testsPass: true,
      lintPass: true,
      hasAnyFailure: false,
      isEmpty: false,
    })
    expect(clamped).toBe(result)
  })

  test('compile failure caps scores at 3', () => {
    const result = makeJudgeResult({
      overallScore: 9,
      completionScore: 9,
      codeQualityScore: 9,
    })
    const signals: DeterministicSignals = {
      commandCount: 3,
      failCount: 1,
      compiles: false,
      testsPass: true,
      lintPass: true,
      hasAnyFailure: true,
      isEmpty: false,
    }
    const clamped = clampScoresByDeterministicSignals(result, signals)
    expect(clamped.overallScore).toBe(3)
    expect(clamped.completionScore).toBe(3)
    expect(clamped.codeQualityScore).toBe(3)
    expect(clamped.analysis).toContain('compile')
    expect(clamped.analysis).toContain('capped at 3')
  })

  test('test failure caps scores at 5 when compile passes', () => {
    const result = makeJudgeResult({ overallScore: 8 })
    const signals: DeterministicSignals = {
      commandCount: 2,
      failCount: 1,
      compiles: true,
      testsPass: false,
      lintPass: true,
      hasAnyFailure: true,
      isEmpty: false,
    }
    const clamped = clampScoresByDeterministicSignals(result, signals)
    expect(clamped.overallScore).toBe(5)
    expect(clamped.analysis).toContain('test')
    expect(clamped.analysis).toContain('capped at 5')
  })

  test('lint failure caps scores at 7 when compile and tests pass', () => {
    const result = makeJudgeResult({ overallScore: 9 })
    const signals: DeterministicSignals = {
      commandCount: 3,
      failCount: 1,
      compiles: true,
      testsPass: true,
      lintPass: false,
      hasAnyFailure: true,
      isEmpty: false,
    }
    const clamped = clampScoresByDeterministicSignals(result, signals)
    expect(clamped.overallScore).toBe(7)
    expect(clamped.analysis).toContain('lint')
  })

  test('generic-only failure caps scores at 6', () => {
    const result = makeJudgeResult({ overallScore: 9 })
    const signals: DeterministicSignals = {
      commandCount: 2,
      failCount: 1,
      compiles: true,
      testsPass: undefined,
      lintPass: undefined,
      hasAnyFailure: true,
      isEmpty: false,
    }
    const clamped = clampScoresByDeterministicSignals(result, signals)
    expect(clamped.overallScore).toBe(6)
    expect(clamped.analysis).toContain('generic')
  })

  test('compile failure takes priority over test/lint failures', () => {
    const result = makeJudgeResult({ overallScore: 10 })
    const signals: DeterministicSignals = {
      commandCount: 3,
      failCount: 3,
      compiles: false,
      testsPass: false,
      lintPass: false,
      hasAnyFailure: true,
      isEmpty: false,
    }
    const clamped = clampScoresByDeterministicSignals(result, signals)
    // Compile is most severe → cap 3 wins over test (5) and lint (7)
    expect(clamped.overallScore).toBe(3)
    expect(clamped.analysis).toContain('compile')
  })

  test('clamping only reduces, never inflates low scores', () => {
    const result = makeJudgeResult({ overallScore: 2, completionScore: 1 })
    const signals: DeterministicSignals = {
      commandCount: 1,
      failCount: 1,
      compiles: false,
      hasAnyFailure: true,
      isEmpty: false,
    }
    const clamped = clampScoresByDeterministicSignals(result, signals)
    expect(clamped.overallScore).toBe(2) // min(2, 3) = 2
    expect(clamped.completionScore).toBe(1) // min(1, 3) = 1
  })

  test('prepends clamp note to existing analysis without destroying it', () => {
    const result = makeJudgeResult({
      analysis: 'The agent did a reasonable job overall.',
      overallScore: 8,
    })
    const signals: DeterministicSignals = {
      commandCount: 1,
      failCount: 1,
      compiles: false,
      hasAnyFailure: true,
      isEmpty: false,
    }
    const clamped = clampScoresByDeterministicSignals(result, signals)
    expect(clamped.analysis.startsWith('[deterministic clamp')).toBe(true)
    expect(clamped.analysis).toContain('The agent did a reasonable job overall.')
  })

  test('handles missing analysis field gracefully', () => {
    const result = makeJudgeResult({ analysis: '', overallScore: 8 })
    const signals: DeterministicSignals = {
      commandCount: 1,
      failCount: 1,
      compiles: false,
      hasAnyFailure: true,
      isEmpty: false,
    }
    const clamped = clampScoresByDeterministicSignals(result, signals)
    expect(clamped.analysis.startsWith('[deterministic clamp')).toBe(true)
  })

  test('does not mutate the original result object', () => {
    const result = makeJudgeResult({ overallScore: 9 })
    const signals: DeterministicSignals = {
      commandCount: 1,
      failCount: 1,
      compiles: false,
      hasAnyFailure: true,
      isEmpty: false,
    }
    const clamped = clampScoresByDeterministicSignals(result, signals)
    expect(result.overallScore).toBe(9) // unchanged
    expect(clamped).not.toBe(result)
    expect(clamped.overallScore).toBe(3)
  })
})

// ---------------------------------------------------------------------------
// Integration: end-to-end compute → clamp
// ---------------------------------------------------------------------------

describe('integration: compute → clamp', () => {
  test('a compile failure flows from outputs to clamped scores', () => {
    const outputs: FinalCheckOutput[] = [
      makeOutput('bun run typecheck', 1, { stderr: 'TS2304: Cannot find name' }),
      makeOutput('bun run test', 0),
    ]
    const signals = computeDeterministicSignals(outputs)
    const result = makeJudgeResult({ overallScore: 8, completionScore: 7 })
    const clamped = clampScoresByDeterministicSignals(result, signals)
    expect(clamped.overallScore).toBe(3)
    expect(clamped.completionScore).toBe(3)
    expect(clamped.analysis).toContain('compile')
  })

  test('all-pass signals produce no clamping', () => {
    const outputs: FinalCheckOutput[] = [
      makeOutput('bun run typecheck', 0),
      makeOutput('bun run test', 0),
      makeOutput('bun run lint', 0),
    ]
    const signals = computeDeterministicSignals(outputs)
    const result = makeJudgeResult({ overallScore: 9 })
    const clamped = clampScoresByDeterministicSignals(result, signals)
    expect(clamped).toBe(result)
  })

  test('no final-check outputs produces no clamping', () => {
    const signals = computeDeterministicSignals(undefined)
    const result = makeJudgeResult({ overallScore: 9 })
    const clamped = clampScoresByDeterministicSignals(result, signals)
    expect(clamped).toBe(result)
  })
})
