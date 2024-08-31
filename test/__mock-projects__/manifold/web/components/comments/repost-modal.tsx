import clsx from 'clsx'
import { Bet } from 'common/bet'
import { ContractComment } from 'common/comment'
import { Contract } from 'common/contract'
import { useState } from 'react'
import { toast } from 'react-hot-toast'
import { BiRepost } from 'react-icons/bi'
import { Button, SizeType } from 'web/components/buttons/button'
import {
  CommentReplyHeader,
  CommentReplyHeaderWithBet,
  FeedCommentHeader,
} from 'web/components/comments/comment-header'
import { ContractCommentInput } from 'web/components/comments/comment-input'
import { Col } from 'web/components/layout/col'
import { Modal } from 'web/components/layout/modal'
import { Avatar } from 'web/components/widgets/avatar'
import { Content } from 'web/components/widgets/editor'
import { Tooltip } from 'web/components/widgets/tooltip'
import { api } from 'web/lib/api/api'
import { Row } from '../layout/row'
import { UserHovercard } from '../user/user-hovercard'

export const RepostButton = (props: {
  contract: Contract
  bet?: Bet
  size: SizeType
  className?: string
  iconClassName?: string
}) => {
  const { contract, bet, size, className, iconClassName } = props
  const [open, setOpen] = useState(false)
  return (
    <>
      <Tooltip
        text="Repost with comment to followers"
        placement="bottom"
        noTap
        className="flex select-none items-center"
      >
        <Button
          color={'gray-white'}
          size={size}
          className={clsx(className)}
          onClick={() => setOpen(true)}
        >
          <BiRepost className={clsx(iconClassName, 'h-6 w-6')} />
        </Button>
      </Tooltip>
      {open && (
        <RepostModal
          bet={bet}
          contract={contract}
          open={open}
          setOpen={setOpen}
        />
      )}
    </>
  )
}

export const RepostModal = (props: {
  contract: Contract
  bet?: Bet
  comment?: ContractComment
  open: boolean
  setOpen: (open: boolean) => void
}) => {
  const { contract, comment, bet, open, setOpen } = props
  const [loading, setLoading] = useState(false)
  const repost = async () =>
    api('post', {
      contractId: contract.id,
      commentId: comment?.id,
      betId: bet?.id,
    })
      .then(() => toast.success('Reposted to your followers!'))
      .catch((e: Error) => {
        toast.error(e.message)
      })

  const commenterIsBettor = comment?.userId === bet?.userId
  return (
    <Modal
      open={open}
      setOpen={setOpen}
      className={'bg-canvas-0 text-ink-1000 gap-4 rounded-md px-4 pb-4 sm:px-6'}
    >
      <Col className={'w-full'}>
        <span className={'text-primary-700 mb-4 pt-3 text-lg'}>
          Repost to your followers
        </span>
        {comment ? (
          <Col>
            {((bet && !commenterIsBettor) ||
              (comment.bettorUsername && !commenterIsBettor)) &&
              (bet ? (
                <CommentReplyHeaderWithBet
                  comment={comment}
                  contract={contract}
                  bet={bet}
                />
              ) : (
                <CommentReplyHeader comment={comment} contract={contract} />
              ))}
            <Row className={'gap-1'}>
              <UserHovercard userId={comment.userId}>
                <Avatar
                  username={comment.userUsername}
                  size={'sm'}
                  avatarUrl={comment.userAvatarUrl}
                  className={clsx('z-10 mt-1')}
                />
              </UserHovercard>
              <Col
                className={clsx(
                  'grow rounded-lg rounded-tl-none px-3 pb-0.5 pt-1 transition-colors',
                  'bg-canvas-50'
                )}
              >
                <FeedCommentHeader
                  comment={comment}
                  contract={contract}
                  inTimeline={false}
                  isParent={true}
                />

                <Content content={comment.content} />
              </Col>
            </Row>
            <Row className={'mt-4 justify-between'}>
              <Button color={'gray'} size={'sm'} onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                size={'sm'}
                loading={loading}
                disabled={loading}
                onClick={async () => {
                  setLoading(true)
                  await repost()
                    .then(() => setOpen(false))
                    .finally(() => setLoading(false))
                }}
              >
                Repost
              </Button>
            </Row>
          </Col>
        ) : (
          <ContractCommentInput
            autoFocus
            replyTo={bet}
            contract={contract}
            trackingLocation={'contract page'}
            commentTypes={['repost']}
            onClearInput={() => setOpen(false)}
          />
        )}
      </Col>
    </Modal>
  )
}
