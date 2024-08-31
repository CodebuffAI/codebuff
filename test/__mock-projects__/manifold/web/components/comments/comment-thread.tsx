import clsx from 'clsx'
import { Bet } from 'common/bet'
import { ContractComment } from 'common/comment'
import { Contract } from 'common/contract'
import { useState } from 'react'
import { useEvent } from 'web/hooks/use-event'
import { Button } from '../buttons/button'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import {
  ReplyToUserInfo,
  ParentFeedComment,
  FeedComment,
  roundThreadColor,
} from './comment'
import { ContractCommentInput } from './comment-input'
import TriangleDownFillIcon from 'web/lib/icons/triangle-down-fill-icon.svg'
import TriangleFillIcon from 'web/lib/icons/triangle-fill-icon.svg'

export function FeedCommentThread(props: {
  contract: Contract
  threadComments: ContractComment[]
  parentComment: ContractComment
  trackingLocation: string
  collapseMiddle?: boolean
  inTimeline?: boolean
  idInUrl?: string
  showReplies?: boolean
  childrenBountyTotal?: number
  className?: string
  bets?: Bet[]
}) {
  const {
    contract,
    threadComments,
    parentComment,
    collapseMiddle,
    trackingLocation,
    inTimeline,
    idInUrl,
    showReplies,
    childrenBountyTotal,
    className,
    bets,
  } = props
  const [replyToUserInfo, setReplyToUserInfo] = useState<ReplyToUserInfo>()

  const idInThisThread =
    idInUrl && threadComments.map((comment) => comment.id).includes(idInUrl)

  const [seeReplies, setSeeReplies] = useState(
    !parentComment.hidden && (showReplies || !!idInThisThread)
  )

  const onSeeRepliesClick = useEvent(() => setSeeReplies(!seeReplies))
  const clearReply = useEvent(() => setReplyToUserInfo(undefined))
  const onReplyClick = useEvent((comment: ContractComment) => {
    setSeeReplies(true)
    setReplyToUserInfo({ id: comment.id, username: comment.userUsername })
  })
  const [collapseToIndex, setCollapseToIndex] = useState<number>(
    collapseMiddle && threadComments.length > 2
      ? threadComments.length - 2
      : Infinity
  )
  return (
    <Col className={clsx('mt-3 items-stretch gap-3', className)}>
      <ParentFeedComment
        key={parentComment.id}
        contract={contract}
        comment={parentComment}
        highlighted={idInUrl === parentComment.id}
        seeReplies={seeReplies}
        numReplies={threadComments.length}
        onSeeReplyClick={onSeeRepliesClick}
        onReplyClick={onReplyClick}
        trackingLocation={trackingLocation}
        inTimeline={inTimeline}
        childrenBountyTotal={childrenBountyTotal}
        bets={bets?.filter((bet) => bet.replyToCommentId === parentComment.id)}
      />
      {seeReplies &&
        threadComments
          .slice(0, collapseToIndex)
          .map((comment, i) => (
            <FeedComment
              key={comment.id}
              contract={contract}
              comment={comment}
              highlighted={idInUrl === comment.id}
              onReplyClick={onReplyClick}
              trackingLocation={trackingLocation}
              bets={bets?.filter((bet) => bet.replyToCommentId === comment.id)}
              lastInReplyChain={i === threadComments.length - 1}
            />
          ))}
      {seeReplies && threadComments.length > collapseToIndex && (
        <Row
          className={'justify-end sm:-mb-2 sm:mt-1'}
          key={parentComment.id + 'see-replies-feed-button'}
        >
          <Button
            size={'xs'}
            color={'gray-white'}
            onClick={() => {
              setCollapseToIndex(Infinity)
            }}
          >
            <Col>
              <TriangleFillIcon className={'mr-2 h-2'} />
              <TriangleDownFillIcon className={'mr-2 h-2'} />
            </Col>
            See {threadComments.length - 1} replies
          </Button>
        </Row>
      )}

      <div
        className={clsx('stop-prop flex', replyToUserInfo ? 'block' : 'hidden')}
      >
        <div
          className={clsx(
            roundThreadColor,
            '-mt-3 ml-4 h-7 w-4 rounded-bl-xl border-b-2 border-l-2'
          )}
        />
        {replyToUserInfo && (
          <ContractCommentInput
            contract={contract}
            parentCommentId={parentComment.id}
            replyToUserInfo={replyToUserInfo}
            clearReply={clearReply}
            trackingLocation={trackingLocation}
            className="w-full min-w-0 grow"
            commentTypes={['comment']}
            autoFocus
          />
        )}
      </div>
    </Col>
  )
}
