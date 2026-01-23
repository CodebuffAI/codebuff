/**
 * Extracted chat messages hook.
 * Handles message tree building, pagination, and collapse state management.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { buildMessageTree } from '../utils/message-tree-utils'
import { setAllBlocksCollapsedState, hasAnyExpandedBlocks } from '../utils/collapse-helpers'

import type { ChatMessage, ContentBlock } from '../types/chat'

/** Batch size for message pagination */
const MESSAGE_BATCH_SIZE = 15

/**
 * Options for useChatMessages hook.
 */
export interface UseChatMessagesOptions {
  /** Current messages array from store */
  messages: ChatMessage[]
  /** Setter for messages */
  setMessages: (
    value: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[]),
  ) => void
}

/**
 * Return type for useChatMessages hook.
 */
export interface UseChatMessagesReturn {
  /** Map of parent ID to child messages */
  messageTree: Map<string, ChatMessage[]>
  /** Messages without a parent (root level) */
  topLevelMessages: ChatMessage[]
  /** Paginated visible messages from top level */
  visibleTopLevelMessages: ChatMessage[]
  /** Count of hidden messages due to pagination */
  hiddenMessageCount: number
  /** Handler to toggle collapsed state of a block */
  handleCollapseToggle: (id: string) => void
  /** Returns true if user is currently collapsing (to prevent auto-scroll) */
  isUserCollapsing: () => boolean
  /** Handler to load more previous messages */
  handleLoadPreviousMessages: () => void
  /** Handler to toggle all collapsed/expanded state in all AI responses */
  handleToggleAll: () => void
}

/**
 * Custom hook that encapsulates message handling logic.
 * Extracts message tree building, pagination, and collapse management.
 *
 * @param options - Messages array and setter from store
 * @returns Message tree, pagination state, and handlers
 */
export function useChatMessages({
  messages,
  setMessages,
}: UseChatMessagesOptions): UseChatMessagesReturn {
  // Message pagination state
  const [visibleMessageCount, setVisibleMessageCount] =
    useState(MESSAGE_BATCH_SIZE)

  // Reset visible message count when messages are cleared or conversation changes
  useEffect(() => {
    if (messages.length <= MESSAGE_BATCH_SIZE) {
      setVisibleMessageCount(MESSAGE_BATCH_SIZE)
    }
  }, [messages.length])

  // Ref to track user-initiated collapse (prevents auto-scroll during collapse)
  const isUserCollapsingRef = useRef<boolean>(false)

  /**
   * Returns true if user is currently collapsing.
   * Used by scroll management to prevent auto-scroll during collapse.
   */
  const isUserCollapsing = useCallback(() => {
    return isUserCollapsingRef.current
  }, [])

  /**
   * Toggles the collapsed state of a block or agent message.
   * Handles both top-level agent messages and nested content blocks.
   */
  const handleCollapseToggle = useCallback(
    (id: string) => {
      // Set flag to prevent auto-scroll during user-initiated collapse
      isUserCollapsingRef.current = true

      // Find and toggle the block's isCollapsed property
      setMessages((prevMessages) => {
        return prevMessages.map((message) => {
          // Handle agent variant messages
          if (message.variant === 'agent' && message.id === id) {
            const wasCollapsed = message.metadata?.isCollapsed ?? false
            return {
              ...message,
              metadata: {
                ...message.metadata,
                isCollapsed: !wasCollapsed,
                userOpened: wasCollapsed, // Mark as user-opened if expanding
              },
            }
          }

          // Handle blocks within messages
          if (!message.blocks) return message

          const updateBlocksRecursively = (
            blocks: ContentBlock[],
          ): ContentBlock[] => {
            let foundTarget = false
            const result = blocks.map((block) => {
              // Handle thinking blocks - just match by thinkingId
              if (block.type === 'text' && block.thinkingId === id) {
                foundTarget = true
                const wasCollapsed = block.isCollapsed ?? false
                return {
                  ...block,
                  isCollapsed: !wasCollapsed,
                  userOpened: wasCollapsed, // Mark as user-opened if expanding
                }
              }

              // Handle agent blocks
              if (block.type === 'agent' && block.agentId === id) {
                foundTarget = true
                const wasCollapsed = block.isCollapsed ?? false
                return {
                  ...block,
                  isCollapsed: !wasCollapsed,
                  userOpened: wasCollapsed, // Mark as user-opened if expanding
                }
              }

              // Handle tool blocks
              if (block.type === 'tool' && block.toolCallId === id) {
                foundTarget = true
                const wasCollapsed = block.isCollapsed ?? false
                return {
                  ...block,
                  isCollapsed: !wasCollapsed,
                  userOpened: wasCollapsed, // Mark as user-opened if expanding
                }
              }

              // Handle agent-list blocks
              if (block.type === 'agent-list' && block.id === id) {
                foundTarget = true
                const wasCollapsed = block.isCollapsed ?? false
                return {
                  ...block,
                  isCollapsed: !wasCollapsed,
                  userOpened: wasCollapsed, // Mark as user-opened if expanding
                }
              }

              // Recursively update nested blocks inside agent blocks
              if (block.type === 'agent' && block.blocks) {
                const updatedBlocks = updateBlocksRecursively(block.blocks)
                // Only create new block if nested blocks actually changed
                if (updatedBlocks !== block.blocks) {
                  foundTarget = true
                  return {
                    ...block,
                    blocks: updatedBlocks,
                  }
                }
              }

              return block
            })

            // Return original array reference if nothing changed
            return foundTarget ? result : blocks
          }

          return {
            ...message,
            blocks: updateBlocksRecursively(message.blocks),
          }
        })
      })

      // Reset flag after state update completes.
      // Uses setTimeout(0) to defer until after React's batched state updates
      // have been applied, ensuring the flag stays true during the render cycle.
      setTimeout(() => {
        isUserCollapsingRef.current = false
      }, 0)
    },
    [setMessages],
  )

  /**
   * Loads more previous messages by increasing the visible count.
   */
  const handleLoadPreviousMessages = useCallback(() => {
    setVisibleMessageCount((prev) => prev + MESSAGE_BATCH_SIZE)
  }, [])

  /**
   * Toggles all collapsible blocks in all AI responses.
   * If any block is expanded, collapses all. Otherwise expands all.
   */
  const handleToggleAll = useCallback(() => {
    isUserCollapsingRef.current = true

    setMessages((prevMessages) => {
      // Determine target state: if any expanded, collapse all; otherwise expand all
      const shouldCollapse = hasAnyExpandedBlocks(prevMessages)
      return setAllBlocksCollapsedState(prevMessages, shouldCollapse)
    })

    // Reset flag after state update completes.
    // Uses setTimeout(0) to defer until after React's batched state updates
    // have been applied, ensuring the flag stays true during the render cycle.
    setTimeout(() => {
      isUserCollapsingRef.current = false
    }, 0)
  }, [setMessages])

  // Build message tree from flat messages array
  const { tree: messageTree, topLevelMessages } = useMemo(
    () => buildMessageTree(messages),
    [messages],
  )

  // Compute visible messages slice (from the end)
  const visibleTopLevelMessages = useMemo(() => {
    if (topLevelMessages.length <= visibleMessageCount) {
      return topLevelMessages
    }
    return topLevelMessages.slice(-visibleMessageCount)
  }, [topLevelMessages, visibleMessageCount])

  const hiddenMessageCount =
    topLevelMessages.length - visibleTopLevelMessages.length

  return {
    messageTree,
    topLevelMessages,
    visibleTopLevelMessages,
    hiddenMessageCount,
    handleCollapseToggle,
    isUserCollapsing,
    handleLoadPreviousMessages,
    handleToggleAll,
  }
}
