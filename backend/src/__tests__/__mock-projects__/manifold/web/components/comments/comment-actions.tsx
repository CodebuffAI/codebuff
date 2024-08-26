import { ReplyIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import { ContractComment } from 'common/comment'
import { Contract } from 'common/contract'
import { richTextToString } from 'common/util/parse'
import { useState } from 'react'
import { FaArrowTrendUp, FaArrowTrendDown } from 'react-icons/fa6'
import { useUser, usePrivateUser, isBlocked } from 'web/hooks/use-user'
import { BuyPanel } from '../bet/bet-panel'
import { IconButton } from '../buttons/button'
import { LikeButton } from '../contract/like-button'
import { Col } from '../layout/col'
import { Modal, MODAL_CLASS } from '../layout/modal'
import { Row } from '../layout/row'
import { Tooltip } from '../widgets/tooltip'
import { track } from 'web/lib/service/analytics'
import { AwardBountyButton } from '../contract/bountied-question'
import { TRADE_TERM } from 'common/envs/constants'

export function CommentActions(props: {
  onReplyClick?: (comment: ContractComment) => void
  onAward?: (bountyTotal: number) => void
  comment: ContractComment
  contract: Contract
  trackingLocation: string
}) {
  const { onReplyClick, onAward, comment, contract, trackingLocation } = props
  const user = useUser()
  const privateUser = usePrivateUser()

  const isBountiedQuestion = contract.outcomeType === 'BOUNTIED_QUESTION'
  const canGiveBounty =
    isBountiedQuestion &&
    user &&
    user.id == contract.creatorId &&
    comment.userId != user.id &&
    onAward
  const [showBetModal, setShowBetModal] = useState(false)
  const [outcome, setOutcome] = useState<'YES' | 'NO' | undefined>(undefined)
  const diff =
    (comment.betReplyAmountsByOutcome?.YES ?? 0) -
    (comment.betReplyAmountsByOutcome?.NO ?? 0)
  return (
    <Row className="grow items-center justify-end">
      {canGiveBounty && (
        <AwardBountyButton
          contract={contract}
          comment={comment}
          onAward={onAward}
          user={user}
          disabled={contract.bountyLeft <= 0}
          buttonClassName={'mr-1'}
        />
      )}
      {user && contract.outcomeType === 'BINARY' && (
        <IconButton
          onClick={() => {
            // TODO: Twomba tracking bet terminology
            track('bet intent', { location: 'comment on contract' })
            setOutcome('YES')
            setShowBetModal(true)
          }}
          size={'xs'}
        >
          <Tooltip text={`Reply with a ${TRADE_TERM}`} placement="bottom">
            <Row className={'mt-0.5 gap-1'}>
              {diff != 0 && (
                <span className="">{Math.round(Math.abs(diff))}</span>
              )}
              {diff > 0 ? (
                <FaArrowTrendUp className={'h-5 w-5 text-teal-500'} />
              ) : diff < 0 ? (
                <FaArrowTrendDown className={'text-scarlet-500 h-5 w-5'} />
              ) : (
                <FaArrowTrendUp className={'h-5 w-5'} />
              )}
            </Row>
          </Tooltip>
        </IconButton>
      )}
      {user && onReplyClick && (
        <IconButton
          size={'xs'}
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onReplyClick(comment)
          }}
          className={'text-ink-500'}
        >
          <Tooltip text="Reply with a comment" placement="bottom">
            <ReplyIcon className="h-5 w-5 " />
          </Tooltip>
        </IconButton>
      )}
      <LikeButton
        contentCreatorId={comment.userId}
        contentId={comment.id}
        user={user}
        contentType={'comment'}
        size={'xs'}
        contentText={richTextToString(comment.content)}
        disabled={isBlocked(privateUser, comment.userId)}
        trackingLocation={trackingLocation}
      />
      {showBetModal && (
        <Modal
          open={showBetModal}
          setOpen={setShowBetModal}
          className={clsx(
            MODAL_CLASS,
            'pointer-events-auto max-h-[32rem] overflow-auto'
          )}
        >
          <Col>
            <span className={'text-primary-700 mb-4 line-clamp-2 text-lg'}>
              @{comment.userUsername}: {richTextToString(comment.content)}
            </span>
            <BuyPanel
              contract={contract as any}
              initialOutcome={outcome}
              onBuySuccess={() => setTimeout(() => setShowBetModal(false), 500)}
              location={'comment on contract'}
              inModal={true}
              replyToCommentId={comment.id}
              alwaysShowOutcomeSwitcher={true}
            />
          </Col>
        </Modal>
      )}
    </Row>
  )
}
