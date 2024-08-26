import {
  DotsHorizontalIcon,
  EyeOffIcon,
  FlagIcon,
  LinkIcon,
  PencilIcon,
  PlusCircleIcon,
  XCircleIcon,
} from '@heroicons/react/solid'
import clsx from 'clsx'
import { Bet } from 'common/bet'
import { ContractComment } from 'common/comment'
import { Contract } from 'common/contract'
import { formatMoney, formatPercent } from 'common/util/format'
import { BiRepost } from 'react-icons/bi'
import { TiPin } from 'react-icons/ti'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import { useDisplayUserById } from 'web/hooks/use-user-supabase'
import { CommentOnAnswer } from '../feed/comment-on-answer'
import {
  CopyLinkDateTimeComponent,
  copyLinkToComment,
  getCommentLink,
} from '../feed/copy-link-date-time'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { OutcomeLabel } from '../outcome-label'
import { UserHovercard } from '../user/user-hovercard'
import { InfoTooltip } from '../widgets/info-tooltip'
import { Tooltip } from '../widgets/tooltip'
import { UserLink } from '../widgets/user-link'
import { CommentEditHistoryButton } from './comment-edit-history-button'
import { commenterAndBettorMatch, roundThreadColor } from './comment'
import { usePrivateUser, useUser } from 'web/hooks/use-user'
import { isAdminId } from 'common/envs/constants'
import { buildArray } from 'common/util/array'
import { useState } from 'react'
import toast from 'react-hot-toast'
import { PiPushPinBold } from 'react-icons/pi'
import { useAdminOrMod } from 'web/hooks/use-admin'
import { api } from 'web/lib/api/api'
import { PaymentsModal } from 'web/pages/payments'
import TipJar from 'web/public/custom-components/tipJar'
import { AnnotateChartModal } from '../annotate-chart'
import { ReportModal } from '../buttons/report-button'
import DropdownMenu from './dropdown-menu'
import { EditCommentModal } from './edit-comment-modal'
import { RepostModal } from './repost-modal'

export function FeedCommentHeader(props: {
  comment: ContractComment
  contract: Contract
  updateComment?: (comment: Partial<ContractComment>) => void
  inTimeline?: boolean
  isParent?: boolean
  isPinned?: boolean
  className?: string
}) {
  const { comment, updateComment, contract, inTimeline, isPinned, className } =
    props
  const {
    userUsername,
    userName,
    createdTime,
    editedTime,
    betOutcome,
    betAnswerId,
    answerOutcome,
    betAmount,
    userId,
    isApi,
    bountyAwarded,
    isRepost,
    betOrderAmount,
    betLimitProb,
  } = comment

  const marketCreator = contract.creatorId === userId
  const { bought, money } = getBoughtMoney(betAmount)
  const shouldDisplayOutcome = betOutcome && !answerOutcome
  const isReplyToBet = betAmount !== undefined
  const commenterIsBettor = commenterAndBettorMatch(comment)
  const isLimitBet = betOrderAmount !== undefined && betLimitProb !== undefined
  return (
    <Col className={clsx('text-ink-600 text-sm', className)}>
      <Row className="justify-between">
        <Row className="gap-1">
          <UserHovercard userId={userId}>
            <UserLink
              user={{
                id: userId,
                name: userName,
                username: userUsername,
              }}
              marketCreator={inTimeline ? false : marketCreator}
              className={'font-semibold'}
            />
          </UserHovercard>
          {!commenterIsBettor || !isReplyToBet ? null : isLimitBet ? (
            <span className={'ml-1'}>
              {betAmount === betOrderAmount ? 'filled' : 'opened'} a{' '}
              <span className="text-ink-1000">
                {formatMoney(betOrderAmount)}
              </span>{' '}
              <OutcomeLabel
                outcome={betOutcome ? betOutcome : ''}
                answerId={betAnswerId}
                contract={contract}
                truncate="short"
              />{' '}
              at {formatPercent(betLimitProb)} order
            </span>
          ) : (
            <span>
              {bought} <span className="text-ink-1000">{money}</span>{' '}
              <OutcomeLabel
                outcome={betOutcome ? betOutcome : ''}
                answerId={betAnswerId}
                contract={contract}
                truncate="short"
              />
            </span>
          )}
          {isRepost && !inTimeline && (
            <span>
              <Tooltip text={'Reposted to followers'}>
                <BiRepost className=" inline h-4 w-4" />
                {commenterIsBettor ? '' : ' reposted'}
              </Tooltip>
            </span>
          )}
          {/* Hide my status if replying to a bet, it's too much clutter*/}
          {!isReplyToBet && !inTimeline && (
            <span className="text-ink-500">
              <CommentStatus contract={contract} comment={comment} />
              {bought} {money}
              {shouldDisplayOutcome && (
                <>
                  {' '}
                  of{' '}
                  <OutcomeLabel
                    outcome={betOutcome ? betOutcome : ''}
                    answerId={betAnswerId}
                    contract={contract}
                    truncate="short"
                  />
                </>
              )}
            </span>
          )}
          {editedTime ? (
            <CommentEditHistoryButton comment={comment} />
          ) : (
            <CopyLinkDateTimeComponent
              prefix={contract.creatorUsername}
              slug={contract.slug}
              createdTime={editedTime ? editedTime : createdTime}
              elementId={comment.id}
              size={'sm'}
              linkClassName="text-ink-500"
            />
          )}
          {!inTimeline && isApi && (
            <InfoTooltip text="Placed via API">🤖</InfoTooltip>
          )}
          {!inTimeline && updateComment && (
            <DotMenu
              updateComment={updateComment}
              comment={comment}
              contract={contract}
            />
          )}
        </Row>
        <Row className="gap-1">
          {bountyAwarded && bountyAwarded > 0 && (
            <span className="select-none text-teal-600">
              +{formatMoney(bountyAwarded)}
            </span>
          )}
          {isPinned && <TiPin className="text-primary-500 inline h-4 w-4" />}
        </Row>
      </Row>
    </Col>
  )
}

const getBoughtMoney = (betAmount: number | undefined) => {
  let bought: string | undefined
  let money: string | undefined
  if (betAmount != undefined) {
    bought = betAmount >= 0 ? 'bought' : 'sold'
    money = formatMoney(Math.abs(betAmount))
  }
  return { bought, money }
}

export function CommentReplyHeaderWithBet(props: {
  comment: ContractComment
  bet: Bet
  contract: Contract
}) {
  const { comment, bet, contract } = props
  const { outcome, answerId, amount, orderAmount, limitProb } = bet
  return (
    <CommentReplyHeader
      comment={{
        ...comment,
        betOutcome: outcome,
        betAmount: amount,
        betOrderAmount: orderAmount,
        betLimitProb: limitProb,
        answerOutcome: answerId,
      }}
      contract={contract}
    />
  )
}

export function CommentReplyHeader(props: {
  comment: ContractComment
  contract: Contract
  hideBetHeader?: boolean
}) {
  const { comment, contract, hideBetHeader } = props
  const {
    bettorName,
    bettorId,
    bettorUsername,
    betOutcome,
    betAnswerId,
    betAmount,
    answerOutcome,
    betOrderAmount,
    betLimitProb,
  } = comment
  if (
    (bettorId || (bettorUsername && bettorName)) &&
    betOutcome &&
    betAmount !== undefined &&
    !hideBetHeader
  ) {
    return (
      <ReplyToBetRow
        bettorId={bettorId}
        commenterIsBettor={commenterAndBettorMatch(comment)}
        betOutcome={betOutcome}
        bettorName={bettorName}
        bettorUsername={bettorUsername}
        betAnswerId={betAnswerId}
        betAmount={betAmount}
        betOrderAmount={betOrderAmount}
        betLimitProb={betLimitProb}
        contract={contract}
      />
    )
  }
  if (answerOutcome && 'answers' in contract) {
    const answer = contract.answers.find((a) => a.id === answerOutcome)
    if (answer) return <CommentOnAnswer answer={answer} />
  }

  return null
}

export function ReplyToBetRow(props: {
  contract: Contract
  commenterIsBettor: boolean
  betOutcome: string
  betAmount: number
  bettorId?: string
  bettorName?: string
  bettorUsername?: string
  betOrderAmount?: number
  betLimitProb?: number
  betAnswerId?: string
  clearReply?: () => void
}) {
  const {
    betOutcome,
    commenterIsBettor,
    betAmount,
    bettorUsername,
    bettorName,
    bettorId,
    betAnswerId,
    contract,
    clearReply,
    betLimitProb,
    betOrderAmount,
  } = props
  const { bought, money } = getBoughtMoney(betAmount)
  const user = useDisplayUserById(bettorId)

  const isLimitBet = betOrderAmount !== undefined && betLimitProb !== undefined
  const isMobile = useIsMobile()
  return (
    <Row className="mb-1 ml-4 items-end pr-2 text-sm">
      <div
        className={clsx(
          roundThreadColor,
          '-mb-1 h-5 w-6 rounded-tl-xl border-2 border-b-0 border-r-0'
        )}
      />
      <Row
        className={clsx(
          'bg-canvas-50 text-ink-600 relative items-center gap-1 px-2 py-1',
          isLimitBet ? 'flex-wrap' : 'whitespace-nowrap'
        )}
      >
        {!commenterIsBettor && bettorId && (
          <UserHovercard userId={bettorId}>
            <UserLink
              short={(isLimitBet || betAnswerId !== undefined) && isMobile}
              user={user}
            />
          </UserHovercard>
        )}
        {!commenterIsBettor && !bettorId && bettorName && bettorUsername && (
          <UserLink
            short={(isLimitBet || betAnswerId !== undefined) && isMobile}
            user={{
              id: bettorId ?? bettorName + bettorUsername,
              name: bettorName,
              username: bettorUsername,
            }}
          />
        )}
        {isLimitBet ? (
          <>
            {betAmount === betOrderAmount
              ? commenterIsBettor
                ? 'Filled'
                : 'filled'
              : commenterIsBettor
              ? 'Opened'
              : 'opened'}{' '}
            a
            <span className="text-ink-1000">{formatMoney(betOrderAmount)}</span>{' '}
            <OutcomeLabel
              outcome={betOutcome ? betOutcome : ''}
              answerId={betAnswerId}
              contract={contract}
              truncate="short"
            />{' '}
            at {formatPercent(betLimitProb)} order
          </>
        ) : (
          <>
            {bought}
            <span className="text-ink-1000">{money}</span>
            <OutcomeLabel
              outcome={betOutcome ? betOutcome : ''}
              answerId={betAnswerId}
              contract={contract}
              truncate="short"
            />
          </>
        )}
        {clearReply && (
          <button
            onClick={clearReply}
            className={
              'bg-canvas-0 text-ink-500 hover:text-ink-600 absolute -right-2 -top-1.5 rounded-full'
            }
          >
            <XCircleIcon className="h-4 w-4" />
          </button>
        )}
      </Row>
    </Row>
  )
}

function CommentStatus(props: {
  contract: Contract
  comment: ContractComment
}) {
  const { contract, comment } = props
  const { resolution } = contract
  const {
    commenterPositionProb,
    commenterPositionOutcome,
    commenterPositionAnswerId,
    commenterPositionShares,
  } = comment

  if (
    comment.betId == null &&
    commenterPositionProb != null &&
    commenterPositionOutcome != null &&
    commenterPositionShares != null &&
    commenterPositionShares > 0
  )
    return (
      <>
        {resolution ? 'predicted ' : `predicts `}
        <OutcomeLabel
          outcome={commenterPositionOutcome}
          answerId={commenterPositionAnswerId}
          contract={contract}
          truncate="short"
        />
      </>
    )

  return <span />
}

export function DotMenu(props: {
  comment: ContractComment
  updateComment: (update: Partial<ContractComment>) => void
  contract: Contract
}) {
  const { comment, updateComment, contract } = props
  const [isModalOpen, setIsModalOpen] = useState(false)
  const user = useUser()
  const privateUser = usePrivateUser()
  const isMod = useAdminOrMod()
  const isContractCreator = privateUser?.id === contract.creatorId
  const [editingComment, setEditingComment] = useState(false)
  const [tipping, setTipping] = useState(false)
  const [reposting, setReposting] = useState(false)
  const [annotating, setAnnotating] = useState(false)
  return (
    <>
      <ReportModal
        report={{
          contentOwnerId: comment.userId,
          contentId: comment.id,
          contentType: 'comment',
          parentId: contract.id,
          parentType: 'contract',
        }}
        setIsModalOpen={setIsModalOpen}
        isModalOpen={isModalOpen}
        label={'Comment'}
      />
      <DropdownMenu
        menuWidth={'w-36'}
        icon={
          <DotsHorizontalIcon
            className="mt-[0.12rem] h-4 w-4"
            aria-hidden="true"
          />
        }
        items={buildArray(
          {
            name: 'Copy link',
            icon: <LinkIcon className="h-5 w-5" />,
            onClick: () => {
              copyLinkToComment(
                contract.creatorUsername,
                contract.slug,
                comment.id
              )
            },
          },
          user && {
            name: 'Repost',
            icon: <BiRepost className="h-5 w-5" />,
            onClick: () => setReposting(true),
          },
          user &&
            comment.userId !== user.id && {
              name: 'Tip',
              icon: <TipJar size={20} color="currentcolor" />,
              onClick: () => setTipping(true),
            },
          user &&
            comment.userId !== user.id && {
              name: 'Report',
              icon: <FlagIcon className="h-5 w-5" />,
              onClick: () => {
                if (user?.id !== comment.userId) setIsModalOpen(true)
                else toast.error(`You can't report your own comment`)
              },
            },
          user &&
            (comment.userId === user.id || isAdminId(user?.id)) && {
              name: 'Edit',
              icon: <PencilIcon className="h-5 w-5" />,
              onClick: () => setEditingComment(true),
            },
          isContractCreator && {
            name: 'Add to chart',
            icon: <PlusCircleIcon className="h-5 w-5 text-green-500" />,
            onClick: async () => setAnnotating(true),
          },
          (isMod || isContractCreator) && {
            name: comment.hidden ? 'Unhide' : 'Hide',
            icon: <EyeOffIcon className="h-5 w-5 text-red-500" />,
            onClick: async () => {
              const commentPath = `contracts/${contract.id}/comments/${comment.id}`
              const wasHidden = comment.hidden
              updateComment({ hidden: !wasHidden })

              try {
                await api('hide-comment', { commentPath })
              } catch (e) {
                toast.error(
                  wasHidden ? 'Error unhiding comment' : 'Error hiding comment'
                )
                // undo optimistic update
                updateComment({ hidden: wasHidden })
              }
            },
          },
          (isMod || isContractCreator) && {
            name: comment.pinned ? 'Unpin' : 'Pin',
            icon: <PiPushPinBold className="text-primary-500 h-5 w-5" />,
            onClick: async () => {
              const commentPath = `contracts/${contract.id}/comments/${comment.id}`
              const wasPinned = comment.pinned
              updateComment({ pinned: !wasPinned })

              try {
                await api('pin-comment', { commentPath })
              } catch (e) {
                toast.error(
                  wasPinned ? 'Error pinning comment' : 'Error pinning comment'
                )
                // undo optimistic update
                updateComment({ pinned: wasPinned })
              }
            },
          }
        )}
      />
      {annotating && (
        <AnnotateChartModal
          open={annotating}
          setOpen={setAnnotating}
          contractId={contract.id}
          atTime={comment.createdTime}
          comment={comment}
        />
      )}
      {user && reposting && (
        <RepostModal
          contract={contract}
          open={reposting}
          setOpen={setReposting}
          comment={comment}
          bet={
            comment.betId
              ? ({
                  amount: comment.betAmount,
                  outcome: comment.betOutcome,
                  limitProb: comment.betLimitProb,
                  orderAmount: comment.betOrderAmount,
                  id: comment.betId,
                } as Bet)
              : undefined
          }
        />
      )}
      {user && editingComment && (
        <EditCommentModal
          user={user}
          comment={comment}
          setContent={(content) => updateComment({ content })}
          contract={contract}
          open={editingComment}
          setOpen={setEditingComment}
        />
      )}
      {user && tipping && (
        <PaymentsModal
          fromUser={user}
          toUser={{
            id: comment.userId,
            name: comment.userName,
            username: comment.userUsername,
            avatarUrl: comment.userAvatarUrl ?? '',
          }}
          setShow={setTipping}
          show={tipping}
          groupId={comment.id}
          defaultMessage={`Tip for comment on ${
            contract.question
          } ${getCommentLink(
            contract.creatorUsername,
            contract.slug,
            comment.id
          )}`}
        />
      )}
    </>
  )
}
