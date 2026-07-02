import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'bun:test'

import {
  collectReviewerBlockers,
  detectReviewerCrash,
  getReviewerFinalizationVerdict,
  stripReviewerPreamble,
} from '../base2/gate-reviewer'

type ReviewerFinalizationVerdict = 'LOOKS_GOOD' | 'NON_BLOCKING' | ''

type GateReviewerHelpers = {
  stripReviewerPreamble: (text: string) => string
  collectReviewerBlockers: (toolResult: unknown) => string[]
  getReviewerFinalizationVerdict: (
    toolResult: unknown,
  ) => ReviewerFinalizationVerdict
  detectReviewerCrash: (toolResult: unknown) => string | null
}

type GateReviewerFunctionName = keyof GateReviewerHelpers
type InlineHelperFactory = () => GateReviewerHelpers

const INLINE_HELPER_NAMES: GateReviewerFunctionName[] = [
  'stripReviewerPreamble',
  'collectReviewerBlockers',
  'getReviewerFinalizationVerdict',
  'detectReviewerCrash',
]

const INLINE_DEPENDENCY_NAMES = [
  'collectStructuredReviewerOutputs',
  'visitForStructuredVerdict',
  'hasReviewerLineVerdict',
  'collectStrings',
  'findReviewerCrash',
] as const

function extractInlineFunctionSource(
  source: string,
  functionName: string,
): string {
  const declarationStart = source.indexOf(`function ${functionName}(`)
  if (declarationStart < 0) {
    throw new Error(`Unable to find inline ${functionName} declaration`)
  }

  const bodyStart = source.indexOf('{', declarationStart)
  if (bodyStart < 0) {
    throw new Error(`Unable to find inline ${functionName} body`)
  }

  let depth = 0
  for (let index = bodyStart; index < source.length; index += 1) {
    const character = source[index]
    if (character === '{') depth += 1
    if (character === '}') depth -= 1
    if (depth === 0) {
      return source.slice(declarationStart, index + 1)
    }
  }

  throw new Error(`Unable to find end of inline ${functionName} declaration`)
}

function loadInlineGateReviewerHelpers(): GateReviewerHelpers {
  const base2Source = readFileSync(
    new URL('../base2/base2.ts', import.meta.url),
    'utf8',
  )
  const transpiler = new Bun.Transpiler({ loader: 'ts' })
  const base2JavaScript = transpiler.transformSync(base2Source)
  const helperSource = [
    ...INLINE_HELPER_NAMES,
    ...INLINE_DEPENDENCY_NAMES,
  ]
    .map((functionName) =>
      extractInlineFunctionSource(base2JavaScript, functionName),
    )
    .join('\n\n')
  const buildHelpers = new Function(
    `"use strict";\n${helperSource}\nreturn { stripReviewerPreamble, collectReviewerBlockers, getReviewerFinalizationVerdict, detectReviewerCrash }`,
  ) as InlineHelperFactory

  return buildHelpers()
}

describe('gate-reviewer helpers', () => {
  test('stripReviewerPreamble removes closed leading think blocks only', () => {
    expect(
      stripReviewerPreamble(
        '  <think>first</think>\n<think data-x="1">second</think>\nLOOKS_GOOD: ok  ',
      ),
    ).toBe('LOOKS_GOOD: ok')
    expect(stripReviewerPreamble('BLOCKING: keep this')).toBe(
      'BLOCKING: keep this',
    )
    expect(stripReviewerPreamble('<think>unterminated\nLOOKS_GOOD')).toBe(
      '<think>unterminated\nLOOKS_GOOD',
    )
  })

  test('collectReviewerBlockers returns structured blocking findings first', () => {
    expect(
      collectReviewerBlockers([
        'BLOCKING: fallback text',
        {
          type: 'json',
          value: [
            { verdict: 'BLOCKING', findings: ['Fix A', '  Fix B  ', 42] },
            { verdict: 'LOOKS_GOOD' },
            { verdict: 'BLOCKING', findings: [] },
          ],
        },
      ]),
    ).toEqual([
      'BLOCKING: Fix A',
      'BLOCKING: Fix B',
      'BLOCKING: (no findings provided)',
    ])
  })

  test('collectReviewerBlockers falls back to text line verdicts', () => {
    expect(
      collectReviewerBlockers({
        nested: [
          '<think>analysis</think>\nBLOCKING: fix the bug',
          'This sentence mentions BLOCKING but is not a line verdict.',
          '  blocking details are case-insensitive',
        ],
      }),
    ).toEqual([
      'BLOCKING: fix the bug',
      'blocking details are case-insensitive',
    ])
  })

  test('getReviewerFinalizationVerdict reads structured and text finalization verdicts', () => {
    expect(
      getReviewerFinalizationVerdict({
        type: 'json',
        value: [{ verdict: 'looks_good' }],
      }),
    ).toBe('LOOKS_GOOD')
    expect(
      getReviewerFinalizationVerdict({
        type: 'json',
        value: [{ verdict: 'NON_BLOCKING', findings: 'minor suggestion' }],
      }),
    ).toBe('NON_BLOCKING')
    expect(
      getReviewerFinalizationVerdict([
        '<think>analysis</think>\nLOOKS_GOOD: no issues',
      ]),
    ).toBe('LOOKS_GOOD')
    expect(
      getReviewerFinalizationVerdict('Reviewer gate passed ( NON_BLOCKING )'),
    ).toBe('NON_BLOCKING')
    expect(getReviewerFinalizationVerdict('BLOCKING: fix first')).toBe('')
  })

  // M6.3: coverage-adequacy in the reviewer verdict contract.
  test('collectReviewerBlockers surfaces missing coverage as BLOCKING', () => {
    expect(
      collectReviewerBlockers({
        type: 'json',
        value: [
          { verdict: 'NON_BLOCKING', findings: ['minor nit'], coverage: 'missing' },
        ],
      }),
    ).toEqual([
      'BLOCKING: test coverage missing for changed behavior (add a case to the relevant *.test.ts)',
    ])
  })

  test('collectReviewerBlockers surfaces both BLOCKING findings and missing coverage', () => {
    expect(
      collectReviewerBlockers({
        type: 'json',
        value: [
          { verdict: 'BLOCKING', findings: ['Fix A'], coverage: 'missing' },
        ],
      }),
    ).toEqual([
      'BLOCKING: Fix A',
      'BLOCKING: test coverage missing for changed behavior (add a case to the relevant *.test.ts)',
    ])
  })

  test('getReviewerFinalizationVerdict blocks finalization when coverage is missing', () => {
    expect(
      getReviewerFinalizationVerdict({
        type: 'json',
        value: [{ verdict: 'LOOKS_GOOD', coverage: 'missing' }],
      }),
    ).toBe('')
    expect(
      getReviewerFinalizationVerdict({
        type: 'json',
        value: [{ verdict: 'NON_BLOCKING', coverage: 'missing' }],
      }),
    ).toBe('')
  })

  test('getReviewerFinalizationVerdict finalizes when coverage is covered or n/a', () => {
    expect(
      getReviewerFinalizationVerdict({
        type: 'json',
        value: [{ verdict: 'LOOKS_GOOD', coverage: 'covered' }],
      }),
    ).toBe('LOOKS_GOOD')
    expect(
      getReviewerFinalizationVerdict({
        type: 'json',
        value: [{ verdict: 'NON_BLOCKING', coverage: 'n/a' }],
      }),
    ).toBe('NON_BLOCKING')
  })

  test('detectReviewerCrash identifies errorMessage / type:error / json-wrapped crashes and ignores normal results', () => {
    expect(detectReviewerCrash({ errorMessage: '  spawn failed  ' })).toBe(
      'spawn failed',
    )
    expect(
      detectReviewerCrash({ type: 'error', message: '  boom  ' }),
    ).toBe('boom')
    expect(detectReviewerCrash({ type: 'error', message: '' })).toBe(
      'reviewer agent reported an unspecified error',
    )
    expect(
      detectReviewerCrash({
        type: 'json',
        value: [{ nested: { errorMessage: 'inner crash' } }],
      }),
    ).toBe('inner crash')
    // Deeply nested but within the depth cap.
    expect(
      detectReviewerCrash({
        a: { b: { c: { d: { e: { errorMessage: 'deep' } } } } },
      }),
    ).toBe('deep')
    // Normal reviewer outputs (string, structured verdict, null, empty) → null.
    expect(detectReviewerCrash('LOOKS_GOOD: ok')).toBeNull()
    expect(
      detectReviewerCrash({
        type: 'json',
        value: [{ verdict: 'BLOCKING', findings: ['x'] }],
      }),
    ).toBeNull()
    expect(detectReviewerCrash(null)).toBeNull()
    expect(detectReviewerCrash({})).toBeNull()
    expect(detectReviewerCrash({ errorMessage: '   ' })).toBeNull()
  })

  test('detectReviewerCrash respects depth cap to avoid pathological recursion', () => {
    // Build a chain deeper than the cap (8). At depth >8, nested crash is ignored.
    let deep: any = { errorMessage: 'unreachable' }
    for (let i = 0; i < 12; i += 1) deep = { next: deep }
    expect(detectReviewerCrash(deep)).toBeNull()
  })

  test('exported helpers match inline base2 mirror behavior', () => {
    const inlineHelpers = loadInlineGateReviewerHelpers()

    const preambleInputs = [
      '  <think>first</think>\nLOOKS_GOOD: ok  ',
      '<think>first</think>\n<think data-x="1">second</think>\nNON_BLOCKING: ok',
      '<think>unterminated\nLOOKS_GOOD',
      'BLOCKING: no preamble',
      '   ',
    ]
    for (const input of preambleInputs) {
      expect(inlineHelpers.stripReviewerPreamble(input)).toBe(
        stripReviewerPreamble(input),
      )
    }

    const toolResults: unknown[] = [
      'BLOCKING: plain blocker',
      '<think>analysis</think>\nLOOKS_GOOD: plain approval',
      'Reviewer gate passed with LOOKS_GOOD',
      'Reviewer gate passed (NON_BLOCKING)',
      [
        {
          type: 'json',
          value: [{ verdict: 'BLOCKING', findings: ['Fix structured'] }],
        },
      ],
      {
        nested: {
          type: 'json',
          value: [{ verdict: 'NON_BLOCKING', findings: 'nit' }],
        },
      },
      {
        nested: [
          'This sentence mentions BLOCKING but is not a line verdict.',
          '  blocking details are case-insensitive',
        ],
      },
      [{ type: 'json', value: [{ verdict: 'BLOCKING' }] }],
      {
        type: 'json',
        value: [{ verdict: 'NON_BLOCKING', coverage: 'missing' }],
      },
      {
        type: 'json',
        value: [{ verdict: 'LOOKS_GOOD', coverage: 'covered' }],
      },
      null,
    ]

    const crashResults: unknown[] = [
      { errorMessage: 'spawn failed' },
      { type: 'error', message: 'boom' },
      { type: 'error', message: '' },
      { type: 'json', value: [{ nested: { errorMessage: 'inner crash' } }] },
      'LOOKS_GOOD: ok',
      { type: 'json', value: [{ verdict: 'BLOCKING', findings: ['x'] }] },
      null,
      {},
      { errorMessage: '   ' },
    ]

    for (const toolResult of [...toolResults, ...crashResults]) {
      expect(inlineHelpers.collectReviewerBlockers(toolResult)).toEqual(
        collectReviewerBlockers(toolResult),
      )
      expect(inlineHelpers.getReviewerFinalizationVerdict(toolResult)).toBe(
        getReviewerFinalizationVerdict(toolResult),
      )
      expect(inlineHelpers.detectReviewerCrash(toolResult)).toBe(
        detectReviewerCrash(toolResult),
      )
    }
  })
})
