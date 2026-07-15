import { describe, expect, test } from 'bun:test'

import { validatePlanTransition } from '../plan-execution-state'

function plan(
  tasks: Array<{
    id: string
    status: 'pending' | 'in_progress' | 'done' | 'cancelled'
    dependencies?: string[]
  }>,
): string {
  const mark = { pending: ' ', in_progress: '~', done: 'x', cancelled: '/' }
  return tasks
    .flatMap((task) => [
      `- [${mark[task.status]}] ${task.id} Task ${task.id}`,
      ...(task.dependencies?.length
        ? [`  - Depends on: ${task.dependencies.join(', ')}`]
        : []),
      '  - Acceptance: observable result',
      '  - Validate: bun test',
    ])
    .join('\n')
}

describe('validatePlanTransition', () => {
  test('rejects multiple in-progress tasks atomically', () => {
    const originalContent = plan([
      { id: 'P1.1', status: 'pending' },
      { id: 'P1.2', status: 'pending' },
    ])
    const nextContent = plan([
      { id: 'P1.1', status: 'in_progress' },
      { id: 'P1.2', status: 'in_progress' },
    ])

    const result = validatePlanTransition({
      originalContent,
      nextContent,
      updates: [
        { taskId: 'P1.1', status: 'in_progress' },
        { taskId: 'P1.2', status: 'in_progress' },
      ],
      unmatchedTasks: [],
      existingState: null,
    })

    expect(result.ok).toBe(false)
    expect(result.errors.join(' ')).toContain('Only one PLAN task')
  })

  test('rejects claiming or completing a task before its dependencies', () => {
    const originalContent = plan([
      { id: 'P1.1', status: 'pending' },
      { id: 'P1.2', status: 'pending', dependencies: ['P1.1'] },
    ])
    const claimed = validatePlanTransition({
      originalContent,
      nextContent: plan([
        { id: 'P1.1', status: 'pending' },
        { id: 'P1.2', status: 'in_progress', dependencies: ['P1.1'] },
      ]),
      updates: [{ taskId: 'P1.2', status: 'in_progress' }],
      unmatchedTasks: [],
      existingState: null,
    })
    const completed = validatePlanTransition({
      originalContent,
      nextContent: plan([
        { id: 'P1.1', status: 'pending' },
        { id: 'P1.2', status: 'done', dependencies: ['P1.1'] },
      ]),
      updates: [{ taskId: 'P1.2', status: 'done' }],
      unmatchedTasks: [],
      existingState: null,
      checkpoint: {
        taskId: 'P1.2',
        phase: 'validation',
        passed: true,
        receiptIds: ['validation-1'],
      },
    })

    expect(claimed.errors.join(' ')).toContain('dependencies complete')
    expect(completed.errors.join(' ')).toContain('dependencies complete')
  })

  test('requires validation receipts before moving a task to done', () => {
    const originalContent = plan([{ id: 'P1.1', status: 'in_progress' }])
    const nextContent = plan([{ id: 'P1.1', status: 'done' }])
    const withoutReceipt = validatePlanTransition({
      originalContent,
      nextContent,
      updates: [{ taskId: 'P1.1', status: 'done' }],
      unmatchedTasks: [],
      existingState: {
        schemaVersion: 2,
        slug: 'test',
        status: 'validating',
        currentTask: 'P1.1',
        revision: 1,
        checkpoint: {
          taskId: 'P1.1',
          phase: 'validation',
          passed: true,
          recordedAt: new Date(0).toISOString(),
        },
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString(),
      },
    })
    const withReceipt = validatePlanTransition({
      originalContent,
      nextContent,
      updates: [{ taskId: 'P1.1', status: 'done' }],
      unmatchedTasks: [],
      existingState: null,
      checkpoint: {
        taskId: 'P1.1',
        phase: 'validation',
        passed: true,
        receiptIds: ['validation-1'],
      },
    })

    expect(withoutReceipt.errors.join(' ')).toContain('receipt ID')
    expect(withReceipt).toMatchObject({
      ok: true,
      completedTaskIds: ['P1.1'],
    })
  })

  test('rejects an unmatched update and an invalid current-task pointer', () => {
    const content = plan([{ id: 'P1.1', status: 'pending' }])
    const result = validatePlanTransition({
      originalContent: content,
      nextContent: content,
      updates: [{ taskId: 'P1.9', status: 'in_progress' }],
      unmatchedTasks: ['P1.9'],
      currentTask: 'P1.1',
      existingState: null,
    })

    expect(result.ok).toBe(false)
    expect(result.errors.join(' ')).toContain('atomic')
    expect(result.errors.join(' ')).toContain('sole in-progress task')
  })
})
