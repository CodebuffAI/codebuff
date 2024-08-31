import { db } from 'web/lib/supabase/db'
import { orderBy, uniqBy } from 'lodash'
import { usePersistentLocalState } from './use-persistent-local-state'
import { useEffect } from 'react'
import { useApiSubscription } from 'web/hooks/use-api-subscription'
import { ChatMessage, convertPublicChatMessage } from 'common/chat-message'

export function usePublicChat(channelId: string, limit: number) {
  const [messages, setMessages] = usePersistentLocalState<
    ChatMessage[] | undefined
  >(undefined, `public-chat-messages-${limit}-v2-${channelId}`)

  const [newestId, setNewestId] = usePersistentLocalState<number | undefined>(
    undefined,
    `public-chat-newest-id`
  )

  const fetchMessages = async () => {
    const { data } = await db
      .from('chat_messages')
      .select('*')
      .eq('channel_id', channelId)
      .order('created_time', { ascending: false })
      .gt('id', newestId)
      .limit(limit)

    if (data) {
      const newMessages = data.map(convertPublicChatMessage)
      setMessages((prevMessages) =>
        orderBy(
          uniqBy([...newMessages, ...(prevMessages ?? [])], (m) => m.id),
          'createdTime',
          'desc'
        )
      )

      if (data.length > 0) setNewestId(data[0].id)
    }
  }

  useEffect(() => {
    fetchMessages()
  }, [limit])

  useApiSubscription({
    topics: ['public-chat'],
    onBroadcast: () => {
      fetchMessages()
    },
  })

  return messages
}
