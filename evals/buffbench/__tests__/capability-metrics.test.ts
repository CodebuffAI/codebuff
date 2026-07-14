import { describe, expect, test } from 'bun:test'

import { aggregateCapabilityMetrics } from '../types'

describe('aggregateCapabilityMetrics', () => {
  test('aggregates independently by model, language, task, and role', () => {
    expect(
      aggregateCapabilityMetrics([
        {
          model: 'a',
          language: 'rust',
          taskType: 'bug-fix',
          agentRole: 'editor',
          score: 80,
        },
        {
          model: 'a',
          language: 'rust',
          taskType: 'bug-fix',
          agentRole: 'editor',
          score: 100,
        },
        {
          model: 'a',
          language: 'python',
          taskType: 'bug-fix',
          agentRole: 'editor',
          score: 70,
        },
      ]),
    ).toEqual([
      {
        model: 'a',
        language: 'rust',
        taskType: 'bug-fix',
        agentRole: 'editor',
        score: 90,
        sampleSize: 2,
      },
      {
        model: 'a',
        language: 'python',
        taskType: 'bug-fix',
        agentRole: 'editor',
        score: 70,
        sampleSize: 1,
      },
    ])
  })
})
