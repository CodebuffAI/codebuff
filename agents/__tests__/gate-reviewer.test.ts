import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'bun:test'

import {
  collectReviewerBlockers,
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
}

type GateReviewerFunctionName = keyof GateReviewerHelpers
type InlineHelperFactory = () => GateReviewerHelpers

const INLINE_HELPER_NAMES: GateReviewerFunctionName[] = [
  'stripReviewerPreamble',
  'collectReviewerBlockers',
  'getReviewerFinalizationVerdict',
]

const INLINE_DEPENDENCY_NAMES = [
  'collectStructuredReviewerOutputs',
  'visitForStructuredVerdict',
  'hasReviewerLineVerdict',
  'collectStrings',
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
    `"use strict";\n${helperSource}\nreturn { stripReviewerPreamble, collectReviewerBlockers, getReviewerFinalizationVerdict }`,
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
      null,
    ]

    for (const toolResult of toolResults) {
      expect(inlineHelpers.collectReviewerBlockers(toolResult)).toEqual(
        collectReviewerBlockers(toolResult),
      )
      expect(inlineHelpers.getReviewerFinalizationVerdict(toolResult)).toBe(
        getReviewerFinalizationVerdict(toolResult),
      )
    }
  })
})
