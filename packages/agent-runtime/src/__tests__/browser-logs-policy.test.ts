import { describe, expect, it, mock } from 'bun:test'

import { handleBrowserLogs } from '../tools/handlers/tool/browser-logs'

const browserTemplate = {
  id: 'browser-use',
  displayName: 'Browser Use',
} as any

describe('browser-use interaction policy', () => {
  it('blocks mutating actions under the default read-only policy', async () => {
    const requestClientToolCall = mock(async () => [])
    const result = await handleBrowserLogs({
      previousToolCallFinished: Promise.resolve(),
      toolCall: {
        toolName: 'browser_logs',
        toolCallId: 'tool-1',
        input: { type: 'click', selector: '#submit' },
      } as any,
      agentTemplate: browserTemplate,
      spawnParams: undefined,
      requestClientToolCall,
    } as any)

    expect(requestClientToolCall).not.toHaveBeenCalled()
    expect(result.output[0]).toMatchObject({
      type: 'json',
      value: { success: false, action: 'click' },
    })
  })

  it('forwards interactions only when explicitly authorized', async () => {
    const requestClientToolCall = mock(async () => [
      { type: 'json', value: { success: true, action: 'click', logs: [] } },
    ])
    await handleBrowserLogs({
      previousToolCallFinished: Promise.resolve(),
      toolCall: {
        toolName: 'browser_logs',
        toolCallId: 'tool-2',
        input: { type: 'click', selector: '#submit' },
      } as any,
      agentTemplate: browserTemplate,
      spawnParams: { interactionPolicy: 'allow-interactions' },
      requestClientToolCall,
    } as any)

    expect(requestClientToolCall).toHaveBeenCalledTimes(1)
  })

  it('blocks mutating actions nested inside diagnose steps', async () => {
    const requestClientToolCall = mock(async () => [])
    const result = await handleBrowserLogs({
      previousToolCallFinished: Promise.resolve(),
      toolCall: {
        toolName: 'browser_logs',
        toolCallId: 'tool-nested',
        input: {
          type: 'diagnose',
          steps: [
            { label: 'inspect', action: { type: 'snapshot' } },
            {
              label: 'mutate',
              action: { type: 'click', selector: '#submit' },
            },
          ],
        },
      } as any,
      agentTemplate: browserTemplate,
      spawnParams: undefined,
      requestClientToolCall,
    } as any)

    expect(requestClientToolCall).not.toHaveBeenCalled()
    expect(result.output[0]).toMatchObject({
      type: 'json',
      value: { success: false, action: 'diagnose' },
    })
  })
})
