import { HeartIcon } from '@heroicons/react/outline'
import clsx from 'clsx'
import { Reaction, ReactionContentTypes } from 'common/reaction'
import { User } from 'common/user'
import { memo, useEffect, useState } from 'react'
import { useLikesOnContent } from 'web/hooks/use-likes'
import useLongTouch from 'web/hooks/use-long-touch'
import { like, unLike } from 'web/lib/supabase/reactions'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import {
  MultiUserLinkInfo,
  MultiUserTransactionModal,
} from '../multi-user-transaction-link'
import { Avatar } from '../widgets/avatar'
import { Tooltip } from '../widgets/tooltip'
import { UserLink } from '../widgets/user-link'
import { LoadingIndicator } from '../widgets/loading-indicator'
import { Button, SizeType } from 'web/components/buttons/button'
import toast from 'react-hot-toast'
import { track } from 'web/lib/service/analytics'
import { buildArray } from 'common/util/array'
import { UserHovercard } from '../user/user-hovercard'
import { removeUndefinedProps } from 'common/util/object'
import { useUsers } from 'web/hooks/use-user-supabase'
import { DisplayUser } from 'common/api/user-types'
import { TWOMBA_ENABLED } from 'common/envs/constants'

const LIKES_SHOWN = 3

export const LikeButton = memo(function LikeButton(props: {
  contentId: string
  contentCreatorId: string
  user: User | null | undefined
  contentType: ReactionContentTypes
  contentText: string
  trackingLocation: string
  className?: string
  placement?: 'top' | 'bottom'
  size?: SizeType
  disabled?: boolean
  feedReason?: string
  contractId?: string
  commentId?: string
}) {
  const {
    user,
    contentType,
    contentCreatorId,
    contentId,
    contentText,
    className,
    trackingLocation,
    placement = 'bottom',
    feedReason,
    size,
    contractId,
    commentId,
  } = props
  const likes = useLikesOnContent(contentType, contentId)
  const [liked, setLiked] = useState(false)
  useEffect(() => {
    if (likes) setLiked(likes.some((l) => l.user_id === user?.id))
  }, [likes, user])

  const totalLikes =
    (likes ? likes.filter((l) => l.user_id != user?.id).length : 0) +
    (liked ? 1 : 0)

  const disabled = props.disabled || !user
  const isMe = contentCreatorId === user?.id
  const [modalOpen, setModalOpen] = useState(false)

  const onLike = async (shouldLike: boolean) => {
    if (!user) return
    setLiked(shouldLike)
    if (shouldLike) {
      await like(contentId, contentType)

      track(
        'like',
        removeUndefinedProps({
          itemId: contentId,
          location: trackingLocation,
          contractId:
            contractId ?? (contentType === 'contract' ? contentId : undefined),
          commentId:
            commentId ?? (contentType === 'comment' ? contentId : undefined),
          feedReason,
        })
      )
    } else {
      await unLike(contentId, contentType)
    }
  }

  function handleLiked(liked: boolean) {
    onLike(liked)
  }

  const likeLongPress = useLongTouch(
    () => {
      setModalOpen(true)
    },
    () => {
      if (!disabled) {
        if (isMe) {
          toast("Of course you'd like yourself", { icon: '🙄' })
        } else {
          handleLiked(!liked)
        }
      }
    }
  )

  const otherLikes = liked ? totalLikes - 1 : totalLikes
  const showList = otherLikes > 0

  return (
    <>
      <Tooltip
        text={
          showList ? (
            <UserLikedPopup
              contentType={contentType}
              contentId={contentId}
              onRequestModal={() => setModalOpen(true)}
              user={user}
              userLiked={liked}
            />
          ) : (
            'Like'
          )
        }
        placement={placement}
        noTap
        hasSafePolygon={showList}
        className="flex items-center"
      >
        {TWOMBA_ENABLED && trackingLocation == 'contract page' ? (
          <button
            disabled={disabled}
            className={clsx(
              'disabled:cursor-not-allowed',
              'disabled:text-ink-500',
              className
            )}
            {...likeLongPress}
          >
            <Row className={'items-center gap-0.5'}>
              <div className="relative">
                <HeartIcon
                  className={clsx(
                    'stroke-ink-500 h-4 w-4',
                    liked &&
                      'fill-scarlet-200 stroke-scarlet-300 dark:stroke-scarlet-600'
                  )}
                />
              </div>
              {totalLikes > 0 && (
                <div className=" text-sm disabled:opacity-50">{totalLikes}</div>
              )}
            </Row>
          </button>
        ) : (
          <Button
            color={'gray-white'}
            disabled={disabled}
            size={size}
            className={clsx(
              'text-ink-500 disabled:cursor-not-allowed',
              'disabled:text-ink-500',
              className
            )}
            {...likeLongPress}
          >
            <Row className={'items-center gap-1.5'}>
              <div className="relative">
                <HeartIcon
                  className={clsx(
                    'h-6 w-6',
                    liked &&
                      'fill-scarlet-200 stroke-scarlet-300 dark:stroke-scarlet-600'
                  )}
                />
              </div>
              {totalLikes > 0 && (
                <div className="text-ink-500 my-auto h-5  text-sm disabled:opacity-50">
                  {totalLikes}
                </div>
              )}
            </Row>
          </Button>
        )}
      </Tooltip>
      {modalOpen && (
        <UserLikedFullList
          contentType={contentType}
          contentId={contentId}
          user={user}
          userLiked={liked}
          setOpen={setModalOpen}
          titleName={contentText}
        />
      )}
    </>
  )
})

function useLikeDisplayList(
  reacts: Reaction[] = [],
  self?: User | null,
  prependSelf?: boolean
) {
  const users = useUsers(reacts.map((r) => r.user_id))

  return buildArray([
    prependSelf && self,
    users?.filter((u): u is DisplayUser => !!u && u.id !== self?.id),
  ])
}

function UserLikedFullList(props: {
  contentType: ReactionContentTypes
  contentId: string
  user?: User | null
  userLiked?: boolean
  setOpen: (isOpen: boolean) => void
  titleName?: string
}) {
  const { contentType, contentId, user, userLiked, setOpen, titleName } = props
  const reacts = useLikesOnContent(contentType, contentId)
  const displayInfos = useLikeDisplayList(reacts, user, userLiked)

  return (
    <MultiUserTransactionModal
      userInfos={displayInfos}
      modalLabel={
        <span>
          💖 Liked{' '}
          <span className="font-bold">
            {titleName
              ? titleName
              : contentType === 'contract'
              ? 'this question'
              : `this ${contentType}`}
          </span>
        </span>
      }
      open={true}
      setOpen={setOpen}
      short={true}
    />
  )
}

function UserLikedPopup(props: {
  contentType: ReactionContentTypes
  contentId: string
  onRequestModal: () => void
  user?: User | null
  userLiked?: boolean
}) {
  const { contentType, contentId, onRequestModal, user, userLiked } = props
  const reacts = useLikesOnContent(contentType, contentId)
  const displayInfos = useLikeDisplayList(reacts, user, userLiked)

  if (displayInfos == null) {
    return (
      <Col className="min-w-[6rem] items-start">
        <div className="mb-1 font-bold">Like</div>
        <LoadingIndicator className="mx-auto my-2" size="sm" />
      </Col>
    )
  }

  // only show "& n more" for n > 1
  const shown =
    displayInfos.length <= LIKES_SHOWN + 1
      ? displayInfos
      : displayInfos.slice(0, LIKES_SHOWN)

  return (
    <Col className="min-w-[6rem] items-start">
      <div className="mb-1 font-bold">Like</div>
      {shown.map((u, i) => {
        return <UserLikedItem key={i} userInfo={u} />
      })}
      {displayInfos.length > shown.length && (
        <div
          className="text-primary-300 hover:text-primary-200 w-full cursor-pointer text-left"
          onClick={onRequestModal}
        >
          & {displayInfos.length - shown.length} more
        </div>
      )}
    </Col>
  )
}

function UserLikedItem(props: { userInfo: MultiUserLinkInfo }) {
  const { userInfo } = props
  return (
    <UserHovercard userId={userInfo.id}>
      <Row className="items-center gap-1.5">
        <Avatar
          username={userInfo.username}
          avatarUrl={userInfo.avatarUrl}
          size="2xs"
        />
        <UserLink user={userInfo} short={true} />
      </Row>
    </UserHovercard>
  )
}
