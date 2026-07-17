import { describe, expect, it } from 'bun:test'

import { askUserParams } from '../tool/ask-user'

describe('ask_user input normalization', () => {
  it('truncates decorative headers instead of rejecting the question', () => {
    const parsed = askUserParams.inputSchema.parse({
      questions: [
        {
          question: 'Which plan-mode access policy should be used?',
          header: 'Plan mode basher access',
          options: [{ label: 'Allow' }, { label: 'Deny' }],
        },
      ],
    })

    expect(parsed.questions[0]?.header).toBe('Plan mode basher a')
  })
})
