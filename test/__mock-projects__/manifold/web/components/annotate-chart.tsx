import { Modal, MODAL_CLASS } from 'web/components/layout/modal'
import { Col } from 'web/components/layout/col'
import clsx from 'clsx'
import { Input } from 'web/components/widgets/input'
import { useState } from 'react'
import { Button } from 'web/components/buttons/button'
import { createChartAnnotation, deleteChartAnnotation } from 'web/lib/api/api'
import { Row } from './layout/row'
import { UserLink } from 'web/components/widgets/user-link'
import { Avatar } from 'web/components/widgets/avatar'
import { useUser } from 'web/hooks/use-user'
import { useCommentOnContract } from 'web/hooks/use-comments'
import { Content } from 'web/components/widgets/editor'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { ChartAnnotation } from 'common/supabase/chart-annotations'
import { ContractComment } from 'common/comment'
import { richTextToString } from 'common/util/parse'
import { FaArrowTrendDown, FaArrowTrendUp } from 'react-icons/fa6'
import { formatPercent } from 'common/util/format'
import { AmountInput } from 'web/components/widgets/amount-input'
import { UserHovercard } from './user/user-hovercard'

export const AnnotateChartModal = (props: {
  open: boolean
  setOpen: (open: boolean) => void
  atTime: number
  contractId: string
  answerId?: string
  comment?: ContractComment
}) => {
  const { atTime, answerId, comment, contractId, open, setOpen } = props
  const [note, setNote] = useState<string>()
  const [probChange, setProbChange] = useState<number>()
  const [loading, setLoading] = useState(false)
  return (
    <Modal open={open} setOpen={setOpen}>
      <Col className={clsx(MODAL_CLASS)}>
        <Row className={'mt-1 w-full items-start justify-start'}>
          <span className={'text-primary-700 text-xl'}>
            Add a note at{' '}
            <span>
              {new Date(atTime).toLocaleDateString('en-US', {
                hour: 'numeric',
                minute: 'numeric',
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </span>
          </span>
        </Row>
        <Col className={'w-full'}>
          <span>What happened? </span>
          {comment ? (
            <span className={'line-clamp-2'}>
              {richTextToString(comment.content)}
            </span>
          ) : (
            <Input
              type={'text'}
              className={'w-full'}
              placeholder={'Information about the event'}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          )}
        </Col>
        <Col className={'w-full'}>
          <span>Probability change as a result</span>
          <AmountInput
            inputClassName={'w-24'}
            placeholder={'15'}
            allowNegative={true}
            label={'%'}
            onChangeAmount={(amount) =>
              amount !== 0 && amount
                ? setProbChange(Math.max(Math.min(amount, 100), -100))
                : undefined
            }
            amount={probChange}
          />
        </Col>
        <Row className={'w-full justify-between'}>
          <Button color={'gray-outline'} onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            color={'indigo'}
            onClick={async () => {
              setLoading(true)
              await createChartAnnotation({
                contractId,
                text: note?.length ? note : undefined,
                eventTime: atTime,
                answerId,
                commentId: comment?.id,
                probChange: probChange ? probChange / 100 : undefined,
              })
              setLoading(false)
              setOpen(false)
            }}
            loading={loading}
            disabled={loading || (!note?.length && !comment)}
          >
            Submit
          </Button>
        </Row>
      </Col>
    </Modal>
  )
}

export const ReadChartAnnotationModal = (props: {
  open: boolean
  setOpen: (open: boolean) => void
  chartAnnotation: ChartAnnotation
}) => {
  const user = useUser()
  const [loading, setLoading] = useState(false)
  const { chartAnnotation, open, setOpen } = props
  const {
    event_time,
    creator_username,
    creator_id,
    creator_name,
    creator_avatar_url,
    comment_id,
    user_username,
    user_id,
    user_name,
    user_avatar_url,
    prob_change,
  } = chartAnnotation
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const comment = comment_id ? useCommentOnContract(comment_id) : undefined
  return (
    <Modal open={open} setOpen={setOpen}>
      <Col className={clsx(MODAL_CLASS)}>
        <Col className={'w-full'}>
          <Row className={' justify-between'}>
            <Row className={'items-center gap-2'}>
              <UserHovercard userId={user_id as string}>
                <Avatar
                  username={user_username ?? creator_username}
                  avatarUrl={user_avatar_url ?? creator_avatar_url}
                  size={'md'}
                />
              </UserHovercard>
              <Col>
                <UserHovercard userId={user_id as string}>
                  <UserLink
                    user={{
                      id: user_id ?? creator_id,
                      username: user_username ?? creator_username,
                      name: user_name ?? creator_name,
                    }}
                  />
                </UserHovercard>
                <span className={'text-ink-500 text-xs'}>
                  {new Date(event_time).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </span>
              </Col>
            </Row>
            {prob_change !== null && (
              <Row
                className={clsx(
                  'items-center gap-1',
                  prob_change > 0 ? 'text-green-500' : 'text-red-500'
                )}
              >
                {prob_change > 0 ? (
                  <FaArrowTrendUp className={'h-3.5 w-3.5'} />
                ) : (
                  <FaArrowTrendDown className={'h-3.5 w-3.5'} />
                )}
                {prob_change > 0 ? '+' : ''}
                {formatPercent(prob_change)}
              </Row>
            )}
            {user?.id === chartAnnotation.creator_id && (
              <Button
                color={'red-outline'}
                size={'xs'}
                loading={loading}
                disabled={loading}
                onClick={async () => {
                  setLoading(true)
                  await deleteChartAnnotation({ id: chartAnnotation.id })
                  setLoading(false)
                }}
              >
                Delete
              </Button>
            )}
          </Row>
        </Col>
        <Row className={'w-full'}>
          {comment_id ? (
            comment ? (
              <Content content={comment.content} />
            ) : (
              <LoadingIndicator />
            )
          ) : (
            <span>{chartAnnotation.text}</span>
          )}
        </Row>
      </Col>
    </Modal>
  )
}
