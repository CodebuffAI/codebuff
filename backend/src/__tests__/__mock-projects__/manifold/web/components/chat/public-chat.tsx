import { useUser } from 'web/hooks/use-user'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import { usePublicChat } from 'web/hooks/use-public-chat-messages'
import { uniq } from 'lodash'
import { useUsersInStore } from 'web/hooks/use-user-supabase'
import {
  useGroupedMessages,
  usePaginatedScrollingMessages,
} from 'web/lib/supabase/chat-messages'
import { useTextEditor } from 'web/components/widgets/editor'
import { useEffect, useState } from 'react'
import { track } from 'web/lib/service/analytics'
import { firebaseLogin, User } from 'web/lib/firebase/users'
import { api } from 'web/lib/api/api'
import { toast } from 'react-hot-toast'
import { ReplyToUserInfo } from 'web/components/comments/comment'
import { Col } from 'web/components/layout/col'
import clsx from 'clsx'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import {
  ChatMessageItem,
  SystemChatMessageItem,
} from 'web/components/chat/chat-message'
import { filterDefined } from 'common/util/array'
import { Button } from 'web/components/buttons/button'
import { CommentInputTextArea } from 'web/components/comments/comment-input'
import { run } from 'common/supabase/utils'
import { db } from 'web/lib/supabase/db'

export const PublicChat = (props: {
  channelId: string
  className?: string
}) => {
  const { channelId, className } = props
  const user = useUser()
  const isMobile = useIsMobile()

  const realtimeMessages = usePublicChat(channelId, 100)

  const messageUserIds = uniq(
    (realtimeMessages ?? [])
      .filter((message) => message.userId !== user?.id)
      .map((message) => message.userId)
  )

  const otherUsers = useUsersInStore(messageUserIds, `${channelId}`, 100)
  const { topVisibleRef, showMessages, messages, innerDiv, outerDiv } =
    usePaginatedScrollingMessages(realtimeMessages, 200, user?.id)

  const editor = useTextEditor({
    key: `public-chat-message-${channelId}-${user?.id}`,
    size: 'sm',
    placeholder: 'Send a message',
  })

  useEffect(() => {
    if (user) setAsSeen(user, channelId)
  }, [messages.length])

  const [isSubmitting, setIsSubmitting] = useState(false)

  const groupedMessages = useGroupedMessages(messages)

  async function submitMessage() {
    if (!user) {
      track('sign in to comment')
      return await firebaseLogin()
    }
    if (!editor || editor.isEmpty || isSubmitting || !channelId) return
    setIsSubmitting(true)

    const msg = await api('create-public-chat-message', {
      channelId,
      content: editor.getJSON(),
    }).catch((e) => {
      toast.error(e.message)
      console.error(e)
      return null
    })
    if (msg) {
      editor.commands.clearContent()
      editor.commands.focus()
    }
    setIsSubmitting(false)
  }

  const heightFromTop = 200

  const [replyToUserInfo, setReplyToUserInfo] = useState<ReplyToUserInfo>()

  return (
    <Col className={clsx('w-full', className)}>
      <div ref={outerDiv} className="relative h-full overflow-y-auto xl:px-0">
        <div
          className="relative px-1 pb-4 pt-1 transition-all duration-100"
          ref={innerDiv}
          style={{
            opacity: showMessages ? 1 : 0,
          }}
        >
          {realtimeMessages === undefined ? (
            <LoadingIndicator />
          ) : (
            <>
              <div
                className={'absolute h-1'}
                ref={topVisibleRef}
                style={{ top: heightFromTop }}
              />
              {groupedMessages.map((messages, i) => {
                const firstMessage = messages[0]
                if (firstMessage.visibility === 'system_status') {
                  return (
                    <SystemChatMessageItem
                      key={firstMessage.id}
                      chats={messages}
                      otherUsers={otherUsers
                        ?.concat(filterDefined([user]))
                        .filter((user) =>
                          messages.some((m) => m.userId === user.id)
                        )}
                    />
                  )
                }
                const otherUser = otherUsers?.find(
                  (user) => user.id === firstMessage.userId
                )
                return (
                  <ChatMessageItem
                    key={firstMessage.id}
                    chats={messages}
                    currentUser={user}
                    otherUser={otherUser}
                    beforeSameUser={
                      groupedMessages[i + 1]?.[0].userId === firstMessage.userId
                    }
                    firstOfUser={
                      groupedMessages[i - 1]?.[0].userId !== firstMessage.userId
                    }
                    onReplyClick={(chat) =>
                      setReplyToUserInfo({
                        id: chat.userId,
                        username: otherUser?.username ?? '',
                      })
                    }
                  />
                )
              })}
            </>
          )}
          {realtimeMessages && messages.length === 0 && (
            <div className="text-ink-500 dark:text-ink-600 p-2">
              No messages yet. Say something why don't ya?
            </div>
          )}
        </div>
      </div>
      <div className="sticky bottom-[58px] lg:bottom-0">
        {!user ? (
          <Button color="gradient" onClick={firebaseLogin} className="w-full">
            Signup to chat
          </Button>
        ) : (
          <CommentInputTextArea
            autoFocus={false}
            editor={editor}
            user={user}
            submit={submitMessage}
            isSubmitting={isSubmitting}
            submitOnEnter={!isMobile}
            replyTo={replyToUserInfo}
          />
        )}
      </div>
    </Col>
  )
}

const setAsSeen = async (user: User, channelId: string) => {
  return run(
    db.from('user_seen_chats').insert({
      user_id: user.id,
      channel_id: channelId,
    })
  )
}
