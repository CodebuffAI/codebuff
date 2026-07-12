import { describe, expect, test } from 'bun:test'

import { computeRetrievalFlowMetrics } from '../retrieval-flow-metrics'

import type { PrintModeEvent } from '@codebuff/common/types/print-mode'

describe('computeRetrievalFlowMetrics', () => {
  test('measures query hits, successful reads, false leads, and read-before-edit', () => {
    const trace: PrintModeEvent[] = [
      {
        type: 'tool_call',
        toolCallId: 'q1',
        toolName: 'query_index',
        input: { query: 'auth' },
      },
      {
        type: 'tool_result',
        toolCallId: 'q1',
        toolName: 'query_index',
        output: [
          {
            type: 'json',
            value: {
              results: [{ path: 'src/noise.ts' }, { path: 'src/auth.ts' }],
            },
          },
        ],
      },
      {
        type: 'tool_call',
        toolCallId: 'r1',
        toolName: 'read_files',
        input: { paths: ['src/noise.ts', 'src/auth.ts'] },
      },
      {
        type: 'tool_result',
        toolCallId: 'r1',
        toolName: 'read_files',
        output: [
          {
            type: 'json',
            value: {
              files: [
                { path: 'src/noise.ts', status: 'ok', content: 'noise' },
                { path: 'src/auth.ts', status: 'ok', content: 'auth' },
              ],
            },
          },
        ],
      },
      {
        type: 'tool_call',
        toolCallId: 'e1',
        toolName: 'str_replace',
        input: { path: 'src/auth.ts' },
      },
    ]

    expect(
      computeRetrievalFlowMetrics({
        trace,
        expectedPaths: ['src/auth.ts'],
      }),
    ).toEqual({
      queryCallCount: 1,
      queryResultPaths: ['src/noise.ts', 'src/auth.ts'],
      successfulReadPaths: ['src/noise.ts', 'src/auth.ts'],
      relevantReadPaths: ['src/auth.ts'],
      irrelevantReadPaths: ['src/noise.ts'],
      queryHitAtK: true,
      queryResultToReadConversion: 1,
      irrelevantReadRatio: 0.5,
      toolCallsToFirstRelevantRead: 2,
      relevantReadBeforeFirstEdit: true,
    })
  })

  test('reports an edit before any relevant read', () => {
    const trace: PrintModeEvent[] = [
      {
        type: 'tool_call',
        toolCallId: 'e1',
        toolName: 'write_file',
        input: { path: 'src/auth.ts' },
      },
    ]

    expect(
      computeRetrievalFlowMetrics({
        trace,
        expectedPaths: ['src/auth.ts'],
      }).relevantReadBeforeFirstEdit,
    ).toBe(false)
  })
})
