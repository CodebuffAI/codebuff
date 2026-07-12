import { describe, expect, it } from 'bun:test'

import { applySmartPatchParams } from '../apply-smart-patch'

describe('apply_smart_patch output schema', () => {
  it('[ABI-M06] requires a typed validator status and validator identity', () => {
    const result = applySmartPatchParams.outputSchema.safeParse([
      {
        type: 'json',
        value: {
          file: 'src/example.ts',
          applied: true,
          preflightPassed: true,
          validatorStatus: 'passed',
          validatorIdentity: 'bun-transpiler:ts',
          message: 'Applied.',
        },
      },
    ])

    expect(result.success).toBe(true)
  })

  it('[ABI-M06] rejects legacy smart-patch results that overstate validation without identity', () => {
    const result = applySmartPatchParams.outputSchema.safeParse([
      {
        type: 'json',
        value: {
          file: 'src/example.ts',
          applied: true,
          preflightPassed: true,
          message: 'Applied.',
        },
      },
    ])

    expect(result.success).toBe(false)
  })
})
