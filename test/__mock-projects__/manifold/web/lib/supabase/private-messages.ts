import { db } from 'web/lib/supabase/db'
import { run } from 'common/supabase/utils'
import { api } from 'web/lib/api/api'

// NOTE: must be authorized (useIsAuthorized) to use this function
export const getSortedChatMessageChannels = async (
  limit: number,
  channelId?: number
) => {
  return await api('get-channel-memberships', { limit, channelId })
}

export type PrivateMessageMembership = {
  user_id: string
  channel_id: number
}

// NOTE: must be authorized (useIsAuthorized) to use this function
export const getTotalChatMessages = async (channelId: number) => {
  const q = db
    .from('private_user_messages')
    .select('*', { head: true, count: 'exact' })
    .eq('channel_id', channelId)
  const { count } = await run(q)
  return count
}
