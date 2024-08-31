import { ArrowRightIcon } from '@heroicons/react/outline'
import clsx from 'clsx'
import { OTHER_TOOLTIP_TEXT, sortAnswers, type Answer } from 'common/answer'
import { Bet } from 'common/bet'
import { getAnswerProbability } from 'common/calculate'
import { CPMMMultiContract, MultiContract, contractPath } from 'common/contract'
import { User } from 'common/user'
import { floatingEqual } from 'common/util/math'
import { sumBy } from 'lodash'
import Link from 'next/link'
import { useUser } from 'web/hooks/use-user'
import { getAnswerColor } from '../charts/contract/choice'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { InfoTooltip } from '../widgets/info-tooltip'
import { AnswerPosition, AnswerStatus, MultiBettor } from './answer-components'
import { Linkify } from '../widgets/linkify'

// just the bars
export function SmallAnswerBars(props: {
  contract: CPMMMultiContract
  maxAnswers?: number
  barColor?: string
  className?: string
}) {
  const { contract, maxAnswers = Infinity, barColor, className } = props

  const shouldAnswersSumToOne =
    'shouldAnswersSumToOne' in contract ? contract.shouldAnswersSumToOne : true
  const user = useUser()
  const answers = contract.answers.map((a) => ({
    ...a,
    prob: getAnswerProbability(contract, a.id),
  }))

  const displayedAnswers = sortAnswers(contract, answers).slice(0, maxAnswers)

  const moreCount = answers.length - displayedAnswers.length

  // Note: Hide answers if there is just one "Other" answer.
  const showNoAnswers =
    answers.length === 0 || (shouldAnswersSumToOne && answers.length === 1)

  return (
    <Col className={clsx('mx-[2px] gap-1.5', className)}>
      {showNoAnswers ? (
        <div className="text-ink-500 pb-4">No answers yet</div>
      ) : (
        <>
          {displayedAnswers.map((answer) => (
            <SmallAnswer
              user={user}
              key={answer.id}
              answer={answer}
              contract={contract}
              color={getAnswerColor(answer)}
              barColor={barColor}
            />
          ))}
          {moreCount > 0 && (
            <Row className="w-full justify-end">
              <Link
                className="text-ink-500 hover:text-primary-500 text-sm"
                href={contractPath(contract)}
              >
                See {moreCount} more {moreCount === 1 ? 'answer' : 'answers'}{' '}
                <ArrowRightIcon className="inline h-4 w-4" />
              </Link>
            </Row>
          )}
        </>
      )}
    </Col>
  )
}

export function SmallAnswer(props: {
  contract: MultiContract
  answer: Answer
  color: string
  user: User | undefined | null
  onCommentClick?: () => void
  userBets?: Bet[]
  barColor?: string
}) {
  const { answer, contract, color, userBets, user, barColor } = props

  const prob = getAnswerProbability(contract, answer.id)

  const isCpmm = contract.mechanism === 'cpmm-multi-1'

  const { resolution, resolutions } = contract
  const resolvedProb =
    resolution == undefined
      ? undefined
      : resolution === answer.id
      ? 1
      : (resolutions?.[answer.id] ?? 0) / 100

  const sharesSum = sumBy(userBets, (bet) =>
    bet.outcome === 'YES' ? bet.shares : -bet.shares
  )
  const hasBets = userBets && !floatingEqual(sharesSum, 0)

  return (
    <Col className={'w-full'}>
      <SmallAnswerBar
        color={color}
        prob={prob}
        resolvedProb={resolvedProb}
        className={clsx('cursor-pointer')}
        barColor={barColor}
        contract={contract}
        answer={answer}
      />
      {!resolution && hasBets && isCpmm && user && (
        <AnswerPosition
          contract={contract}
          answer={answer}
          userBets={userBets}
          className="mt-0.5 self-end sm:mx-3 sm:mt-0"
          user={user}
        />
      )}
    </Col>
  )
}
export const SmallAnswerBar = (props: {
  color: string // 6 digit hex
  prob: number // 0 - 1
  resolvedProb?: number // 0 - 1
  className?: string
  hideBar?: boolean
  renderBackgroundLayer?: React.ReactNode
  barColor?: string
  contract: MultiContract
  answer: Answer
}) => {
  const {
    color,
    prob,
    resolvedProb,
    className,
    hideBar,
    renderBackgroundLayer,
    contract,
    answer,
  } = props

  const isOther = !!answer.isOther
  const textColorClass = resolvedProb === 0 ? 'text-ink-700' : 'text-ink-900'
  return (
    <Col className={clsx('relative isolate h-full w-full', className)}>
      <Row className="w-full items-center justify-between px-2 py-0.5">
        {isOther ? (
          <span className={clsx(textColorClass, 'text-sm')}>
            Other{' '}
            <InfoTooltip
              className="!text-ink-600 dark:!text-ink-700"
              text={OTHER_TOOLTIP_TEXT}
              size="sm"
            />
          </span>
        ) : (
          <Linkify
            text={answer.text}
            className="[&_a]:text-primary-800 line-clamp-2 text-sm"
          />
        )}
        <Row>
          <div
            className={clsx(
              'absolute bottom-0 left-0 right-0 -z-10 h-full rounded transition-all ',
              hideBar ? 'bg-ink-200' : props.barColor ?? 'bg-canvas-50'
            )}
          >
            {/* bar outline if resolved */}
            {!!resolvedProb && !hideBar && (
              <div
                className={clsx(
                  'absolute top-0 h-full rounded ring-1 ring-purple-500 sm:ring-2',
                  resolvedProb > prob
                    ? 'bg-purple-100 dark:bg-purple-900'
                    : 'z-10'
                )}
                style={{
                  width: `${resolvedProb * 100}%`,
                }}
              />
            )}
            {/* main bar */}
            {!hideBar && (
              <div
                className="isolate h-full rounded dark:brightness-75"
                style={{
                  width: `max(8px, ${prob * 100}%)`,
                  background: color,
                }}
              />
            )}
            {renderBackgroundLayer}
          </div>
          <Row className={'items-center gap-1'}>
            <AnswerStatus contract={contract} answer={answer} noNewIcon />
            <MultiBettor
              contract={contract as CPMMMultiContract}
              answer={answer}
            />
          </Row>
        </Row>
      </Row>
    </Col>
  )
}
