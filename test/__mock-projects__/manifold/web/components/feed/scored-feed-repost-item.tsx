import { ContractComment } from 'common/comment'
import { Contract, contractPath } from 'common/contract'
import {
  CommentReplyHeaderWithBet,
  FeedCommentHeader,
} from '../comments/comment-header'
import { Col } from '../layout/col'
import clsx from 'clsx'
import { memo, useState } from 'react'
import { Row } from 'web/components/layout/row'
import { Avatar } from 'web/components/widgets/avatar'
import { FeedContractCard } from 'web/components/contract/feed-contract-card'
import { PrivateUser, User } from 'common/user'
import { TradesButton } from 'web/components/contract/trades-button'
import { TbDropletHeart, TbMoneybag } from 'react-icons/tb'
import { ENV_CONFIG } from 'common/envs/constants'
import { shortFormatNumber } from 'common/util/format'
import { Button } from 'web/components/buttons/button'
import { Tooltip } from 'web/components/widgets/tooltip'
import { LikeButton } from 'web/components/contract/like-button'
import { richTextToString } from 'common/util/parse'
import { isBlocked, usePrivateUser } from 'web/hooks/use-user'
import { CommentsButton } from 'web/components/comments/comments-button'
import router from 'next/router'
import { ClickFrame } from 'web/components/widgets/click-frame'
import { CardReason } from 'web/components/feed/card-reason'
import { UserHovercard } from '../user/user-hovercard'
import { track } from 'web/lib/service/analytics'
import { removeUndefinedProps } from 'common/util/object'
import { Bet } from 'common/bet'
import { FeedDropdown } from 'web/components/feed/card-dropdown'
import { Repost } from 'common/repost'
import { CollapsibleContent } from 'web/components/widgets/collapsible-content'

export const ScoredFeedRepost = memo(function (props: {
  contract: Contract
  comment: ContractComment
  repost: Repost
  bet?: Bet
  trackingLocation: string
  user: User | null | undefined
  hide: () => void
}) {
  const { contract, user, repost, bet, hide, comment } = props
  const privateUser = usePrivateUser()
  const { userUsername, userAvatarUrl, userId } = comment
  const [hoveringChildContract, setHoveringChildContract] = useState(false)
  const commenterIsBettor = bet?.userId === comment.userId
  const creatorRepostedTheirComment = repost.user_id === comment.userId
  const showTopLevelRow =
    (!commenterIsBettor && !!bet) || !creatorRepostedTheirComment
  const trackClick = () =>
    track(
      'click market card feed',
      removeUndefinedProps({
        contractId: contract.id,
        creatorId: contract.creatorId,
        slug: contract.slug,
        commentId: comment.id,
      })
    )

  return (
    <Col
      className={clsx(
        'bg-canvas-0 ring- ring-primary-200 group rounded-lg p-4',
        hoveringChildContract ? '' : 'hover:ring-1'
      )}
    >
      <ClickFrame
        onClick={() => {
          trackClick()
          router.push(`${contractPath(contract)}#${comment.id}`)
        }}
      >
        <RepostLabel
          showTopLevelRow={showTopLevelRow}
          creatorRepostedTheirComment={creatorRepostedTheirComment}
          bet={bet}
          comment={comment}
          contract={contract}
          hide={hide}
          commenterIsBettor={commenterIsBettor}
          repost={repost}
        />
        <Col className={'w-full gap-2'}>
          <Col className={'w-full pl-1 pr-2  transition-colors'}>
            <Row className="w-full items-center justify-between">
              <Row className="min-w-0 flex-shrink items-center gap-1 overflow-hidden">
                <UserHovercard userId={userId}>
                  <Avatar
                    username={userUsername}
                    size={'xs'}
                    avatarUrl={userAvatarUrl}
                  />
                </UserHovercard>
                <div className="min-w-0 flex-1 overflow-hidden">
                  <FeedCommentHeader
                    comment={comment}
                    contract={contract}
                    inTimeline={true}
                    className="truncate"
                  />
                </div>
              </Row>
              {(commenterIsBettor || !bet) && !showTopLevelRow && (
                <Row className={' justify-end gap-2'}>
                  <FeedDropdown
                    contract={contract}
                    itemCreatorId={repost.user_id}
                    interesting={true}
                    toggleInteresting={hide}
                    importanceScore={props.contract.importanceScore}
                  />
                </Row>
              )}
            </Row>
            <CollapsibleContent
              mediaSize={'md'}
              content={comment.content}
              defaultCollapse={true}
              stateKey={'collapse-repost-' + repost.id + contract.id}
              showMorePlacement={'bottom'}
            />
          </Col>
          <Col
            onMouseEnter={() => setHoveringChildContract(true)}
            onMouseLeave={() => setHoveringChildContract(false)}
          >
            <FeedContractCard
              contract={contract}
              trackingPostfix="feed"
              className="ring-ink-100 dark:ring-ink-300 hover:ring-primary-200 dark:hover:ring-primary-200 max-w-full pb-2 ring-1 "
              hideBottomRow={true}
              size={'xs'}
            />
          </Col>
          <BottomActionRow
            className={'ml-4'}
            contract={contract}
            user={user}
            comment={comment}
            privateUser={privateUser}
          />
        </Col>
      </ClickFrame>
    </Col>
  )
})

function RepostLabel(props: {
  showTopLevelRow: boolean
  creatorRepostedTheirComment: boolean
  bet?: Bet
  comment: ContractComment
  contract: Contract
  hide: () => void
  commenterIsBettor: boolean
  repost: Repost
}) {
  const {
    showTopLevelRow,
    creatorRepostedTheirComment,
    bet,
    comment,
    contract,
    hide,
    commenterIsBettor,
    repost,
  } = props
  if (showTopLevelRow && creatorRepostedTheirComment)
    return (
      <Row className="grow-x bg-canvas-100/50 -mx-4 -mt-4 mb-3 rounded-t-lg px-4 pb-1 pt-2">
        {bet && (
          <CommentReplyHeaderWithBet
            comment={comment}
            contract={contract}
            bet={bet}
          />
        )}
        <FeedDropdown
          contract={contract}
          itemCreatorId={repost.user_id}
          interesting={true}
          toggleInteresting={hide}
          importanceScore={props.contract.importanceScore}
        />
      </Row>
    )

  if (showTopLevelRow && !creatorRepostedTheirComment) {
    return (
      <Col className="grow-x bg-canvas-100/50 -mx-4 -mt-4 mb-3 rounded-t-lg px-4 pb-1 pt-2">
        <Row className={'mb-1 w-full justify-between gap-1'}>
          <CardReason
            repost={repost}
            reason={'reposted'}
            className="text-ink-600"
          />
          <FeedDropdown
            contract={contract}
            itemCreatorId={repost.user_id}
            interesting={true}
            toggleInteresting={hide}
            importanceScore={props.contract.importanceScore}
          />
        </Row>
        {!commenterIsBettor && bet && (
          <CommentReplyHeaderWithBet
            comment={comment}
            contract={contract}
            bet={bet}
          />
        )}
      </Col>
    )
  }
  return <></>
}

export const BottomActionRow = (props: {
  contract: Contract
  comment: ContractComment
  user: User | null | undefined
  privateUser: PrivateUser | null | undefined
  className?: string
}) => {
  const { contract, className, comment, privateUser, user } = props

  return (
    <Row className={clsx('justify-between pt-2', 'pb-2', className)}>
      <BottomRowButtonWrapper>
        <TradesButton contract={contract} className={'h-full'} />
      </BottomRowButtonWrapper>

      {contract.outcomeType === 'BOUNTIED_QUESTION' && (
        <BottomRowButtonWrapper>
          <div className="text-ink-500 z-10 flex items-center gap-1.5 text-sm">
            <TbMoneybag className="h-6 w-6 stroke-2" />
            <div>
              {ENV_CONFIG.moneyMoniker}
              {shortFormatNumber(contract.bountyLeft)}
            </div>
          </div>
        </BottomRowButtonWrapper>
      )}

      {/* cpmm markets */}
      {'totalLiquidity' in contract && (
        <BottomRowButtonWrapper>
          <Button
            disabled={true}
            size={'2xs'}
            color={'gray-white'}
            className={'disabled:cursor-pointer'}
          >
            <Tooltip text={`Total liquidity`} placement="top" noTap>
              <Row
                className={'text-ink-500 h-full items-center gap-1.5 text-sm'}
              >
                <TbDropletHeart className="h-6 w-6 stroke-2" />
                <div>
                  {ENV_CONFIG.moneyMoniker}
                  {shortFormatNumber(contract.totalLiquidity)}
                </div>
              </Row>
            </Tooltip>
          </Button>
        </BottomRowButtonWrapper>
      )}

      <BottomRowButtonWrapper>
        <CommentsButton
          highlightCommentId={comment.id}
          contract={contract}
          user={user}
        />
      </BottomRowButtonWrapper>
      <BottomRowButtonWrapper>
        <LikeButton
          contentCreatorId={comment.userId}
          contentId={comment.id}
          user={user}
          contentType={'comment'}
          size={'xs'}
          contentText={richTextToString(comment.content)}
          disabled={isBlocked(privateUser, comment.userId)}
          trackingLocation={'feed'}
          contractId={contract.id}
          commentId={comment.id}
          feedReason={'repost'}
        />
      </BottomRowButtonWrapper>
    </Row>
  )
}
const BottomRowButtonWrapper = (props: { children: React.ReactNode }) => {
  return (
    <Row className="basis-10 justify-start whitespace-nowrap">
      {props.children}
    </Row>
  )
}
