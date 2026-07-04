import { describe, expect, it } from 'bun:test'

import { handleGitBranch } from '../git-branch'

import type {
  ClientToolCall,
  CodebuffToolCall,
  CodebuffToolOutput,
} from '@codebuff/common/tools/list'

describe('handleGitBranch', () => {
  it('forwards branch_name, switch, and allow_dirty to the client tool call', async () => {
    const toolCall: CodebuffToolCall<'git_branch'> = {
      toolName: 'git_branch',
      toolCallId: 'tool-call-branch-1',
      input: {
        branch_name: 'feat/my-feature',
        switch: false,
        allow_dirty: true,
      },
    }
    let forwardedToolCall: ClientToolCall<'git_branch'> | undefined

    const { output } = await handleGitBranch({
      previousToolCallFinished: Promise.resolve(),
      toolCall,
      requestClientToolCall: async (
        clientToolCall: ClientToolCall<'git_branch'>,
      ): Promise<CodebuffToolOutput<'git_branch'>> => {
        forwardedToolCall = clientToolCall
        return [
          {
            type: 'json',
            value: {
              branch: clientToolCall.input.branch_name,
              created: true,
              switched: clientToolCall.input.switch ?? true,
            },
          },
        ] satisfies CodebuffToolOutput<'git_branch'>
      },
    } as unknown as Parameters<typeof handleGitBranch>[0])

    expect(forwardedToolCall).toEqual({
      toolName: 'git_branch',
      toolCallId: 'tool-call-branch-1',
      input: {
        branch_name: 'feat/my-feature',
        switch: false,
        allow_dirty: true,
      },
    })
    expect(output[0].type).toBe('json')
  })

  it('sets toolName to "git_branch" and copies the toolCallId', async () => {
    const toolCall: CodebuffToolCall<'git_branch'> = {
      toolName: 'git_branch',
      toolCallId: 'abc-123',
      input: {
        branch_name: 'feat/x',
      },
    }
    let forwardedToolCall: ClientToolCall<'git_branch'> | undefined

    await handleGitBranch({
      previousToolCallFinished: Promise.resolve(),
      toolCall,
      requestClientToolCall: async (
        clientToolCall: ClientToolCall<'git_branch'>,
      ) => {
        forwardedToolCall = clientToolCall
        return [
          {
            type: 'json',
            value: { branch: 'feat/x', created: true, switched: true },
          },
        ] satisfies CodebuffToolOutput<'git_branch'>
      },
    } as unknown as Parameters<typeof handleGitBranch>[0])

    expect(forwardedToolCall?.toolName).toBe('git_branch')
    expect(forwardedToolCall?.toolCallId).toBe('abc-123')
  })

  it('awaits previousToolCallFinished before invoking requestClientToolCall', async () => {
    let resolved = false
    let clientCalled = false
    const toolCall: CodebuffToolCall<'git_branch'> = {
      toolName: 'git_branch',
      toolCallId: 'tc-ordered',
      input: { branch_name: 'feat/y' },
    }

    const previousToolCallFinished = new Promise<void>((resolve) => {
      setTimeout(() => {
        resolved = true
        resolve()
      }, 0)
    })

    await handleGitBranch({
      previousToolCallFinished,
      toolCall,
      requestClientToolCall: async () => {
        clientCalled = true
        return [
          {
            type: 'json',
            value: { branch: 'feat/y', created: true, switched: true },
          },
        ] satisfies CodebuffToolOutput<'git_branch'>
      },
    } as unknown as Parameters<typeof handleGitBranch>[0])

    expect(resolved).toBe(true)
    expect(clientCalled).toBe(true)
  })

  it('returns { output } wrapping the requestClientToolCall result', async () => {
    const toolCall: CodebuffToolCall<'git_branch'> = {
      toolName: 'git_branch',
      toolCallId: 'tc-return',
      input: { branch_name: 'feat/z' },
    }
    const result: CodebuffToolOutput<'git_branch'> = [
      {
        type: 'json',
        value: {
          branch: 'feat/z',
          created: false,
          switched: true,
          previousBranch: 'main',
        },
      },
    ]

    const { output } = await handleGitBranch({
      previousToolCallFinished: Promise.resolve(),
      toolCall,
      requestClientToolCall: async () => result,
    } as unknown as Parameters<typeof handleGitBranch>[0])

    expect(output).toBe(result)
  })
})
