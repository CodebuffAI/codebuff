import React from 'react'

import { MessageWithAgents } from './message-with-agents'
import type { ChatMessage } from '../types/chat'
import type { ScrollBoxRenderable } from '@opentui/core'
import type { Dispatch, SetStateAction } from 'react'

interface ChatScrollAreaProps {
  scrollRef: React.MutableRefObject<ScrollBoxRenderable | null>
  appliedScrollboxProps: any
  headerContent: React.ReactNode
  virtualizationNotice: React.ReactNode
  topLevelMessages: ChatMessage[]
  streamingAgents: Set<string>
  messageTree: Map<string, ChatMessage[]>
  messages: ChatMessage[]
  setFocusedAgentId: Dispatch<SetStateAction<string | null>>
  isWaitingForResponse: boolean
}

export const ChatScrollArea = ({
  scrollRef,
  appliedScrollboxProps,
  headerContent,
  virtualizationNotice,
  topLevelMessages,
  streamingAgents,
  messageTree,
  messages,
  setFocusedAgentId,
  isWaitingForResponse,
}: ChatScrollAreaProps) => {
  return (
    <scrollbox
      ref={scrollRef}
      stickyScroll
      stickyStart="bottom"
      scrollX={false}
      scrollbarOptions={{ visible: false }}
      verticalScrollbarOptions={{ visible: true, trackOptions: { width: 1 } }}
      {...appliedScrollboxProps}
      style={{
        flexGrow: 1,
        rootOptions: {
          flexGrow: 1,
          padding: 0,
          gap: 0,
          flexDirection: 'row',
          shouldFill: true,
          backgroundColor: 'transparent',
        },
        wrapperOptions: {
          flexGrow: 1,
          border: false,
          shouldFill: true,
          backgroundColor: 'transparent',
          flexDirection: 'column',
        },
        contentOptions: {
          flexDirection: 'column',
          gap: 0,
          shouldFill: true,
          justifyContent: 'flex-end',
          backgroundColor: 'transparent',
        },
      }}
    >
      {headerContent}
      {virtualizationNotice}
      {topLevelMessages.map((message, idx) => {
        const isLast = idx === topLevelMessages.length - 1
        return (
          <MessageWithAgents
            key={message.id}
            message={message}
            depth={0}
            isLastMessage={isLast}
            streamingAgents={streamingAgents}
            messageTree={messageTree}
            messages={messages}
            setFocusedAgentId={setFocusedAgentId}
            isWaitingForResponse={isWaitingForResponse}
          />
        )
      })}
    </scrollbox>
  )
}
