import React, { memo, useMemo, useRef } from 'react'

import { AgentBlockGrid } from './agent-block-grid'
import { AgentBranchWrapper } from './agent-branch-wrapper'
import { ImageBlock } from './image-block'
import { ImplementorGroup } from './implementor-row'
import { SingleBlock } from './single-block'
import { ThinkingBlock } from './thinking-block'
import { ToolBlockGroup } from './tool-block-group'
import { processBlocks, type BlockProcessorHandlers } from '../../utils/block-processor'

import type { ContentBlock } from '../../types/chat'
import type { MarkdownPalette } from '../../utils/markdown-renderer'

interface BlocksRendererProps {
  sourceBlocks: ContentBlock[]
  messageId: string
  isLoading: boolean
  isComplete?: boolean
  isUser: boolean
  textColor: string
  availableWidth: number
  markdownPalette: MarkdownPalette
  onToggleCollapsed: (id: string) => void
  onBuildFast: () => void
  onBuildMax: () => void
  onBuildFree: () => void
  isLastMessage?: boolean
  contentToCopy?: string
}

/** Props stored in ref for stable handler access */
interface BlocksRendererPropsRef {
  sourceBlocks: ContentBlock[]
  messageId: string
  isLoading: boolean
  isComplete?: boolean
  isUser: boolean
  textColor: string
  availableWidth: number
  markdownPalette: MarkdownPalette
  onToggleCollapsed: (id: string) => void
  onBuildFast: () => void
  onBuildMax: () => void
  onBuildFree: () => void
  isLastMessage?: boolean
  contentToCopy?: string
  lastTextBlockIndex: number
}

export const BlocksRenderer = memo(
  ({
    sourceBlocks,
    messageId,
    isLoading,
    isComplete,
    isUser,
    textColor,
    availableWidth,
    markdownPalette,
    onToggleCollapsed,
    onBuildFast,
    onBuildMax,
    onBuildFree,
    isLastMessage,
    contentToCopy,
  }: BlocksRendererProps) => {
    const lastTextBlockIndex = contentToCopy
      ? sourceBlocks.reduceRight(
          (acc, block, idx) =>
            acc === -1 && block.type === 'text' ? idx : acc,
          -1,
        )
      : -1

    // Store props in ref for stable handler access (avoids 17 useMemo dependencies)
    const propsRef = useRef<BlocksRendererPropsRef>(null!)
    propsRef.current = {
      sourceBlocks,
      messageId,
      isLoading,
      isComplete,
      isUser,
      textColor,
      availableWidth,
      markdownPalette,
      onToggleCollapsed,
      onBuildFast,
      onBuildMax,
      onBuildFree,
      isLastMessage,
      contentToCopy,
      lastTextBlockIndex,
    }

    // Handlers are stable (empty deps) and read latest props from ref
    const handlers: BlockProcessorHandlers = useMemo(
      () => ({
        onReasoningGroup: (reasoningBlocks, startIndex) => {
          const p = propsRef.current
          return (
            <ThinkingBlock
              key={reasoningBlocks[0]?.thinkingId ?? `${p.messageId}-thinking-${startIndex}`}
              blocks={reasoningBlocks}
              onToggleCollapsed={p.onToggleCollapsed}
              availableWidth={p.availableWidth}
              isNested={false}
              isMessageComplete={p.isComplete ?? false}
            />
          )
        },

        onImageBlock: (block, index) => {
          const p = propsRef.current
          return (
            <ImageBlock
              key={`${p.messageId}-image-${index}`}
              block={block}
              availableWidth={p.availableWidth}
            />
          )
        },

        onToolGroup: (toolBlocks, startIndex, nextIndex) => {
          const p = propsRef.current
          return (
            <ToolBlockGroup
              key={`${p.messageId}-tool-group-${startIndex}`}
              toolBlocks={toolBlocks}
              keyPrefix={p.messageId}
              startIndex={startIndex}
              nextIndex={nextIndex}
              siblingBlocks={p.sourceBlocks}
              availableWidth={p.availableWidth}
              onToggleCollapsed={p.onToggleCollapsed}
              markdownPalette={p.markdownPalette}
            />
          )
        },

        onImplementorGroup: (implementors, startIndex) => {
          const p = propsRef.current
          return (
            <ImplementorGroup
              key={`${p.messageId}-implementor-group-${startIndex}`}
              implementors={implementors}
              siblingBlocks={p.sourceBlocks}
              availableWidth={p.availableWidth}
            />
          )
        },

        onAgentGroup: (agentBlocks, startIndex) => {
          const p = propsRef.current
          return (
            <AgentBlockGrid
              key={`${p.messageId}-agent-grid-${startIndex}`}
              agentBlocks={agentBlocks}
              keyPrefix={`${p.messageId}-agent-grid-${startIndex}`}
              availableWidth={p.availableWidth}
              renderAgentBranch={(agentBlock, prefix, width) => (
                <AgentBranchWrapper
                  agentBlock={agentBlock}
                  keyPrefix={prefix}
                  availableWidth={width}
                  markdownPalette={p.markdownPalette}
                  onToggleCollapsed={p.onToggleCollapsed}
                  onBuildFast={p.onBuildFast}
                  onBuildMax={p.onBuildMax}
                  onBuildFree={p.onBuildFree}
                  siblingBlocks={p.sourceBlocks}
                  isLastMessage={p.isLastMessage}
                />
              )}
            />
          )
        },

        onSingleBlock: (block, index) => {
          const p = propsRef.current
          return (
            <SingleBlock
              key={`${p.messageId}-block-${index}`}
              block={block}
              idx={index}
              messageId={p.messageId}
              blocks={p.sourceBlocks}
              isLoading={p.isLoading}
              isComplete={p.isComplete}
              isUser={p.isUser}
              textColor={p.textColor}
              availableWidth={p.availableWidth}
              markdownPalette={p.markdownPalette}
              onToggleCollapsed={p.onToggleCollapsed}
              onBuildFast={p.onBuildFast}
              onBuildMax={p.onBuildMax}
              onBuildFree={p.onBuildFree}
              isLastMessage={p.isLastMessage}
              contentToCopy={index === p.lastTextBlockIndex ? p.contentToCopy : undefined}
            />
          )
        },
      }),
      [], // Empty deps - handlers read from propsRef.current
    )

    return <>{processBlocks(sourceBlocks, handlers)}</>
  },
)
