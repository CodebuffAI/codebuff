import { removeUndefinedProps } from 'common/util/object'
import { getUser } from 'shared/utils'
import { createSupabaseClient } from 'shared/supabase/init'
import { Json } from 'common/supabase/schema'
import { APIError, APIHandler } from 'api/helpers/endpoint'
import { convertPublicChatMessage } from 'common/chat-message'
import { broadcast } from 'shared/websockets/server'

export const createPublicChatMessage: APIHandler<
  'create-public-chat-message'
> = async (body, auth) => {
  const { content, channelId } = body
  const creator = await getUser(auth.uid)
  if (!creator) throw new APIError(401, 'Your account was not found')
  if (creator.isBannedFromPosting || creator.userDeleted)
    throw new APIError(403, 'You are banned or deleted.')

  const chatMessage = removeUndefinedProps({
    content: content as Json,
    channel_id: channelId,
    user_id: creator.id,
  })
  const db = createSupabaseClient()
  const { data, error } = await db
    .from('chat_messages')
    .insert([chatMessage])
    .select()
  if (error) {
    console.error(error)
    throw new APIError(500, 'Failed to create chat message.')
  }

  broadcast('chat_message', {})

  return convertPublicChatMessage({
    ...chatMessage,
    id: data[0].id,
    created_time: data[0].created_time,
  })
}
