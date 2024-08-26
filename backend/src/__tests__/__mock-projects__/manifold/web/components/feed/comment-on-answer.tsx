'use client'
import { Answer } from 'common/answer'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { UserLink } from 'web/components/widgets/user-link'
import Curve from 'web/lib/icons/comment-curve.svg'
import { getAnswerColor } from '../charts/contract/choice'
import { useDisplayUserByIdOrAnswer } from 'web/hooks/use-user-supabase'
import { XCircleIcon } from '@heroicons/react/solid'
import { RelativeTimestamp } from 'web/components/relative-timestamp'
import { UserHovercard } from '../user/user-hovercard'

export function CommentOnAnswer(props: { answer: Answer; clear?: () => void }) {
  const { answer, clear } = props

  const color = getAnswerColor(answer)

  return (
    <Row className="items-end pl-2">
      <Curve className="text-ink-100 h-8 w-8 shrink-0 rotate-90" />
      <div className="relative pb-1">
        <AnswerSectionForCommentOnAnswer answer={answer} color={color} />
        {clear && (
          <button
            onClick={clear}
            className="text-ink-500 hover:text-ink-600 bg-canvas-0 absolute -right-1.5 -top-1.5 rounded-full"
          >
            <XCircleIcon className="h-4 w-4" />
          </button>
        )}
      </div>
    </Row>
  )
}

function AnswerSectionForCommentOnAnswer(props: {
  answer: Answer
  color: string
}) {
  const { answer, color } = props
  const { text } = answer
  const user = useDisplayUserByIdOrAnswer(answer)

  return (
    <Row>
      <div className="w-2 dark:brightness-75" style={{ background: color }} />
      <Col className="bg-ink-100 w-fit py-1 pl-2 pr-2">
        <Row className="gap-2">
          <div className="text-ink-400 text-xs">
            {user && (
              <>
                <UserHovercard userId={user.id}>
                  <UserLink user={user} />
                </UserHovercard>{' '}
                answered
              </>
            )}
            <RelativeTimestamp time={answer.createdTime} shortened={true} />
          </div>
        </Row>
        <div className="line-clamp-2 text-sm">{text}</div>
      </Col>
    </Row>
  )
}
