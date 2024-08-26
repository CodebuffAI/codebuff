import { convertSQLtoTS, Row, tsToMillis } from 'common/supabase/utils'
import { ChatMessage, PrivateChatMessage } from 'common/chat-message'

export type PrivateMessageChannel = {
  channel_id: number
  notify_after_time: string
  created_time: string
  last_updated_time: string
}

export const convertChatMessage = (row: Row<'private_user_messages'>) =>
  convertSQLtoTS<'private_user_messages', ChatMessage>(row, {
    created_time: tsToMillis as any,
  })

export const convertPrivateChatMessage = (row: Row<'private_user_messages'>) =>
  convertSQLtoTS<'private_user_messages', PrivateChatMessage>(row, {
    created_time: tsToMillis as any,
  })
