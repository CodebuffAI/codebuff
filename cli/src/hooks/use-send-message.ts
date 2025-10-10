import { useCallback, useRef } from 'react'

import { getCodebuffClient, formatToolOutput } from '../utils/codebuff-client'
import { formatTimestamp } from '../utils/helpers'
import { logger } from '../utils/logger'

import type { ChatMessage, ContentBlock } from '../chat'
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
}: UseSendMessageOptions) => {
  const previousRunStateRef = useRef<any>(null)
  const spawnAgentsMapRef = useRef<
    Map<string, { index: number; agentType: string }>
  >(new Map())
  const toolCallToAgentIdsRef = useRef<Map<string, string[]>>(new Map())
  const subagentBuffersRef = useRef<
    Map<string, { buffer: string; insideToolCall: boolean }>
  >(new Map())
  const subagentToolCallsRef = useRef<
    Map<string, { agentId: string; tempToolCallId: string }>
  >(new Map())

  const sendMessage = useCallback(
    async (content: string) => {
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

      const updateAgentContent = (
        agentId: string,
        update:
          | { type: 'text'; content: string }
          | Extract<ContentBlock, { type: 'tool' }>,
      ) => {
        setMessages((prev) =>
          prev.map((msg) => {
            if (msg.id === aiMessageId && msg.blocks) {
              const newBlocks = msg.blocks.map((block) => {
                if (block.type === 'agent' && block.agentId === agentId) {
                  const agentBlocks: ContentBlock[] = block.blocks
                    ? [...block.blocks]
                    : []
                  if (update.type === 'text' && update.content) {
                    const lastBlock = agentBlocks[agentBlocks.length - 1]
                    if (lastBlock && lastBlock.type === 'text') {
                      const updatedLastBlock: ContentBlock = {
                        ...lastBlock,
                        content: lastBlock.content + update.content,
                      }
                      return {
                        ...block,
                        blocks: [...agentBlocks.slice(0, -1), updatedLastBlock],
                      }
                    } else {
                      return { ...block, blocks: [...agentBlocks, update] }
                    }
                  } else if (update.type === 'tool') {
                    return { ...block, blocks: [...agentBlocks, update] }
                  }
                }
                return block
              })
              return { ...msg, blocks: newBlocks }
            }
            return msg
          }),
        )
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
            const keys = Object.keys(chunk)
              .filter((k) => !isNaN(Number(k)))
              .sort((a, b) => Number(a) - Number(b))
            let text = keys.map((k) => chunk[k]).join('')

            text = text.replace(
              /<codebuff_tool_call>[\s\S]*?<\/codebuff_tool_call>/g,
              '',
            )

            if (!text) return

            if (!hasReceivedContent) {
              hasReceivedContent = true
              setIsWaitingForResponse(false)
            }

            logger.info('setMessages: handleStreamChunk (main agent text)', {
              text,
            })
            setMessages((prev) =>
              prev.map((msg) => {
                if (msg.id !== aiMessageId) {
                  return msg
                }

                const blocks: ContentBlock[] = msg.blocks
                  ? [...msg.blocks]
                  : []
                const lastBlock = blocks[blocks.length - 1]

                if (lastBlock && lastBlock.type === 'text') {
                  const newContent = lastBlock.content + text
                  const updatedTextBlock: ContentBlock = {
                    type: 'text',
                    content: newContent,
                  }
                  return {
                    ...msg,
                    blocks: [
                      ...blocks.slice(0, -1),
                      updatedTextBlock,
                    ],
                  }
                }

                const newTextBlock: ContentBlock = {
                  type: 'text',
                  content: text,
                }
                return {
                  ...msg,
                  blocks: [...blocks, newTextBlock],
                }
              }),
            )
          },

          handleEvent: (event: any) => {
            logger.info('SDK Event received (raw)', { type: event.type, event })

            if (event.type === 'subagent-chunk') {
              const { agentId, chunk } = event

              const bufferState = subagentBuffersRef.current.get(agentId) || {
                buffer: '',
                insideToolCall: false,
              }
              subagentBuffersRef.current.set(agentId, bufferState)

              bufferState.buffer += chunk

              const processBuffer = () => {
                let processed = false
                if (
                  !bufferState.insideToolCall &&
                  bufferState.buffer.includes('<codebuff_tool_call>')
                ) {
                  const openTagIndex = bufferState.buffer.indexOf(
                    '<codebuff_tool_call>',
                  )
                  const text = bufferState.buffer.substring(0, openTagIndex)
                  if (text) {
                    updateAgentContent(agentId, { type: 'text', content: text })
                  }
                  bufferState.insideToolCall = true
                  bufferState.buffer = bufferState.buffer.substring(
                    openTagIndex + '<codebuff_tool_call>'.length,
                  )
                  processed = true
                } else if (
                  bufferState.insideToolCall &&
                  bufferState.buffer.includes('</codebuff_tool_call>')
                ) {
                  const closeTagIndex = bufferState.buffer.indexOf(
                    '</codebuff_tool_call>',
                  )
                  // Skip the tool call content - we'll handle it via tool_call event
                  bufferState.insideToolCall = false
                  bufferState.buffer = bufferState.buffer.substring(
                    closeTagIndex + '</codebuff_tool_call>'.length,
                  )
                  processed = true
                } else if (
                  !bufferState.insideToolCall &&
                  bufferState.buffer.length > 50
                ) {
                  const safeToOutput = bufferState.buffer.substring(
                    0,
                    bufferState.buffer.length - 50,
                  )
                  updateAgentContent(agentId, {
                    type: 'text',
                    content: safeToOutput,
                  })
                  bufferState.buffer = bufferState.buffer.substring(
                    bufferState.buffer.length - 50,
                  )
                }

                if (processed) {
                  processBuffer()
                }
              }
              processBuffer()
              return
            }

            if (event.type === 'text') {
              let text = event.text.replace(
                /<codebuff_tool_call>[\s\S]*?<\/codebuff_tool_call>/g,
                '',
              )

              if (!text) return

              if (event.agentId) {
                logger.info('setMessages: text event with agentId', {
                  agentId: event.agentId,
                  textPreview: text.slice(0, 100),
                })
                setMessages((prev) =>
                  prev.map((msg) => {
                    if (msg.id === aiMessageId && msg.blocks) {
                      const blocks = msg.blocks.map((block) => {
                        if (
                          block.type === 'agent' &&
                          block.agentId === event.agentId
                        ) {
                          return { ...block, content: block.content + text }
                        }
                        return block
                      })
                      return { ...msg, blocks }
                    }
                    return msg
                  }),
                )
                return
              } else {
                logger.info('setMessages: text event without agentId', {
                  textPreview: text.slice(0, 100),
                })
                setMessages((prev) =>
                  prev.map((msg) => {
                    if (msg.id !== aiMessageId) {
                      return msg
                    }

                    const blocks: ContentBlock[] = msg.blocks
                      ? [...msg.blocks]
                      : []
                    const lastBlock = blocks[blocks.length - 1]

                    if (lastBlock && lastBlock.type === 'text') {
                      const updatedTextBlock: ContentBlock = {
                        type: 'text',
                        content: lastBlock.content + text,
                      }
                      return {
                        ...msg,
                        blocks: [
                          ...blocks.slice(0, -1),
                          updatedTextBlock,
                        ],
                      }
                    }

                    const newTextBlock: ContentBlock = {
                      type: 'text',
                      content: text,
                    }
                    return {
                      ...msg,
                      blocks: [...blocks, newTextBlock],
                    }
                  }),
                )
                return
              }
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
                logger.info('subagent_start event', {
                  agentId: event.agentId,
                  agentType: event.agentType,
                })
                activeSubagentsRef.current.add(event.agentId)

                let foundExistingBlock = false
                for (const [
                  tempId,
                  info,
                ] of spawnAgentsMapRef.current.entries()) {
                  const eventType = event.agentType || ''
                  const storedType = info.agentType || ''
                  if (eventType === storedType) {
                    logger.info(
                      'setMessages: matching spawn_agents block found',
                      {
                        tempId,
                        realAgentId: event.agentId,
                        agentType: eventType,
                      },
                    )
                    setMessages((prev) =>
                      prev.map((msg) => {
                        if (msg.id === aiMessageId && msg.blocks) {
                          const blocks = msg.blocks.map((block) => {
                            if (
                              block.type === 'agent' &&
                              block.agentId === tempId
                            ) {
                              return { ...block, agentId: event.agentId }
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
                      next.delete(tempId)
                      next.add(event.agentId)
                      return next
                    })
                    setCollapsedAgents((prev) => {
                      const next = new Set(prev)
                      next.delete(tempId)
                      next.add(event.agentId)
                      return next
                    })

                    spawnAgentsMapRef.current.delete(tempId)
                    foundExistingBlock = true
                    break
                  }
                }

                if (!foundExistingBlock) {
                  logger.info(
                    'setMessages: creating new agent block (no spawn_agents match)',
                    {
                      agentId: event.agentId,
                      agentType: event.agentType,
                    },
                  )
                  setMessages((prev) =>
                    prev.map((msg) => {
                      if (msg.id !== aiMessageId) {
                        return msg
                      }

                      const blocks: ContentBlock[] = msg.blocks
                        ? [...msg.blocks]
                        : []
                      const newAgentBlock: ContentBlock = {
                        type: 'agent',
                        agentId: event.agentId,
                        agentName: event.agentType || 'Agent',
                        agentType: event.agentType || 'unknown',
                        content: '',
                        status: 'running' as const,
                        blocks: [] as ContentBlock[],
                        initialPrompt: '',
                      }

                      return {
                        ...msg,
                        blocks: [...blocks, newAgentBlock],
                      }
                    }),
                  )

                  setStreamingAgents((prev) => new Set(prev).add(event.agentId))
                  setCollapsedAgents((prev) => new Set(prev).add(event.agentId))
                }
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

            if (event.type === 'tool_call' && event.toolCallId) {
              const { toolCallId, toolName, input, agentId } = event

              if (toolName === 'spawn_agents' && input?.agents) {
                const agents = Array.isArray(input.agents) ? input.agents : []

                agents.forEach((agent: any, index: number) => {
                  const tempAgentId = `${toolCallId}-${index}`
                  spawnAgentsMapRef.current.set(tempAgentId, {
                    index,
                    agentType: agent.agent_type || 'unknown',
                  })
                })

                logger.info('setMessages: spawn_agents tool call', {
                  toolCallId,
                  agentCount: agents.length,
                  agentTypes: agents.map((a: any) => a.agent_type),
                })

                setMessages((prev) =>
                  prev.map((msg) => {
                    if (msg.id !== aiMessageId) {
                      return msg
                    }

                    const existingBlocks: ContentBlock[] = msg.blocks
                      ? [...msg.blocks]
                      : []

                    const newAgentBlocks: ContentBlock[] = agents.map(
                      (agent: any, index: number) => ({
                        type: 'agent',
                        agentId: `${toolCallId}-${index}`,
                        agentName: agent.agent_type || 'Agent',
                        agentType: agent.agent_type || 'unknown',
                        content: agent.prompt || '',
                        status: 'running' as const,
                        blocks: [] as ContentBlock[],
                        initialPrompt: agent.prompt || '',
                      }),
                    )

                    return {
                      ...msg,
                      blocks: [...existingBlocks, ...newAgentBlocks],
                    }
                  }),
                )

                agents.forEach((_: any, index: number) => {
                  const agentId = `${toolCallId}-${index}`
                  setStreamingAgents((prev) => new Set(prev).add(agentId))
                  setCollapsedAgents((prev) => new Set(prev).add(agentId))
                })

                return
              }

              const hiddenTools: ToolName[] = [
                'spawn_agent_inline',
                'end_turn',
                'spawn_agents',
              ]
              if (hiddenTools.includes(toolName)) {
                return
              }

              logger.info('setMessages: tool_call event', {
                toolName,
                toolCallId,
                agentId: agentId || 'none',
              })

              // If this tool call belongs to a subagent, add it to that agent's blocks
              if (agentId) {
                logger.info('setMessages: tool_call for subagent', {
                  agentId,
                  toolName,
                  toolCallId,
                })

                setMessages((prev) =>
                  prev.map((msg) => {
                    if (msg.id !== aiMessageId || !msg.blocks) {
                      return msg
                    }

                    const updatedBlocks: ContentBlock[] = msg.blocks.map(
                      (block) => {
                        if (block.type !== 'agent' || block.agentId !== agentId) {
                          return block
                        }

                        const agentBlocks: ContentBlock[] = block.blocks
                          ? [...block.blocks]
                          : []
                        const newToolBlock: ContentBlock = {
                          type: 'tool',
                          toolCallId,
                          toolName,
                          input,
                        }

                        return {
                          ...block,
                          blocks: [...agentBlocks, newToolBlock],
                        }
                      },
                    )

                    return { ...msg, blocks: updatedBlocks }
                  }),
                )
              } else {
                // Top-level tool call
                setMessages((prev) =>
                  prev.map((msg) => {
                    if (msg.id !== aiMessageId) {
                      return msg
                    }

                    const existingBlocks: ContentBlock[] = msg.blocks
                      ? [...msg.blocks]
                      : []
                    const newToolBlock: ContentBlock = {
                      type: 'tool',
                      toolCallId,
                      toolName,
                      input,
                    }

                    return {
                      ...msg,
                      blocks: [...existingBlocks, newToolBlock],
                    }
                  }),
                )
              }

              setStreamingAgents((prev) => new Set(prev).add(toolCallId))
              setCollapsedAgents((prev) => new Set(prev).add(toolCallId))
            } else if (event.type === 'tool_result' && event.toolCallId) {
              const { toolCallId } = event

              // Check if this is a spawn_agents result
              // The structure is: output[0].value = [{ agentName, agentType, value }]
              const firstOutputValue = event.output?.[0]?.value
              const isSpawnAgentsResult = Array.isArray(firstOutputValue) &&
                firstOutputValue.some((v: any) => v?.agentName || v?.agentType)

              logger.info('setMessages: tool_result event', {
                toolCallId,
                isSpawnAgentsResult,
                firstOutputValue: firstOutputValue ? 'array' : 'not array',
              })

              if (isSpawnAgentsResult && Array.isArray(firstOutputValue)) {
                setMessages((prev) =>
                  prev.map((msg) => {
                    if (msg.id === aiMessageId && msg.blocks) {
                      const blocks = msg.blocks.map((block, blockIndex) => {
                        if (
                          block.type === 'agent' &&
                          block.agentId.startsWith(toolCallId)
                        ) {
                          const agentIndex = parseInt(
                            block.agentId.split('-').pop() || '0',
                            10,
                          )
                          const result = firstOutputValue[agentIndex]

                          if (result?.value) {
                            let content: string
                            if (typeof result.value === 'string') {
                              content = result.value
                            } else if (result.value.value && typeof result.value.value === 'string') {
                              // Handle nested value structure like { type: "lastMessage", value: "..." }
                              content = result.value.value
                            } else if (result.value.message) {
                              content = result.value.message
                            } else {
                              content = formatToolOutput([result])
                            }

                            logger.info('setMessages: spawn_agents result processed', {
                              agentId: block.agentId,
                              contentLength: content.length,
                              contentPreview: content.substring(0, 100),
                            })

                            const resultTextBlock: ContentBlock = {
                              type: 'text',
                              content,
                            }
                            return {
                              ...block,
                              blocks: [resultTextBlock],
                              status: 'complete' as const,
                            }
                          }
                        }
                        return block
                      })
                      return { ...msg, blocks }
                    }
                    return msg
                  }),
                )

                firstOutputValue.forEach((_: any, index: number) => {
                  const agentId = `${toolCallId}-${index}`
                  setStreamingAgents((prev) => {
                    const next = new Set(prev)
                    next.delete(agentId)
                    return next
                  })
                })
                return
              }

              const updateToolBlock = (
                blocks: ContentBlock[],
              ): ContentBlock[] => {
                return blocks.map((block) => {
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
                  } else if (block.type === 'agent' && block.blocks) {
                    return { ...block, blocks: updateToolBlock(block.blocks) }
                  }
                  return block
                })
              }

              setMessages((prev) =>
                prev.map((msg) => {
                  if (msg.id === aiMessageId && msg.blocks) {
                    return { ...msg, blocks: updateToolBlock(msg.blocks) }
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
                  ...(actualCredits !== undefined && {
                    credits: actualCredits,
                  }),
                }
              : msg,
          ),
        )

        previousRunStateRef.current = result
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
              if (msg.id !== aiMessageId) {
                return msg
              }

              const blocks: ContentBlock[] = msg.blocks
                ? [...msg.blocks]
                : []
              const lastBlock = blocks[blocks.length - 1]

              if (lastBlock && lastBlock.type === 'text') {
                const interruptedBlock: ContentBlock = {
                  type: 'text',
                  content: `${lastBlock.content}\n\n[response interrupted]`,
                }
                return {
                  ...msg,
                  blocks: [...blocks.slice(0, -1), interruptedBlock],
                  isComplete: true,
                }
              }

              const interruptionNotice: ContentBlock = {
                type: 'text',
                content: '[response interrupted]',
              }
              return {
                ...msg,
                blocks: [...blocks, interruptionNotice],
                isComplete: true,
              }
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
    ],
  )

  return { sendMessage }
}
