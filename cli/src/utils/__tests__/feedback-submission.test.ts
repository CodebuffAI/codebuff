import { describe, expect, test } from 'bun:test'

import { resolveFeedbackSubmission } from '../feedback-submission'

describe('resolveFeedbackSubmission', () => {
  test('settles and marks as current when ids match', () => {
    expect(resolveFeedbackSubmission('id-1', 'id-1')).toEqual({
      isCurrentSubmission: true,
      shouldSettleSubmission: true,
    })
  })

  test('settles non-current submission when feedback was closed mid-request', () => {
    expect(resolveFeedbackSubmission(null, 'id-1')).toEqual({
      isCurrentSubmission: false,
      shouldSettleSubmission: true,
    })
  })

  test('ignores stale submission when a newer feedback session is active', () => {
    expect(resolveFeedbackSubmission('new-id', 'old-id')).toEqual({
      isCurrentSubmission: false,
      shouldSettleSubmission: false,
    })
  })
})
