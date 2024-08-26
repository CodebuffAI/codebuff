import clsx from 'clsx'
import { User } from 'common/user'
import { parseJsonContentToText } from 'common/util/parse'
import Link from 'next/link'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { Row } from 'web/components/layout/row'
import NewMessageButton from 'web/components/messaging/new-message-button'
import { RelativeTimestamp } from 'web/components/relative-timestamp'
import { Title } from 'web/components/widgets/title'
import {
  usePrivateMessages,
  useSortedPrivateMessageMemberships,
  useUnseenPrivateMessageChannels,
} from 'web/hooks/use-private-messages'
import { useUser } from 'web/hooks/use-user'
import { useUsersInStore } from 'web/hooks/use-user-supabase'
import { useRedirectIfSignedOut } from 'web/hooks/use-redirect-if-signed-out'
import { MultipleOrSingleAvatars } from 'web/components/multiple-or-single-avatars'
import { BannedBadge } from 'web/components/widgets/user-link'
import { PrivateMessageChannel } from 'common/supabase/private-messages'

export default function MessagesPage() {
  useRedirectIfSignedOut()

  const currentUser = useUser()
  return (
    <Page trackPageView={'messages page'} className={'p-2'}>
      {currentUser && <MessagesContent currentUser={currentUser} />}
    </Page>
  )
}

export function MessagesContent(props: { currentUser: User }) {
  const { currentUser } = props
  const { channels, memberIdsByChannelId } = useSortedPrivateMessageMemberships(
    currentUser.id
  )
  const { lastSeenChatTimeByChannelId } = useUnseenPrivateMessageChannels(
    currentUser.id,
    true
  )

  return (
    <>
      <Row className="justify-between">
        <Title>Messages</Title>
        <NewMessageButton />
      </Row>
      <Col className={'w-full overflow-hidden'}>
        {channels && channels.length === 0 && (
          <div className={'text-ink-500 dark:text-ink-600 mt-4 text-center'}>
            You have no messages, yet.
          </div>
        )}
        {channels?.map((channel) => {
          const userIds = memberIdsByChannelId?.[channel.channel_id]?.map(
            (m) => m
          )
          if (!userIds) return null
          return (
            <MessageChannelRow
              key={channel.channel_id}
              otherUserIds={userIds}
              currentUser={currentUser}
              channel={channel}
              lastSeenTime={lastSeenChatTimeByChannelId[channel.channel_id]}
            />
          )
        })}
      </Col>
    </>
  )
}
export const MessageChannelRow = (props: {
  otherUserIds: string[]
  currentUser: User
  channel: PrivateMessageChannel
  lastSeenTime: string
}) => {
  const { otherUserIds, lastSeenTime, currentUser, channel } = props
  const channelId = channel.channel_id
  const otherUsers = useUsersInStore(otherUserIds, `${channelId}`, 100)
  const messages = usePrivateMessages(channelId, 1, currentUser.id)
  const unseen = (messages?.[0]?.createdTimeTs ?? '0') > lastSeenTime
  const chat = messages?.[0]
  const numOthers = otherUsers?.length ?? 0

  const isBanned = otherUsers?.length == 1 && otherUsers[0].isBannedFromPosting
  return (
    <Link
      className="hover:bg-canvas-0 rounded p-2 transition-colors"
      key={channelId}
      href={'/messages/' + channelId}
    >
      <Row className={'items-center gap-3 rounded-md'}>
        <MultipleOrSingleAvatars
          size="md"
          spacing={numOthers === 2 ? 0.3 : 0.15}
          startLeft={numOthers === 2 ? 2.2 : 1.2}
          avatars={otherUsers ?? []}
          className={numOthers > 1 ? '-ml-2' : ''}
        />
        <Col className={'w-full'}>
          <Row className={'items-center justify-between'}>
            <span className={'font-semibold'}>
              {otherUsers && (
                <span>
                  {otherUsers
                    .map((user) => user.name.split(' ')[0].trim())
                    .slice(0, 2)
                    .join(', ')}
                  {otherUsers.length > 2 && ` & ${otherUsers.length - 2} more`}
                </span>
              )}
              {isBanned && <BannedBadge />}
            </span>
            <span className={'text-ink-400 dark:text-ink-500 text-xs'}>
              {chat && <RelativeTimestamp time={chat.createdTime} />}
            </span>
          </Row>
          <Row className="items-center justify-between gap-1">
            <span
              className={clsx(
                'line-clamp-1 h-5 text-sm',
                unseen ? '' : 'text-ink-500 dark:text-ink-600'
              )}
            >
              {chat && (
                <>
                  {chat.userId == currentUser.id && 'You: '}
                  {parseJsonContentToText(chat.content)}
                </>
              )}
            </span>
            {unseen && (
              <div
                className={clsx(
                  'text-canvas-0 bg-primary-500 h-4 min-w-[15px] rounded-full p-[2px] text-center text-[10px] '
                )}
              />
            )}
          </Row>
        </Col>
      </Row>
    </Link>
  )
}
