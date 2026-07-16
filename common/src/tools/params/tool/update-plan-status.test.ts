import { describe, expect, it } from 'bun:test'

import { updatePlanStatusParams } from './update-plan-status'

describe('updatePlanStatusParams', () => {
  it('accepts and normalizes an empty checkpoint receiptIds array', () => {
    const result = updatePlanStatusParams.inputSchema.safeParse({
      path: '.agents/sessions/example/PLAN.md',
      checkpoint: {
        taskId: 'P1-T1',
        phase: 'validation',
        passed: true,
        receiptIds: [],
      },
    })

    expect(result.success).toBe(true)
    if (!result.success) return

    expect(result.data.checkpoint?.receiptIds).toBeUndefined()
  })

  it('rejects empty checkpoint receipt IDs', () => {
    const result = updatePlanStatusParams.inputSchema.safeParse({
      path: '.agents/sessions/example/PLAN.md',
      checkpoint: {
        taskId: 'P1-T1',
        phase: 'validation',
        passed: true,
        receiptIds: [''],
      },
    })

    expect(result.success).toBe(false)
  })
})
