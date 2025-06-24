import { SessionState } from 'common/types/session-state'
import { toContentString } from 'common/util/messages'
import { WebSocket } from 'ws'
import { loopMainPrompt } from './loop-main-prompt'
import { requestRelevantFiles } from './find-files/request-files-prompt'
import { getSearchSystemPrompt } from './system-prompt/search-system-prompt'
import { requestFiles } from './websockets/websocket-action'
import { renderReadFilesResult } from './util/parse-tool-call-xml'

export async function research(
  ws: WebSocket,
  prompts: string[],
  initialSessionState: SessionState,
  options: {
    userId: string | undefined
    clientSessionId: string
    fingerprintId: string
    promptId: string
  }
): Promise<string[]> {
  const { userId, clientSessionId, fingerprintId, promptId } = options
  const maxIterations = 10
  const maxPrompts = 10
  const { fileContext } = initialSessionState
  const researchPromises = prompts.slice(0, maxPrompts).map(async (prompt) => {
    const relevantFiles = await requestRelevantFiles(
      {
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
        system: getSearchSystemPrompt(fileContext, 'lite', 0, {
          agentStepId: 'research',
          clientSessionId,
          fingerprintId,
          userInputId: promptId,
          userId,
        }),
      },
      fileContext,
      null,
      'research',
      clientSessionId,
      fingerprintId,
      promptId,
      userId,
      'lite',
      undefined
    )
    const files = relevantFiles ? await requestFiles(ws, relevantFiles) : {}
    const filteredFiles = Object.entries(files)
      .filter(([_, content]) => content !== null)
      .map(([path, content]) => ({ path, content: content! }))

    const messages = [
      {
        role: 'user' as const,
        content: prompt,
      },
      {
        role: 'user' as const,
        content: `Here are some potentially relevant files. Make sure to tell me which of these file paths I should read to get a complete picture.: ${renderReadFilesResult(filteredFiles, fileContext.tokenCallers ?? {})}`,
      },
    ]

    // Each research prompt runs in 'lite' mode and can only use read-only tools.
    const researchSessionState: SessionState = {
      ...{
        ...initialSessionState,
        mainAgentState: {
          ...initialSessionState.mainAgentState,
          stepsRemaining: maxIterations,
          messageHistory: messages,
        },
      },
    }

    const action = {
      type: 'prompt' as const,
      prompt: undefined,
      sessionState: researchSessionState,
      costMode: 'lite' as const,
      toolResults: [],
      fingerprintId,
      promptId,
    }

    return await loopMainPrompt(ws, action, {
      userId,
      clientSessionId,
      onResponseChunk: () => {
        /* We can ignore chunks for now */
      },
      selectedModel: undefined, // Use default model for lite mode
      readOnlyMode: true, // readOnlyMode = true
      maxIterations,
    })
  })

  const results = await Promise.all(researchPromises)
  // We'll return the final message from each research agent.
  return results.map((result) =>
    result.sessionState.mainAgentState.messageHistory
      .filter((m) => m.role === 'assistant')
      .map((m) => `Research agent: ${toContentString(m)}`)
      .join('\n\n')
  )
}
