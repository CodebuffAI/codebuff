import { useCallback, useEffect, useRef } from 'react'

import { getCodebuffClient, formatToolOutput } from '../utils/codebuff-client'
import { formatTimestamp } from '../utils/helpers'
import { logger } from '../utils/logger'

import type { ChatMessage, ContentBlock } from '../chat'
import type { ToolName } from '@codebuff/sdk'
import type { SetStateAction } from 'react'

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

const hiddenToolNames = new Set<ToolName | 'spawn_agent_inline'>([
  'spawn_agent_inline',
  'end_turn',
  'spawn_agents',
])

const yieldToEventLoop = () =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, 0)
  })

// Helper function to recursively update blocks
const updateBlocksRecursively = (
  blocks: ContentBlock[],
  targetAgentId: string,
  updateFn: (block: ContentBlock) => ContentBlock,
): ContentBlock[] => {
  return blocks.map((block) => {
    if (block.type === 'agent' && block.agentId === targetAgentId) {
      return updateFn(block)
    }
    if (block.type === 'agent' && block.blocks) {
      return {
        ...block,
        blocks: updateBlocksRecursively(block.blocks, targetAgentId, updateFn),
      }
    }
    return block
  })
}

const mergeTextSegments = (
  previous: string,
  incoming: string,
): { next: string; delta: string } => {
  if (!incoming) {
    return { next: previous, delta: '' }
  }
  if (!previous) {
    return { next: incoming, delta: incoming }
  }

  if (incoming.startsWith(previous)) {
    return { next: incoming, delta: incoming.slice(previous.length) }
  }

  if (previous.includes(incoming)) {
    return { next: previous, delta: '' }
  }

  const maxOverlap = Math.min(previous.length, incoming.length)
  for (let overlap = maxOverlap; overlap > 0; overlap--) {
    if (
      previous.slice(previous.length - overlap) === incoming.slice(0, overlap)
    ) {
      const delta = incoming.slice(overlap)
      return {
        next: previous + delta,
        delta,
      }
    }
  }

  return {
    next: previous + incoming,
    delta: incoming,
  }
}

interface UseSendMessageOptions {
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>
  setFocusedAgentId: (id: string | null) => void
  setInputFocused: (focused: boolean) => void
  inputRef: React.MutableRefObject<any>
  setStreamingAgents: React.Dispatch<React.SetStateAction<Set<string>>>
  setCollapsedAgents: React.Dispatch<React.SetStateAction<Set<string>>>
  activeSubagentsRef: React.MutableRefObject<Set<string>>
  isChainInProgressRef: React.MutableRefObject<boolean>
  setActiveSubagents: React.Dispatch<React.SetStateAction<Set<string>>>
  setIsChainInProgress: (value: boolean) => void
  setIsWaitingForResponse: (waiting: boolean) => void
  startStreaming: () => void
  stopStreaming: () => void
  setIsStreaming: (streaming: boolean) => void
  setCanProcessQueue: (can: boolean) => void
  abortControllerRef: React.MutableRefObject<AbortController | null>
  agentId?: string
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
  setActiveSubagents,
  setIsChainInProgress,
  setIsWaitingForResponse,
  startStreaming,
  stopStreaming,
  setIsStreaming,
  setCanProcessQueue,
  abortControllerRef,
  agentId,
}: UseSendMessageOptions) => {
  const previousRunStateRef = useRef<any>(null)
  const spawnAgentsMapRef = useRef<
    Map<string, { index: number; agentType: string }>
  >(new Map())
  const rootStreamBufferRef = useRef('')
  const agentStreamAccumulatorsRef = useRef<Map<string, string>>(new Map())
  const rootStreamSeenRef = useRef(false)

  const updateChainInProgress = useCallback(
    (value: boolean) => {
      isChainInProgressRef.current = value
      setIsChainInProgress(value)
    },
    [setIsChainInProgress, isChainInProgressRef],
  )

  const updateActiveSubagents = useCallback(
    (mutate: (next: Set<string>) => void) => {
      setActiveSubagents((prev) => {
        const next = new Set(prev)
        mutate(next)

        if (next.size === prev.size) {
          let changed = false
          for (const candidate of prev) {
            if (!next.has(candidate)) {
              changed = true
              break
            }
          }
          if (!changed) {
            activeSubagentsRef.current = prev
            return prev
          }
        }

        activeSubagentsRef.current = next
        return next
      })
    },
    [setActiveSubagents, activeSubagentsRef],
  )

  const addActiveSubagent = useCallback(
    (agentId: string) => {
      updateActiveSubagents((next) => next.add(agentId))
    },
    [updateActiveSubagents],
  )

  const removeActiveSubagent = useCallback(
    (agentId: string) => {
      updateActiveSubagents((next) => {
        if (next.has(agentId)) {
          next.delete(agentId)
        }
      })
    },
    [updateActiveSubagents],
  )

  const pendingMessageUpdatesRef = useRef<
    ((messages: ChatMessage[]) => ChatMessage[])[]
  >([])
  const flushTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const flushPendingUpdates = useCallback(() => {
    if (flushTimeoutRef.current) {
      clearTimeout(flushTimeoutRef.current)
      flushTimeoutRef.current = null
    }
    if (pendingMessageUpdatesRef.current.length === 0) {
      return
    }

    const queuedUpdates = pendingMessageUpdatesRef.current.slice()
    pendingMessageUpdatesRef.current = []

    setMessages((prev) => {
      let next = prev
      for (const updater of queuedUpdates) {
        next = updater(next)
      }
      return next
    })
  }, [setMessages])

  const scheduleFlush = useCallback(() => {
    if (flushTimeoutRef.current) {
      return
    }
    flushTimeoutRef.current = setTimeout(() => {
      flushTimeoutRef.current = null
      flushPendingUpdates()
    }, 48)
  }, [flushPendingUpdates])

  const queueMessageUpdate = useCallback(
    (updater: (messages: ChatMessage[]) => ChatMessage[]) => {
      pendingMessageUpdatesRef.current.push(updater)
      scheduleFlush()
    },
    [scheduleFlush],
  )

  const applyMessageUpdate = useCallback(
    (update: SetStateAction<ChatMessage[]>) => {
      flushPendingUpdates()
      setMessages(update)
    },
    [flushPendingUpdates, setMessages],
  )

  useEffect(() => {
    return () => {
      if (flushTimeoutRef.current) {
        clearTimeout(flushTimeoutRef.current)
        flushTimeoutRef.current = null
      }
      flushPendingUpdates()
    }
  }, [flushPendingUpdates])

  const sendMessage = useCallback(
    async (content: string) => {
      const timestamp = formatTimestamp()
      const userMessage: ChatMessage = {
        id: `user-${Date.now()}`,
        variant: 'user',
        content,
        timestamp,
      }

      applyMessageUpdate((prev) => {
        const newMessages = [...prev, userMessage]
        if (newMessages.length > 100) {
          return newMessages.slice(-100)
        }
        return newMessages
      })
      await yieldToEventLoop()

      setFocusedAgentId(null)
      setInputFocused(true)
      inputRef.current?.focus()

      const client = getCodebuffClient()

      if (!client) {
        logger.info({}, 'No API client available, using mock mode')
        const aiMessageId = `ai-${Date.now()}-${Math.random().toString(16).slice(2)}`
        const aiMessage: ChatMessage = {
          id: aiMessageId,
          variant: 'ai',
          content: '',
          timestamp: formatTimestamp(),
        }

        applyMessageUpdate((prev) => [...prev, aiMessage])

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
            applyMessageUpdate((prev) => [...prev, completionMessage])
            return
          }

          const nextChunk = tokens[index]
          index++

          queueMessageUpdate((prev) =>
            prev.map((msg) =>
              msg.id === aiMessageId
                ? { ...msg, content: msg.content + nextChunk }
                : msg,
            ),
          )
        }, 28)

        logger.info({}, 'Starting mock response streaming')
        startStreaming()
        return
      }

      logger.info({ prompt: content }, 'Starting real API request')

      const aiMessageId = `ai-${Date.now()}-${Math.random().toString(16).slice(2)}`
      const aiMessage: ChatMessage = {
        id: aiMessageId,
        variant: 'ai',
        content: '',
        blocks: [],
        timestamp: formatTimestamp(),
      }

      rootStreamBufferRef.current = ''
      rootStreamSeenRef.current = false
      agentStreamAccumulatorsRef.current = new Map<string, string>()

      const updateAgentContent = (
        agentId: string,
        update:
          | { type: 'text'; content: string; replace?: boolean }
          | Extract<ContentBlock, { type: 'tool' }>,
      ) => {
        const preview =
          update.type === 'text'
            ? update.content.slice(0, 120)
            : JSON.stringify({ toolName: update.toolName }).slice(0, 120)
        logger.info(
          {
            agentId,
            updateType: update.type,
            preview,
          },
          'updateAgentContent invoked',
        )
        queueMessageUpdate((prev) =>
          prev.map((msg) => {
            if (msg.id === aiMessageId && msg.blocks) {
              // Use recursive update to handle nested agents
              const newBlocks = updateBlocksRecursively(
                msg.blocks,
                agentId,
                (block) => {
                  if (block.type !== 'agent') {
                    return block
                  }
                  const agentBlocks: ContentBlock[] = block.blocks
                    ? [...block.blocks]
                    : []
                  if (update.type === 'text') {
                    const text = update.content ?? ''
                    const replace = update.replace ?? false

                    if (replace) {
                      const updatedBlocks = [...agentBlocks]
                      let replaced = false

                      for (let i = updatedBlocks.length - 1; i >= 0; i--) {
                        const entry = updatedBlocks[i]
                        if (entry.type === 'text') {
                          replaced = true
                          if (
                            entry.content === text &&
                            block.content === text
                          ) {
                            logger.info(
                              {
                                agentId,
                                preview,
                              },
                              'Agent block text replacement skipped',
                            )
                            return block
                          }
                          updatedBlocks[i] = { ...entry, content: text }
                          break
                        }
                      }

                      if (!replaced) {
                        updatedBlocks.push({ type: 'text', content: text })
                      }

                      logger.info(
                        {
                          agentId,
                          length: text.length,
                        },
                        'Agent block text replaced',
                      )
                      return {
                        ...block,
                        content: text,
                        blocks: updatedBlocks,
                      }
                    }

                    if (!text) {
                      return block
                    }

                    const lastBlock = agentBlocks[agentBlocks.length - 1]
                    if (lastBlock && lastBlock.type === 'text') {
                      if (lastBlock.content.endsWith(text)) {
                        logger.info(
                          { agentId, preview },
                          'Skipping duplicate agent text append',
                        )
                        return block
                      }
                      const updatedLastBlock: ContentBlock = {
                        ...lastBlock,
                        content: lastBlock.content + text,
                      }
                      const updatedContent = (block.content ?? '') + text
                      logger.info(
                        {
                          agentId,
                          appendedLength: text.length,
                          totalLength: updatedContent.length,
                        },
                        'Agent block text appended',
                      )
                      return {
                        ...block,
                        content: updatedContent,
                        blocks: [...agentBlocks.slice(0, -1), updatedLastBlock],
                      }
                    } else {
                      const updatedContent = (block.content ?? '') + text
                      logger.info(
                        {
                          agentId,
                          appendedLength: text.length,
                          totalLength: updatedContent.length,
                        },
                        'Agent block text started',
                      )
                      return {
                        ...block,
                        content: updatedContent,
                        blocks: [
                          ...agentBlocks,
                          { type: 'text', content: text },
                        ],
                      }
                    }
                  } else if (update.type === 'tool') {
                    logger.info(
                      {
                        agentId,
                        toolName: update.toolName,
                      },
                      'Agent block tool appended',
                    )
                    return { ...block, blocks: [...agentBlocks, update] }
                  }
                  return block
                },
              )
              return { ...msg, blocks: newBlocks }
            }
            return msg
          }),
        )
      }

      const appendRootTextChunk = (delta: string) => {
        if (!delta) {
          return
        }

        const fullText = rootStreamBufferRef.current ?? ''
        logger.info(
          {
            chunkLength: delta.length,
            fullLength: fullText.length,
            preview: delta.slice(0, 100),
          },
          'appendRootTextChunk invoked',
        )

        queueMessageUpdate((prev) =>
          prev.map((msg) => {
            if (msg.id !== aiMessageId) {
              return msg
            }

            const blocks: ContentBlock[] = msg.blocks ? [...msg.blocks] : []
            const lastBlock = blocks[blocks.length - 1]

            if (lastBlock && lastBlock.type === 'text') {
              const updatedBlock: ContentBlock = {
                ...lastBlock,
                content: lastBlock.content + delta,
              }
              return {
                ...msg,
                blocks: [...blocks.slice(0, -1), updatedBlock],
              }
            }

            return {
              ...msg,
              blocks: [...blocks, { type: 'text', content: delta }],
            }
          }),
        )
      }

      logger.info('Initiating SDK client.run()')
      setIsWaitingForResponse(true)
      applyMessageUpdate((prev) => [...prev, aiMessage])
      setIsStreaming(true)
      setCanProcessQueue(false)
      updateChainInProgress(true)

      const startTime = Date.now()
      let hasReceivedContent = false
      let actualCredits: number | undefined = undefined

      const abortController = new AbortController()
      abortControllerRef.current = abortController

      try {
        const result = await client.run({
          agent: agentId || 'base',
          prompt: content,
          previousRun: previousRunStateRef.current,
          signal: abortController.signal,

          handleStreamChunk: (chunk: any) => {
            if (typeof chunk !== 'string' || !chunk) {
              return
            }

            if (!hasReceivedContent) {
              hasReceivedContent = true
              setIsWaitingForResponse(false)
            }

            const previous = rootStreamBufferRef.current ?? ''
            const { next, delta } = mergeTextSegments(previous, chunk)
            if (!delta && next === previous) {
              return
            }
            logger.info(
              {
                chunkLength: chunk.length,
                previousLength: previous.length,
                nextLength: next.length,
                preview: chunk.slice(0, 100),
              },
              'handleStreamChunk root delta',
            )
            rootStreamBufferRef.current = next
            rootStreamSeenRef.current = true
            if (delta) {
              appendRootTextChunk(delta)
            }
          },

          handleEvent: (event: any) => {
            logger.info({ type: event.type, event }, 'SDK Event received (raw)')

            if (event.type === 'subagent-chunk') {
              const { agentId, chunk } = event

              const previous =
                agentStreamAccumulatorsRef.current.get(agentId) ?? ''
              const { next, delta } = mergeTextSegments(previous, chunk)
              if (!delta && next === previous) {
                return
              }
              agentStreamAccumulatorsRef.current.set(agentId, next)

              updateAgentContent(agentId, {
                type: 'text',
                content: delta || next,
                ...(delta ? {} : { replace: true }),
              })
              return
            }

            if (event.type === 'text') {
              const text = event.text

              if (typeof text !== 'string' || !text) return

              if (!hasReceivedContent) {
                hasReceivedContent = true
                setIsWaitingForResponse(false)
              }

              if (event.agentId) {
                logger.info(
                  {
                    agentId: event.agentId,
                    textPreview: text.slice(0, 100),
                  },
                  'setMessages: text event with agentId',
                )
                const previous =
                  agentStreamAccumulatorsRef.current.get(event.agentId) ?? ''
                const { next, delta } = mergeTextSegments(previous, text)
                if (!delta && next === previous) {
                  return
                }
                agentStreamAccumulatorsRef.current.set(event.agentId, next)

                if (delta) {
                  updateAgentContent(event.agentId, {
                    type: 'text',
                    content: delta,
                  })
                } else {
                  updateAgentContent(event.agentId, {
                    type: 'text',
                    content: next,
                    replace: true,
                  })
                }
              } else {
                if (rootStreamSeenRef.current) {
                  logger.info(
                    {
                      textPreview: text.slice(0, 100),
                      textLength: text.length,
                    },
                    'Skipping root text event (stream already handled)',
                  )
                  return
                }
                const previous = rootStreamBufferRef.current ?? ''
                const { next, delta } = mergeTextSegments(previous, text)
                if (!delta && next === previous) {
                  return
                }
                logger.info(
                  {
                    textPreview: text.slice(0, 100),
                    previousLength: previous.length,
                    textLength: text.length,
                    appendedLength: delta.length,
                  },
                  'setMessages: text event without agentId',
                )
                rootStreamBufferRef.current = next

                if (delta) {
                  appendRootTextChunk(delta)
                }
              }
              return
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
                logger.info(
                  {
                    agentId: event.agentId,
                    agentType: event.agentType,
                    parentAgentId: event.parentAgentId || 'ROOT',
                    hasParentAgentId: !!event.parentAgentId,
                    eventKeys: Object.keys(event),
                  },
                  'CLI: subagent_start event received',
                )
                addActiveSubagent(event.agentId)

                let foundExistingBlock = false
                for (const [
                  tempId,
                  info,
                ] of spawnAgentsMapRef.current.entries()) {
                  const eventType = event.agentType || ''
                  const storedType = info.agentType || ''
                  // Match if exact match, or if eventType ends with storedType (e.g., 'codebuff/file-picker@0.0.2' matches 'file-picker')
                  const isMatch =
                    eventType === storedType ||
                    (eventType.includes('/') &&
                      eventType.split('/')[1]?.split('@')[0] === storedType)
                  if (isMatch) {
                    logger.info(
                      {
                        tempId,
                        realAgentId: event.agentId,
                        agentType: eventType,
                        hasParentAgentId: !!event.parentAgentId,
                        parentAgentId: event.parentAgentId || 'none',
                      },
                      'setMessages: matching spawn_agents block found',
                    )
                    applyMessageUpdate((prev) =>
                      prev.map((msg) => {
                        if (msg.id === aiMessageId && msg.blocks) {
                          // Find and extract the block with tempId
                          let blockToMove: ContentBlock | null = null
                          const extractBlock = (
                            blocks: ContentBlock[],
                          ): ContentBlock[] => {
                            const result: ContentBlock[] = []
                            for (const block of blocks) {
                              if (
                                block.type === 'agent' &&
                                block.agentId === tempId
                              ) {
                                blockToMove = {
                                  ...block,
                                  agentId: event.agentId,
                                }
                                // Don't add to result - we're extracting it
                              } else if (
                                block.type === 'agent' &&
                                block.blocks
                              ) {
                                // Recursively process nested blocks
                                result.push({
                                  ...block,
                                  blocks: extractBlock(block.blocks),
                                })
                              } else {
                                result.push(block)
                              }
                            }
                            return result
                          }

                          let blocks = extractBlock(msg.blocks)

                          if (!blockToMove) {
                            // Fallback: just rename if we couldn't find it
                            blocks = updateBlocksRecursively(
                              msg.blocks,
                              tempId,
                              (block) => ({ ...block, agentId: event.agentId }),
                            )
                            return { ...msg, blocks }
                          }

                          // If parentAgentId exists, nest under parent
                          if (event.parentAgentId) {
                            logger.info(
                              {
                                tempId,
                                realAgentId: event.agentId,
                                parentAgentId: event.parentAgentId,
                              },
                              'setMessages: moving spawn_agents block to nest under parent',
                            )

                            // Try to find parent and nest
                            let parentFound = false
                            const updatedBlocks = updateBlocksRecursively(
                              blocks,
                              event.parentAgentId,
                              (parentBlock) => {
                                if (parentBlock.type !== 'agent') {
                                  return parentBlock
                                }
                                parentFound = true
                                return {
                                  ...parentBlock,
                                  blocks: [
                                    ...(parentBlock.blocks || []),
                                    blockToMove!,
                                  ],
                                }
                              },
                            )

                            // If parent found, use updated blocks; otherwise add to top level
                            if (parentFound) {
                              blocks = updatedBlocks
                            } else {
                              logger.info(
                                {
                                  tempId,
                                  realAgentId: event.agentId,
                                  parentAgentId: event.parentAgentId,
                                },
                                'setMessages: spawn_agents parent not found, adding to top level',
                              )
                              blocks = [...blocks, blockToMove]
                            }
                          } else {
                            // No parent - add back at top level with new ID
                            blocks = [...blocks, blockToMove]
                          }

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
                    {
                      agentId: event.agentId,
                      agentType: event.agentType,
                      parentAgentId: event.parentAgentId || 'ROOT',
                    },
                    'setMessages: creating new agent block (no spawn_agents match)',
                  )
                  applyMessageUpdate((prev) =>
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

                      // If parentAgentId exists, nest inside parent agent
                      if (event.parentAgentId) {
                        logger.info(
                          {
                            childId: event.agentId,
                            parentId: event.parentAgentId,
                          },
                          'Nesting agent inside parent',
                        )

                        // Try to find and update parent
                        let parentFound = false
                        const updatedBlocks = updateBlocksRecursively(
                          blocks,
                          event.parentAgentId,
                          (parentBlock) => {
                            if (parentBlock.type !== 'agent') {
                              return parentBlock
                            }
                            parentFound = true
                            return {
                              ...parentBlock,
                              blocks: [
                                ...(parentBlock.blocks || []),
                                newAgentBlock,
                              ],
                            }
                          },
                        )

                        // If parent was found, use updated blocks; otherwise add to top level
                        if (parentFound) {
                          return { ...msg, blocks: updatedBlocks }
                        } else {
                          logger.info(
                            {
                              childId: event.agentId,
                              parentId: event.parentAgentId,
                            },
                            'Parent agent not found, adding to top level',
                          )
                          // Parent doesn't exist - add at top level as fallback
                          return {
                            ...msg,
                            blocks: [...blocks, newAgentBlock],
                          }
                        }
                      }

                      // No parent - add to top level
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
                agentStreamAccumulatorsRef.current.delete(event.agentId)
                removeActiveSubagent(event.agentId)

                applyMessageUpdate((prev) =>
                  prev.map((msg) => {
                    if (msg.id === aiMessageId && msg.blocks) {
                      // Use recursive update to handle nested agents
                      const blocks = updateBlocksRecursively(
                        msg.blocks,
                        event.agentId,
                        (block) => ({ ...block, status: 'complete' as const }),
                      )
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
              logger.info(
                {
                  toolCallId,
                  toolName,
                  agentId: agentId || 'ROOT',
                  hasAgentId: !!agentId,
                },
                'tool_call event received',
              )

              if (toolName === 'spawn_agents' && input?.agents) {
                const agents = Array.isArray(input.agents) ? input.agents : []

                agents.forEach((agent: any, index: number) => {
                  const tempAgentId = `${toolCallId}-${index}`
                  spawnAgentsMapRef.current.set(tempAgentId, {
                    index,
                    agentType: agent.agent_type || 'unknown',
                  })
                })

                logger.info(
                  {
                    toolCallId,
                    agentCount: agents.length,
                    agentTypes: agents.map((a: any) => a.agent_type),
                  },
                  'setMessages: spawn_agents tool call',
                )

                applyMessageUpdate((prev) =>
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
                        content: '',
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

              if (hiddenToolNames.has(toolName)) {
                return
              }

              logger.info(
                {
                  toolName,
                  toolCallId,
                  agentId: agentId || 'none',
                },
                'setMessages: tool_call event',
              )

              // If this tool call belongs to a subagent, add it to that agent's blocks
              if (agentId) {
                logger.info(
                  {
                    agentId,
                    toolName,
                    toolCallId,
                  },
                  'setMessages: tool_call for subagent',
                )

                applyMessageUpdate((prev) =>
                  prev.map((msg) => {
                    if (msg.id !== aiMessageId || !msg.blocks) {
                      return msg
                    }

                    // Use recursive update to handle nested agents
                    const updatedBlocks = updateBlocksRecursively(
                      msg.blocks,
                      agentId,
                      (block) => {
                        if (block.type !== 'agent') {
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
                          agentId,
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
                // Top-level tool call (or agent block doesn't exist yet)
                applyMessageUpdate((prev) =>
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
                      agentId,
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
              const isSpawnAgentsResult =
                Array.isArray(firstOutputValue) &&
                firstOutputValue.some((v: any) => v?.agentName || v?.agentType)

              logger.info(
                {
                  toolCallId,
                  isSpawnAgentsResult,
                  firstOutputValue: firstOutputValue ? 'array' : 'not array',
                },
                'setMessages: tool_result event',
              )

              if (isSpawnAgentsResult && Array.isArray(firstOutputValue)) {
                applyMessageUpdate((prev) =>
                  prev.map((msg) => {
                    if (msg.id === aiMessageId && msg.blocks) {
                      const blocks = msg.blocks.map((block) => {
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
                            } else if (
                              result.value.value &&
                              typeof result.value.value === 'string'
                            ) {
                              // Handle nested value structure like { type: "lastMessage", value: "..." }
                              content = result.value.value
                            } else if (result.value.message) {
                              content = result.value.message
                            } else {
                              content = formatToolOutput([result])
                            }

                            logger.info(
                              {
                                agentId: block.agentId,
                                contentLength: content.length,
                                contentPreview: content.substring(0, 100),
                              },
                              'setMessages: spawn_agents result processed',
                            )

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

              applyMessageUpdate((prev) =>
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

        logger.info(
          {
            credits: actualCredits,
          },
          'SDK client.run() completed successfully',
        )
        setIsStreaming(false)
        setCanProcessQueue(true)
        updateChainInProgress(false)
        setIsWaitingForResponse(false)

        if ((result as any)?.credits !== undefined) {
          actualCredits = (result as any).credits
        }

        const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(1)

        applyMessageUpdate((prev) =>
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

        logger.error(error, 'SDK client.run() failed')
        setIsStreaming(false)
        setCanProcessQueue(true)
        updateChainInProgress(false)
        setIsWaitingForResponse(false)

        if (isAborted) {
          applyMessageUpdate((prev) =>
            prev.map((msg) => {
              if (msg.id !== aiMessageId) {
                return msg
              }

              const blocks: ContentBlock[] = msg.blocks ? [...msg.blocks] : []
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
          applyMessageUpdate((prev) =>
            prev.map((msg) =>
              msg.id === aiMessageId
                ? {
                    ...msg,
                    content: msg.content + `\n\n**Error:** ${errorMessage}`,
                  }
                : msg,
            ),
          )

          applyMessageUpdate((prev) =>
            prev.map((msg) =>
              msg.id === aiMessageId ? { ...msg, isComplete: true } : msg,
            ),
          )
        }
      }
    },
    [
      applyMessageUpdate,
      queueMessageUpdate,
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
      updateChainInProgress,
      addActiveSubagent,
      removeActiveSubagent,
    ],
  )

  return { sendMessage }
}
