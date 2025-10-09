import { useCallback, useRef } from 'react'

import { getCodebuffClient, formatToolOutput } from './codebuff-client'
import { logger } from './logger'
import { formatTimestamp } from './utils'

import type { ChatMessage } from './chat'
import type { ToolName } from '@codebuff/sdk'

const completionMessages = [
  'All changes have been applied successfully.',
  'Implementation complete. Ready for your next request.',
  'Done! All requested modifications are in place.',
  'Changes completed and verified.',
  'Finished! Everything is working as expected.',
  'All tasks completed successfully.',
  'Implementation finished. All systems go!',
  'Done! All updates have been applied.',
]

interface UseSendMessageOptions {
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>
  setFocusedAgentId: (id: string | null) => void
  setInputFocused: (focused: boolean) => void
  inputRef: React.MutableRefObject<any>
  setStreamingAgents: React.Dispatch<React.SetStateAction<Set<string>>>
  setCollapsedAgents: React.Dispatch<React.SetStateAction<Set<string>>>
  activeSubagentsRef: React.MutableRefObject<Set<string>>
  isChainInProgressRef: React.MutableRefObject<boolean>
  setIsWaitingForResponse: (waiting: boolean) => void
  startStreaming: () => void
  stopStreaming: () => void
  setIsStreaming: (streaming: boolean) => void
  setCanProcessQueue: (can: boolean) => void
  abortControllerRef: React.MutableRefObject<AbortController | null>
  completionCallbackRef: React.MutableRefObject<(() => void) | null>
}

export const useSendMessage = ({
  setMessages,
  setFocusedAgentId,
  setInputFocused,
  inputRef,
  setStreamingAgents,
  setCollapsedAgents,
  activeSubagentsRef,
  isChainInProgressRef,
  setIsWaitingForResponse,
  startStreaming,
  stopStreaming,
  setIsStreaming,
  setCanProcessQueue,
  abortControllerRef,
  completionCallbackRef,
}: UseSendMessageOptions) => {
  const previousRunStateRef = useRef<any>(null)

  const sendMessage = useCallback(
    async (content: string, onComplete?: () => void) => {
      if (onComplete) {
        completionCallbackRef.current = onComplete
      }

      const timestamp = formatTimestamp()
      const userMessage: ChatMessage = {
        id: `user-${Date.now()}`,
        variant: 'user',
        content,
        timestamp,
      }

      setMessages((prev) => {
        const newMessages = [...prev, userMessage]
        if (newMessages.length > 100) {
          return newMessages.slice(-100)
        }
        return newMessages
      })
      setFocusedAgentId(null)
      setInputFocused(true)
      inputRef.current?.focus()

      const client = getCodebuffClient()

      if (!client) {
        logger.info('No API client available, using mock mode')
        const aiMessageId = `ai-${Date.now()}-${Math.random().toString(16).slice(2)}`
        const aiMessage: ChatMessage = {
          id: aiMessageId,
          variant: 'ai',
          content: '',
          timestamp: formatTimestamp(),
        }

        setMessages((prev) => [...prev, aiMessage])

        const fullResponse = `I've reviewed your message. Let me help with that.\n\n## Analysis\n\nBased on your request, here are the key points:\n\n1. **Architecture**: The current structure is well-organized\n2. **Performance**: Consider adding memoization for expensive calculations\n3. **Testing**: Add unit tests using \`bun:test\`\n\n### Code Example\n\n\`\`\`typescript\n// Add this optimization\nconst memoized = useMemo(() => {\n  return expensiveCalculation(data)\n}, [data])\n\`\`\`\n\nThis approach will improve _performance_ while maintaining **code clarity**.`

        const tokens = fullResponse.split(/(\s+)/)
        let index = 0
        const interval = setInterval(() => {
          if (index >= tokens.length) {
            clearInterval(interval)
            stopStreaming()

            const completionMessageId = `ai-${Date.now()}-${Math.random().toString(16).slice(2)}`
            const completionMessage: ChatMessage = {
              id: completionMessageId,
              variant: 'ai',
              content:
                completionMessages[
                  Math.floor(Math.random() * completionMessages.length)
                ],
              timestamp: formatTimestamp(),
              isCompletion: true,
              credits: Math.floor(Math.random() * (230 - 18 + 1)) + 18,
            }
            setMessages((prev) => [...prev, completionMessage])
            return
          }

          const nextChunk = tokens[index]
          index++

          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === aiMessageId
                ? { ...msg, content: msg.content + nextChunk }
                : msg,
            ),
          )
        }, 28)

        logger.info('Starting mock response streaming')
        startStreaming()
        return
      }

      logger.info('Starting real API request', { prompt: content })

      const aiMessageId = `ai-${Date.now()}-${Math.random().toString(16).slice(2)}`
      const aiMessage: ChatMessage = {
        id: aiMessageId,
        variant: 'ai',
        content: '',
        blocks: [],
        timestamp: formatTimestamp(),
      }

      logger.info('Initiating SDK client.run()')
      setIsWaitingForResponse(true)
      setMessages((prev) => [...prev, aiMessage])
      setIsStreaming(true)
      setCanProcessQueue(false)
      isChainInProgressRef.current = true

      const startTime = Date.now()
      let hasReceivedContent = false
      let actualCredits: number | undefined = undefined

      const abortController = new AbortController()
      abortControllerRef.current = abortController

      try {
        const result = await client.run({
          agent: 'base',
          prompt: content,
          previousRun: previousRunStateRef.current,
          signal: abortController.signal,

          handleStreamChunk: (chunk: any) => {
            const isSubagentChunk = activeSubagentsRef.current.size > 0

            if (isSubagentChunk) {
              logger.info('Subagent chunk received', { chunk })
            }

            const keys = Object.keys(chunk)
              .filter((k) => !isNaN(Number(k)))
              .sort((a, b) => Number(a) - Number(b))
            const text = keys.map((k) => chunk[k]).join('')

            if (!text) return

            if (!hasReceivedContent) {
              hasReceivedContent = true
              setIsWaitingForResponse(false)
            }

            setMessages((prev) =>
              prev.map((msg) => {
                if (msg.id === aiMessageId) {
                  const blocks = msg.blocks || []
                  const lastBlock = blocks[blocks.length - 1]

                  if (lastBlock && lastBlock.type === 'text') {
                    const newContent = lastBlock.content + text
                    return {
                      ...msg,
                      blocks: [
                        ...blocks.slice(0, -1),
                        { type: 'text', content: newContent },
                      ],
                    }
                  } else {
                    return {
                      ...msg,
                      blocks: [...blocks, { type: 'text', content: text }],
                    }
                  }
                }
                return msg
              }),
            )
          },

          handleEvent: (event: any) => {
            logger.info('SDK Event received', { type: event.type, event })

            if (event.type === 'subagent-chunk') {
              logger.info('Subagent chunk received', {
                agentId: event.agentId,
                agentType: event.agentType,
                chunk: event.chunk,
              })
            }

            if (event.type === 'finish' && event.totalCost !== undefined) {
              actualCredits = event.totalCost
            }

            if (event.credits !== undefined) {
              actualCredits = event.credits
            }

            if (
              event.type === 'subagent_start' ||
              event.type === 'subagent-start'
            ) {
              if (event.agentId) {
                activeSubagentsRef.current.add(event.agentId)

                setMessages((prev) =>
                  prev.map((msg) => {
                    if (msg.id === aiMessageId) {
                      const blocks = msg.blocks || []
                      return {
                        ...msg,
                        blocks: [
                          ...blocks,
                          {
                            type: 'agent',
                            agentId: event.agentId,
                            agentName: event.agentType || 'Agent',
                            agentType: event.agentType || 'unknown',
                            content: '',
                            status: 'running',
                          },
                        ],
                      }
                    }
                    return msg
                  }),
                )

                setStreamingAgents((prev) => new Set(prev).add(event.agentId))
                setCollapsedAgents((prev) => new Set(prev).add(event.agentId))
              }
            } else if (
              event.type === 'subagent_finish' ||
              event.type === 'subagent-finish'
            ) {
              if (event.agentId) {
                activeSubagentsRef.current.delete(event.agentId)

                setMessages((prev) =>
                  prev.map((msg) => {
                    if (msg.id === aiMessageId && msg.blocks) {
                      const blocks = msg.blocks.map((block) => {
                        if (
                          block.type === 'agent' &&
                          block.agentId === event.agentId
                        ) {
                          return { ...block, status: 'complete' as const }
                        }
                        return block
                      })
                      return { ...msg, blocks }
                    }
                    return msg
                  }),
                )

                setStreamingAgents((prev) => {
                  const next = new Set(prev)
                  next.delete(event.agentId)
                  return next
                })
              }
            }

            if (event.type === 'subagent-chunk' && event.agentId) {
              setMessages((prev) =>
                prev.map((msg) => {
                  if (msg.id === aiMessageId && msg.blocks) {
                    const blocks = msg.blocks.map((block) => {
                      if (
                        block.type === 'agent' &&
                        block.agentId === event.agentId
                      ) {
                        const chunkText =
                          typeof event.chunk === 'string' ? event.chunk : ''
                        return { ...block, content: block.content + chunkText }
                      }
                      return block
                    })
                    return { ...msg, blocks }
                  }
                  return msg
                }),
              )
            }

            if (event.type === 'tool_call' && event.toolCallId) {
              const { toolCallId, toolName, input } = event

              const hiddenTools: ToolName[] = ['spawn_agent_inline', 'end_turn']
              if (hiddenTools.includes(toolName)) {
                return
              }

              setMessages((prev) =>
                prev.map((msg) => {
                  if (msg.id === aiMessageId) {
                    const blocks = msg.blocks || []
                    return {
                      ...msg,
                      blocks: [
                        ...blocks,
                        { type: 'tool', toolCallId, toolName, input },
                      ],
                    }
                  }
                  return msg
                }),
              )

              setStreamingAgents((prev) => new Set(prev).add(toolCallId))
              setCollapsedAgents((prev) => new Set(prev).add(toolCallId))
            } else if (event.type === 'tool_result' && event.toolCallId) {
              const { toolCallId } = event

              setMessages((prev) =>
                prev.map((msg) => {
                  if (msg.id === aiMessageId && msg.blocks) {
                    const blocks = msg.blocks.map((block) => {
                      if (
                        block.type === 'tool' &&
                        block.toolCallId === toolCallId
                      ) {
                        let output: string
                        if (event.error) {
                          output = `**Error:** ${typeof event.error === 'string' ? event.error : JSON.stringify(event.error)}`
                        } else if (block.toolName === 'run_terminal_command') {
                          const parsed = event.output?.[0]?.value
                          if (parsed?.stdout || parsed?.stderr) {
                            output = (parsed.stdout || '') + (parsed.stderr || '')
                          } else {
                            output = formatToolOutput(event.output)
                          }
                        } else {
                          output = formatToolOutput(event.output)
                        }
                        return { ...block, output }
                      }
                      return block
                    })
                    return { ...msg, blocks }
                  }
                  return msg
                }),
              )

              setStreamingAgents((prev) => {
                const next = new Set(prev)
                next.delete(toolCallId)
                return next
              })
            }
          },
        })

        logger.info('SDK client.run() completed successfully', {
          credits: actualCredits,
        })
        setIsStreaming(false)
        setCanProcessQueue(true)
        isChainInProgressRef.current = false
        setIsWaitingForResponse(false)

        if ((result as any)?.credits !== undefined) {
          actualCredits = (result as any).credits
        }

        const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(1)

        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === aiMessageId
              ? {
                  ...msg,
                  isComplete: true,
                  completionTime: `${elapsedTime}s`,
                  ...(actualCredits !== undefined && { credits: actualCredits }),
                }
              : msg,
          ),
        )

        previousRunStateRef.current = result

        if (completionCallbackRef.current) {
          const callback = completionCallbackRef.current
          completionCallbackRef.current = null
          callback()
        }
      } catch (error) {
        const isAborted = error instanceof Error && error.name === 'AbortError'

        logger.error('SDK client.run() failed', error)
        setIsStreaming(false)
        setCanProcessQueue(true)
        isChainInProgressRef.current = false
        setIsWaitingForResponse(false)

        if (isAborted) {
          setMessages((prev) =>
            prev.map((msg) => {
              if (msg.id === aiMessageId) {
                const blocks = msg.blocks || []
                const lastBlock = blocks[blocks.length - 1]

                if (lastBlock && lastBlock.type === 'text') {
                  return {
                    ...msg,
                    blocks: [
                      ...blocks.slice(0, -1),
                      {
                        type: 'text',
                        content: lastBlock.content + '\n\n[response interrupted]',
                      },
                    ],
                    isComplete: true,
                  }
                } else {
                  return {
                    ...msg,
                    blocks: [
                      ...blocks,
                      { type: 'text', content: '[response interrupted]' },
                    ],
                    isComplete: true,
                  }
                }
              }
              return msg
            }),
          )
        } else {
          const errorMessage =
            error instanceof Error ? error.message : 'Unknown error occurred'
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === aiMessageId
                ? {
                    ...msg,
                    content: msg.content + `\n\n**Error:** ${errorMessage}`,
                  }
                : msg,
            ),
          )

          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === aiMessageId ? { ...msg, isComplete: true } : msg,
            ),
          )
        }

        if (completionCallbackRef.current) {
          const callback = completionCallbackRef.current
          completionCallbackRef.current = null
          callback()
        }
      }
    },
    [
      setMessages,
      setFocusedAgentId,
      setInputFocused,
      inputRef,
      setStreamingAgents,
      setCollapsedAgents,
      activeSubagentsRef,
      isChainInProgressRef,
      setIsWaitingForResponse,
      startStreaming,
      stopStreaming,
      setIsStreaming,
      setCanProcessQueue,
      abortControllerRef,
      completionCallbackRef,
    ],
  )

  return { sendMessage }
}
