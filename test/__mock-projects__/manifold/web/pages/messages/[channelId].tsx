import { Page } from 'web/components/layout/page'
import { useRouter } from 'next/router'
import {
  usePrivateMessages,
  useSortedPrivateMessageMemberships,
} from 'web/hooks/use-private-messages'
import { Col } from 'web/components/layout/col'
import { User } from 'common/user'
import { useEffect, useState } from 'react'
import { track } from 'web/lib/service/analytics'
import { firebaseLogin } from 'web/lib/firebase/users'
import { uniq } from 'lodash'
import { useUser } from 'web/hooks/use-user'
import { useTextEditor } from 'web/components/widgets/editor'
import {
  api,
  leavePrivateMessageChannel,
  sendUserPrivateMessage,
  updatePrivateMessageChannel,
} from 'web/lib/api/api'
import {
  ChatMessageItem,
  SystemChatMessageItem,
} from 'web/components/chat/chat-message'
import { CommentInputTextArea } from 'web/components/comments/comment-input'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { DAY_MS, YEAR_MS } from 'common/util/time'
import { useUsersInStore } from 'web/hooks/use-user-supabase'
import { BackButton } from 'web/components/contract/back-button'
import { Row } from 'web/components/layout/row'
import clsx from 'clsx'
import { useRedirectIfSignedOut } from 'web/hooks/use-redirect-if-signed-out'
import { MultipleOrSingleAvatars } from 'web/components/multiple-or-single-avatars'
import { Modal, MODAL_CLASS } from 'web/components/layout/modal'
import {
  BannedBadge,
  UserAvatarAndBadge,
} from 'web/components/widgets/user-link'
import DropdownMenu from 'web/components/comments/dropdown-menu'
import { DotsVerticalIcon } from '@heroicons/react/solid'
import { FaUserFriends, FaUserMinus } from 'react-icons/fa'
import { buildArray, filterDefined } from 'common/util/array'
import { GiSpeakerOff } from 'react-icons/gi'
import toast from 'react-hot-toast'
import { getNativePlatform } from 'web/lib/native/is-native'
import { ReplyToUserInfo } from 'web/components/comments/comment'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import {
  useGroupedMessages,
  usePaginatedScrollingMessages,
} from 'web/lib/supabase/chat-messages'
import { PrivateMessageChannel } from 'common/supabase/private-messages'
import { ChatMessage } from 'common/chat-message'

export default function PrivateMessagesPage() {
  const router = useRouter()
  const { channelId: channelIdString } = router.query as { channelId: string }
  const channelId = router.isReady ? parseInt(channelIdString) : undefined
  const user = useUser()
  return (
    <Page trackPageView={'private messages page'}>
      {router.isReady && channelId && user ? (
        <PrivateMessagesContent user={user} channelId={channelId} />
      ) : (
        <LoadingIndicator />
      )}
    </Page>
  )
}

export function PrivateMessagesContent(props: {
  user: User
  channelId: number
}) {
  useRedirectIfSignedOut()

  const { channelId, user } = props
  const channelMembership = useSortedPrivateMessageMemberships(
    user.id,
    1,
    channelId
  )
  const { channels, memberIdsByChannelId } = channelMembership
  const thisChannel = channels?.find((c) => c.channel_id == channelId)
  const loaded = channels !== undefined && channelId
  const memberIds = thisChannel
    ? memberIdsByChannelId?.[thisChannel.channel_id]
    : undefined

  return (
    <>
      {user && loaded && thisChannel && memberIds ? (
        <PrivateChat channel={thisChannel} user={user} memberIds={memberIds} />
      ) : (
        <LoadingIndicator />
      )}
    </>
  )
}

export const PrivateChat = (props: {
  user: User
  channel: PrivateMessageChannel
  memberIds: string[]
}) => {
  const { user, channel, memberIds } = props
  const channelId = channel.channel_id
  const isSafari =
    /^((?!chrome|android).)*safari/i.test(navigator.userAgent) ||
    getNativePlatform().platform === 'ios'
  const isMobile = useIsMobile()

  const totalMessagesToLoad = 100
  const realtimeMessages = usePrivateMessages(
    channelId,
    totalMessagesToLoad,
    user.id
  )

  const [showUsers, setShowUsers] = useState(false)
  const maxUsersToGet = 100
  const messageUserIds = uniq(
    (realtimeMessages ?? [])
      .filter((message) => message.userId !== user.id)
      .map((message) => message.userId)
  )

  // Note: we may have messages from users not in the channel, e.g. a system message from manifold
  const otherUsers = useUsersInStore(
    uniq(messageUserIds.concat(memberIds)),
    `${channelId}`,
    maxUsersToGet
  )

  const members = filterDefined(
    otherUsers?.filter((user) => memberIds.includes(user.id)) ?? []
  )
  const router = useRouter()

  const { topVisibleRef, showMessages, messages, innerDiv, outerDiv } =
    usePaginatedScrollingMessages(
      realtimeMessages?.map(
        (m) =>
          ({
            ...m,
            id: m.id.toString(),
          } as ChatMessage)
      ),
      200,
      user?.id
    )

  const editor = useTextEditor({
    key: `private-message-${channelId}-${user.id}`,
    size: 'sm',
    placeholder: 'Send a message',
  })

  useEffect(() => {
    setAsSeen(channelId)
  }, [JSON.stringify(messages)])

  const [isSubmitting, setIsSubmitting] = useState(false)

  const groupedMessages = useGroupedMessages(messages)

  async function submitMessage() {
    if (!user) {
      track('sign in to comment')
      return await firebaseLogin()
    }
    if (!editor || editor.isEmpty || isSubmitting || !channelId) return
    setIsSubmitting(true)

    await sendUserPrivateMessage({
      channelId,
      content: editor.getJSON(),
    })
      .then(() => {
        editor.commands.clearContent()
        editor.commands.focus()
      })
      .catch((e) => {
        toast.error(e.message)
        console.error(e)
      })
    setIsSubmitting(false)
  }

  const heightFromTop = 200

  const [replyToUserInfo, setReplyToUserInfo] = useState<ReplyToUserInfo>()

  return (
    <Col className="w-full">
      <Row
        className={
          'border-ink-200 bg-canvas-50 h-14 items-center gap-1 border-b'
        }
      >
        <BackButton className="self-stretch" />
        <MultipleOrSingleAvatars
          size="sm"
          spacing={0.5}
          startLeft={1}
          avatars={members ?? []}
          onClick={() => setShowUsers(true)}
        />
        {members && (
          <span
            className={'ml-1 cursor-pointer hover:underline'}
            onClick={() => setShowUsers(true)}
          >
            {members
              .map((user) => user.name.split(' ')[0].trim())
              .slice(0, 2)
              .join(', ')}
            {members.length > 2 && ` & ${members.length - 2} more`}
          </span>
        )}
        {members?.length == 1 && members[0].isBannedFromPosting && (
          <BannedBadge />
        )}
        <DropdownMenu
          className={'ml-auto [&_button]:p-4'}
          menuWidth={'w-44'}
          icon={<DotsVerticalIcon className="h-5 w-5" />}
          items={buildArray(
            {
              icon: <FaUserFriends className={'h-5 w-5'} />,
              name: 'See members',
              onClick: () => {
                setShowUsers(true)
              },
            },
            {
              icon: <GiSpeakerOff className="h-5 w-5" />,
              name: 'Mute 1 day',
              onClick: async () => {
                await toast.promise(
                  updatePrivateMessageChannel({
                    channelId: channelId,
                    notifyAfterTime: Date.now() + DAY_MS,
                  }),
                  {
                    loading: 'Muting for 1 day...',
                    success: 'Muted for 1 day',
                    error: 'Failed to mute',
                  }
                )
              },
            },
            {
              icon: <GiSpeakerOff className="h-5 w-5" />,
              name: 'Mute forever',
              onClick: async () => {
                await toast.promise(
                  updatePrivateMessageChannel({
                    channelId: channelId,
                    notifyAfterTime: Date.now() + 100 * YEAR_MS,
                  }),
                  {
                    loading: 'Muting forever...',
                    success: 'Muted forever',
                    error: 'Failed to mute',
                  }
                )
              },
            },
            {
              icon: <FaUserMinus className="h-5 w-5" />,
              name: 'Leave chat',
              onClick: async () => {
                await leavePrivateMessageChannel({ channelId: channelId })
                router.push('/messages')
              },
            }
          )}
        />
        {showUsers && (
          <Modal open={showUsers} setOpen={setShowUsers}>
            <Col className={clsx(MODAL_CLASS)}>
              {members?.map((user) => (
                <Row
                  key={user.id}
                  className={'w-full items-center justify-start gap-2'}
                >
                  <UserAvatarAndBadge user={user} />
                </Row>
              ))}
            </Col>
          </Modal>
        )}
      </Row>
      <Col className="relative h-[calc(100dvh-213px)]  lg:h-[calc(100dvh-184px)] xl:px-0">
        <div
          ref={outerDiv}
          className="relative h-full overflow-y-auto"
          style={{
            transform: isSafari ? 'translate3d(0, 0, 0)' : 'none',
          }}
        >
          <div
            className="relative px-1 pb-4 pt-1 transition-all duration-100"
            ref={innerDiv}
            style={{
              transform: isSafari ? 'translate3d(0, 0, 0)' : 'none',
              opacity: showMessages ? 1 : 0,
            }}
          >
            {realtimeMessages === undefined ? (
              <LoadingIndicator />
            ) : (
              <>
                <div
                  className={'absolute h-1 '}
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
                          ?.concat([user])
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
                        groupedMessages[i + 1]?.[0].userId ===
                        firstMessage.userId
                      }
                      firstOfUser={
                        groupedMessages[i - 1]?.[0].userId !==
                        firstMessage.userId
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
      </Col>
      <CommentInputTextArea
        autoFocus
        editor={editor}
        user={user}
        submit={submitMessage}
        isSubmitting={isSubmitting}
        submitOnEnter={!isMobile}
        replyTo={replyToUserInfo}
      />
    </Col>
  )
}

const setAsSeen = async (channelId: number) => {
  return api('set-channel-seen-time', { channelId })
}
