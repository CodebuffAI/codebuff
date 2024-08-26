import { JSONContent } from '@tiptap/core'
import { convertSQLtoTS, Row, tsToMillis } from 'common/supabase/utils'
export type ChatVisibility = 'private' | 'system_status' | 'introduction'

export type ChatMessage = {
  id: string
  userId: string
  channelId: string
  content: JSONContent
  createdTime: number
  visibility: ChatVisibility
}
export type PrivateChatMessage = Omit<ChatMessage, 'id'> & {
  id: number
  createdTimeTs: string
}

export const convertPublicChatMessage = (row: Row<'chat_messages'>) =>
  convertSQLtoTS<'chat_messages', ChatMessage>(row, {
    created_time: tsToMillis as any,
  })
