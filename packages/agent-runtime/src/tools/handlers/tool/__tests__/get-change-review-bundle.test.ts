import { describe, expect, test } from 'bun:test'

import { handleGetChangeReviewBundle } from '../get-change-review-bundle'

describe('handleGetChangeReviewBundle', () => {
  test('proxies the requested diff bound', async () => {
    const result = await handleGetChangeReviewBundle({
      previousToolCallFinished: Promise.resolve(),
      toolCall: {
        toolName: 'get_change_review_bundle',
        toolCallId: 'review-tool',
        input: { max_chars: 12_000 },
      },
      requestClientToolCall: async (call: unknown) => {
        expect(call).toMatchObject({
          toolName: 'get_change_review_bundle',
          toolCallId: 'review-tool',
          input: { max_chars: 12_000 },
        })
        return [
          {
            type: 'json',
            value: {
              snapshotId: 'snapshot',
              repositoryId: 'repo-id',
              workspaceId: 'workspace-id',
              headCommit: 'head',
              status: '',
              files: [],
              diff: '',
              truncated: false,
              ownership: [],
              validation: [],
              findings: [],
            },
          },
        ] as never
      },
    } as never)
    expect(result.output[0]).toMatchObject({
      type: 'json',
      value: { snapshotId: 'snapshot' },
    })
  })
})
