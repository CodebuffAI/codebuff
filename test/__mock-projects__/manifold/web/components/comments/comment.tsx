import clsx from 'clsx'
import { memo, ReactNode, useEffect, useMemo, useRef, useState } from 'react'

import { Bet } from 'common/bet'
import { ContractComment } from 'common/comment'
import { Contract } from 'common/contract'
import { CommentView } from 'common/events'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Avatar } from 'web/components/widgets/avatar'
import { useIsVisible } from 'web/hooks/use-is-visible'
import { track } from 'web/lib/service/analytics'
import { scrollIntoViewCentered } from 'web/lib/util/scroll'
import { ReplyToggle } from './reply-toggle'
import { Content } from '../widgets/editor'
import { usePartialUpdater } from 'web/hooks/use-partial-updater'
import { FeedReplyBet } from 'web/components/feed/feed-bets'
import { HOUR_MS } from 'common/util/time'
import { last, orderBy, sumBy } from 'lodash'
import { UserHovercard } from '../user/user-hovercard'
import Link from 'next/link'
import { CommentReplyHeader, FeedCommentHeader } from './comment-header'
import { CommentActions } from './comment-actions'

export type ReplyToUserInfo = { id: string; username: string }

export const roundThreadColor = 'border-ink-100 dark:border-ink-300'
const straightThreadColor = 'bg-ink-100 dark:bg-ink-300'

export const FeedComment = memo(function FeedComment(props: {
  contract: Contract
  comment: ContractComment
  trackingLocation: string
  highlighted?: boolean
  onReplyClick?: (comment: ContractComment) => void
  children?: ReactNode
  inTimeline?: boolean
  isParent?: boolean
  bets?: Bet[]
  lastInReplyChain?: boolean
  isPinned?: boolean
  showParentLine?: boolean
}) {
  const {
    contract,
    highlighted,
    onReplyClick,
    children,
    trackingLocation,
    inTimeline,
    isParent,
    bets,
    lastInReplyChain,
    isPinned,
    showParentLine,
  } = props
  // for optimistic updates
  const [comment, updateComment] = usePartialUpdater(props.comment)
  useEffect(() => updateComment(props.comment), [props.comment])

  const groupedBets = useMemo(() => {
    // Sort the bets by createdTime
    const sortedBets = orderBy(bets, 'createdTime', 'asc')

    const tempGrouped: Bet[][] = []
    sortedBets.forEach((currentBet) => {
      // Check if the bet was made within the last 2 hours
      const isRecentBet = Date.now() - currentBet.createdTime < 2 * HOUR_MS

      if (isRecentBet) {
        // If the bet was made within the last 2 hours, add it as an individual group
        tempGrouped.push([currentBet])
        return
      }
      let foundGroup = false
      for (const group of tempGrouped) {
        const lastBetInGroup = last(group)
        if (!lastBetInGroup) break
        const outcomesMatch = currentBet.outcome === lastBetInGroup.outcome
        const sameSign =
          Math.sign(currentBet.amount) === Math.sign(lastBetInGroup.amount)

        if (outcomesMatch && sameSign) {
          group.push(currentBet)
          foundGroup = true
          break
        }
      }
      if (!foundGroup) tempGrouped.push([currentBet])
    })
    updateComment({
      betReplyAmountsByOutcome: {
        YES: sumBy(
          bets?.filter((bet) => bet.outcome === 'YES'),
          'amount'
        ),
        NO: sumBy(
          bets?.filter((bet) => bet.outcome === 'NO'),
          'amount'
        ),
      },
    })
    return tempGrouped
  }, [bets?.length])

  const { userUsername, userAvatarUrl, userId } = comment
  const ref = useRef<HTMLDivElement>(null)
  const isBetParent = !!bets?.length

  useEffect(() => {
    if (highlighted && ref.current) {
      scrollIntoViewCentered(ref.current)
    }
  }, [highlighted])

  return (
    <Col className="group">
      <CommentReplyHeader
        hideBetHeader={commenterAndBettorMatch(comment)}
        comment={comment}
        contract={contract}
      />
      <Row ref={ref} className={clsx(isParent ? 'gap-2' : 'gap-1')}>
        <Row className="relative">
          {/*// Curved reply line*/}
          {!isParent && (
            <div
              className={clsx(
                roundThreadColor,
                '-mt-4 ml-4 h-6 w-4 rounded-bl-xl border-b-2 border-l-2'
              )}
            />
          )}
          <UserHovercard userId={userId} className="z-10 self-start">
            <Avatar
              username={userUsername}
              size={isParent ? 'sm' : '2xs'}
              avatarUrl={userAvatarUrl}
            />
          </UserHovercard>

          {/* Outer vertical reply line*/}
          {(showParentLine || !isParent) && (
            <div
              className={clsx(
                straightThreadColor,
                'absolute bottom-0 left-4 w-0.5',
                isParent ? 'top-0' : '-top-1',
                !isBetParent && 'group-last:hidden',
                lastInReplyChain && 'hidden'
              )}
            />
          )}

          {/* Inner vertical reply line*/}
          {isBetParent && !isParent && (
            <div
              className={clsx(
                straightThreadColor,
                'absolute bottom-0 left-10 top-0 w-0.5'
              )}
            />
          )}
        </Row>

        <Col
          className={clsx(
            'grow rounded-lg rounded-tl-none px-3 pb-0.5 pt-1 transition-colors',
            highlighted
              ? 'bg-primary-100 border-primary-300 border-2'
              : isPinned
              ? 'bg-canvas-50 border-primary-300 border-2'
              : 'bg-canvas-50'
          )}
        >
          <FeedCommentHeader
            comment={comment}
            updateComment={updateComment}
            contract={contract}
            inTimeline={inTimeline}
            isParent={isParent}
            isPinned={isPinned}
          />

          <HideableContent comment={comment} />
          <Row>
            {children}
            <CommentActions
              onReplyClick={onReplyClick}
              onAward={(total) => updateComment({ bountyAwarded: total })}
              comment={comment}
              contract={contract}
              trackingLocation={trackingLocation}
            />
          </Row>
        </Col>
      </Row>
      {!!bets?.length && (
        <Row>
          <Col className={'w-full'}>
            {groupedBets?.map((bets, i) => {
              return (
                <Row
                  className={'relative mt-1 w-full'}
                  key={bets.map((b) => b.id) + '-reply'}
                >
                  {/* Curved bet reply line*/}
                  <div
                    className={clsx(
                      roundThreadColor,
                      'rounded-bl-xl border-b-2 border-l-2 ',
                      isParent ? '-mt-2 ml-4 h-4 w-4' : '-mt-7 ml-10 h-10 w-4'
                    )}
                  />
                  {/* Outer vertical bet reply line */}
                  <div
                    className={clsx(
                      straightThreadColor,
                      'absolute bottom-0 left-4 w-0.5 group-last:hidden ',
                      i === groupedBets.length - 1 && 'hidden',
                      isParent ? 'top-0' : '-top-1'
                    )}
                  />
                  <FeedReplyBet
                    className={'bg-canvas-50'}
                    avatarSize={'2xs'}
                    contract={contract}
                    bets={bets}
                  />
                </Row>
              )
            })}
          </Col>
        </Row>
      )}
    </Col>
  )
})

export const ParentFeedComment = memo(function ParentFeedComment(props: {
  contract: Contract
  comment: ContractComment
  highlighted?: boolean
  seeReplies: boolean
  numReplies: number
  onReplyClick?: (comment: ContractComment) => void
  onSeeReplyClick?: () => void
  trackingLocation: string
  inTimeline?: boolean
  childrenBountyTotal?: number
  bets?: Bet[]
  isPinned?: boolean
}) {
  const {
    contract,
    comment,
    highlighted,
    onReplyClick,
    onSeeReplyClick,
    seeReplies,
    numReplies,
    trackingLocation,
    inTimeline,
    childrenBountyTotal,
    bets,
    isPinned,
  } = props
  const { ref } = useIsVisible(
    () =>
      track('view comment thread', {
        contractId: contract.id,
        commentId: comment.id,
      } as CommentView),
    false
  )

  return (
    <FeedComment
      contract={contract}
      comment={comment}
      onReplyClick={onReplyClick}
      highlighted={highlighted}
      trackingLocation={trackingLocation}
      inTimeline={inTimeline}
      isParent={true}
      bets={bets}
      isPinned={isPinned}
      showParentLine={seeReplies && numReplies > 0}
    >
      {isPinned && (
        <Link
          className="self-center text-xs text-gray-400 hover:text-indigo-400 hover:underline"
          href={`#${comment.id}`}
        >
          View original context
        </Link>
      )}

      <div ref={ref} />

      <ReplyToggle
        seeReplies={seeReplies}
        numComments={numReplies}
        childrenBountyTotal={childrenBountyTotal}
        onSeeReplyClick={onSeeReplyClick}
      />
    </FeedComment>
  )
})

function HideableContent(props: { comment: ContractComment }) {
  const { comment } = props
  const { text, content } = comment
  const [showHidden, setShowHidden] = useState(false)
  return comment.hidden && !showHidden ? (
    <div
      className="hover text-ink-600 text-sm font-thin italic hover:cursor-pointer"
      onClick={() => {
        setShowHidden(!showHidden)
      }}
    >
      Comment hidden
    </div>
  ) : (
    <Content size="sm" className="mt-1 grow" content={content || text} />
  )
}

export const commenterAndBettorMatch = (c: ContractComment) =>
  c.bettorUsername === c.userUsername || c.bettorId === c.userId
