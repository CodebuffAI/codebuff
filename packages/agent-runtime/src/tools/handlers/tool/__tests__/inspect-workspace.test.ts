import { describe, expect, test } from 'bun:test'

import { handleInspectWorkspace } from '../inspect-workspace'

describe('handleInspectWorkspace', () => {
  test('waits for prior work and proxies the exact client call', async () => {
    const events: string[] = []
    let release!: () => void
    const previousToolCallFinished = new Promise<void>((resolve) => {
      release = resolve
    })
    const requestClientToolCall = async (call: unknown) => {
      events.push('requested')
      expect(call).toMatchObject({
        toolName: 'inspect_workspace',
        toolCallId: 'tool-1',
        input: {},
      })
      return [
        {
          type: 'json',
          value: {
            repositoryId: 'repo-id',
            workspaceId: 'workspace-id',
            canonicalRoot: '/repo',
            repositoryRoot: '/repo',
            workingDirectory: '/repo',
            gitCommonDir: '/repo/.git',
            isLinkedWorktree: false,
            headCommit: 'abc',
            dirty: false,
            status: '## main',
          },
        },
      ] as never
    }
    const pending = handleInspectWorkspace({
      previousToolCallFinished,
      toolCall: {
        toolName: 'inspect_workspace',
        toolCallId: 'tool-1',
        input: {},
      },
      requestClientToolCall,
    } as never)
    await Promise.resolve()
    expect(events).toEqual([])
    release()
    expect((await pending).output).toEqual([
      {
        type: 'json',
        value: {
          repositoryId: 'repo-id',
          workspaceId: 'workspace-id',
          canonicalRoot: '/repo',
          repositoryRoot: '/repo',
          workingDirectory: '/repo',
          gitCommonDir: '/repo/.git',
          isLinkedWorktree: false,
          headCommit: 'abc',
          dirty: false,
          status: '## main',
        },
      },
    ])
  })
})
