import React, { memo, useMemo } from 'react'

import { AgentBlockGrid } from './agent-block-grid'
import { ImplementorGroup } from './implementor-row'
import { ToolBlockGroup } from './tool-block-group'
import { AgentBranchWrapper } from './agent-branch-wrapper'
import { ImageBlock } from './image-block'
import { ThinkingBlock } from './thinking-block'
import { SingleBlock } from './single-block'
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
  streamingAgents: Set<string>
  onToggleCollapsed: (id: string) => void
  onBuildFast: () => void
  onBuildMax: () => void
  isLastMessage?: boolean
  contentToCopy?: string
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
    streamingAgents,
    onToggleCollapsed,
    onBuildFast,
    onBuildMax,
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

    const handlers: BlockProcessorHandlers = useMemo(
      () => ({
        onReasoningGroup: (reasoningBlocks, startIndex) => (
          <ThinkingBlock
            key={reasoningBlocks[0]?.thinkingId ?? `${messageId}-thinking-${startIndex}`}
            blocks={reasoningBlocks}
            onToggleCollapsed={onToggleCollapsed}
            availableWidth={availableWidth}
            isNested={false}
          />
        ),

        onImageBlock: (block, index) => (
          <ImageBlock
            key={`${messageId}-image-${index}`}
            block={block}
            availableWidth={availableWidth}
          />
        ),

        onToolGroup: (toolBlocks, startIndex, nextIndex) => (
          <ToolBlockGroup
            key={`${messageId}-tool-group-${startIndex}`}
            toolBlocks={toolBlocks}
            keyPrefix={messageId}
            startIndex={startIndex}
            nextIndex={nextIndex}
            siblingBlocks={sourceBlocks}
            availableWidth={availableWidth}
            streamingAgents={streamingAgents}
            onToggleCollapsed={onToggleCollapsed}
            markdownPalette={markdownPalette}
          />
        ),

        onImplementorGroup: (implementors, startIndex) => (
          <ImplementorGroup
            key={`${messageId}-implementor-group-${startIndex}`}
            implementors={implementors}
            siblingBlocks={sourceBlocks}
            availableWidth={availableWidth}
          />
        ),

        onAgentGroup: (agentBlocks, startIndex) => (
          <AgentBlockGrid
            key={`${messageId}-agent-grid-${startIndex}`}
            agentBlocks={agentBlocks}
            keyPrefix={`${messageId}-agent-grid-${startIndex}`}
            availableWidth={availableWidth}
            streamingAgents={streamingAgents}
            renderAgentBranch={(agentBlock, prefix, width) => (
              <AgentBranchWrapper
                agentBlock={agentBlock}
                keyPrefix={prefix}
                availableWidth={width}
                markdownPalette={markdownPalette}
                streamingAgents={streamingAgents}
                onToggleCollapsed={onToggleCollapsed}
                onBuildFast={onBuildFast}
                onBuildMax={onBuildMax}
                siblingBlocks={sourceBlocks}
                isLastMessage={isLastMessage}
              />
            )}
          />
        ),

        onSingleBlock: (block, index) => (
          <SingleBlock
            key={`${messageId}-block-${index}`}
            block={block}
            idx={index}
            messageId={messageId}
            blocks={sourceBlocks}
            isLoading={isLoading}
            isComplete={isComplete}
            isUser={isUser}
            textColor={textColor}
            availableWidth={availableWidth}
            markdownPalette={markdownPalette}
            streamingAgents={streamingAgents}
            onToggleCollapsed={onToggleCollapsed}
            onBuildFast={onBuildFast}
            onBuildMax={onBuildMax}
            isLastMessage={isLastMessage}
            contentToCopy={index === lastTextBlockIndex ? contentToCopy : undefined}
          />
        ),
      }),
      [
        messageId,
        sourceBlocks,
        isLoading,
        isComplete,
        isUser,
        textColor,
        availableWidth,
        markdownPalette,
        streamingAgents,
        onToggleCollapsed,
        onBuildFast,
        onBuildMax,
        isLastMessage,
        contentToCopy,
        lastTextBlockIndex,
      ],
    )

    return processBlocks(sourceBlocks, handlers)
  },
)
