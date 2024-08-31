import { ChatIcon } from '@heroicons/react/outline'
import clsx from 'clsx'
import { Answer } from 'common/answer'
import {
  CPMMMultiContract,
  CPMMNumericContract,
  getMainBinaryMCAnswer,
  MultiContract,
  resolution,
  tradingAllowed,
} from 'common/contract'
import { formatMoney, formatPercent } from 'common/util/format'
import { ReactNode, useState } from 'react'
import { Button } from '../buttons/button'
import { Modal, MODAL_CLASS, SCROLLABLE_MODAL_CLASS } from '../layout/modal'
import { AnswerCpmmBetPanel } from './answer-bet-panel'
import { useUser } from 'web/hooks/use-user'
import { Bet } from 'common/bet'
import { sumBy } from 'lodash'
import { User } from 'common/user'
import { SellSharesModal } from '../bet/sell-row'
import {
  BinaryOutcomeLabel,
  NoLabel,
  OutcomeLabel,
  ProbPercentLabel,
  YesLabel,
} from '../outcome-label'
import { getAnswerProbability, getContractBetMetrics } from 'common/calculate'
import { formatTimeShort } from 'web/lib/util/time'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { Avatar, EmptyAvatar } from '../widgets/avatar'
import { Linkify } from '../widgets/linkify'
import { Tooltip } from '../widgets/tooltip'
import { animated } from '@react-spring/web'
import { useAnimatedNumber } from 'web/hooks/use-animated-number'
import { HOUR_MS } from 'common/util/time'
import { SparklesIcon } from '@heroicons/react/solid'
import { track } from 'web/lib/service/analytics'
import { UserHovercard } from '../user/user-hovercard'
import { useSaveBinaryShares } from 'web/hooks/use-save-binary-shares'
import { useUserContractBets } from 'web/hooks/use-user-bets'
import { MultiSellerPosition, MultiSellerProfit } from '../bet/sell-panel'

export const AnswerBar = (props: {
  color: string // 6 digit hex
  prob: number // 0 - 1
  resolvedProb?: number // 0 - 1
  label: ReactNode
  end: ReactNode
  className?: string
  hideBar?: boolean
  renderBackgroundLayer?: React.ReactNode
  onHover?: (hovering: boolean) => void
  onClick?: () => void
  barColor?: string
}) => {
  const {
    color,
    prob,
    resolvedProb,
    label,
    end,
    className,
    hideBar,
    renderBackgroundLayer,
    onHover,
    onClick,
  } = props

  return (
    <Col
      className={clsx('relative isolate h-full w-full', className)}
      onPointerOver={onHover && (() => onHover(true))}
      onPointerLeave={onHover && (() => onHover(false))}
      onClick={onClick}
    >
      <Row className="group my-auto h-full items-center justify-between gap-x-4 px-3 py-2 leading-none">
        <div className="flex-grow">{label}</div>
        <Row className="relative  items-center justify-end gap-2">{end}</Row>
      </Row>
      <div
        className={clsx(
          'absolute bottom-0 left-0 right-0 -z-10 h-full rounded opacity-70 transition-all group-hover:opacity-100',
          hideBar ? 'bg-ink-200' : props.barColor ?? 'bg-canvas-50'
        )}
      >
        {/* bar outline if resolved */}
        {!!resolvedProb && !hideBar && (
          <div
            className={clsx(
              'absolute top-0 h-full rounded ring-1 ring-purple-500 sm:ring-2',
              resolvedProb > prob ? 'bg-purple-100 dark:bg-purple-900' : 'z-10'
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
    </Col>
  )
}

export const CreatorAndAnswerLabel = (props: {
  text: string
  createdTime: number
  truncate?: 'short' | 'long' | 'none' //  | medium (30)
  creator?:
    | { name: string; username: string; avatarUrl?: string; id: string }
    | false
  className?: string
}) => {
  const { text, createdTime, truncate = 'none', creator, className } = props

  const ELLIPSES_LENGTH = 3
  const maxLength = { short: 20, long: 75, none: undefined }[truncate]
  const truncated =
    maxLength && text.length > maxLength + ELLIPSES_LENGTH
      ? text.slice(0, maxLength) + '...'
      : text

  const answerTextTooltip = truncated === text ? false : text

  const dateText = `created ${formatTimeShort(createdTime)}`
  const dateTooltip = creator ? `${creator.name} ${dateText}` : dateText

  return (
    <Tooltip text={answerTextTooltip}>
      <Row className={clsx('my-1', className)}>
        <Tooltip text={dateTooltip}>
          {creator === false ? (
            <EmptyAvatar className="mr-2 inline" size={4} />
          ) : creator ? (
            <UserHovercard userId={creator.id}>
              <Avatar
                className="mr-2 inline"
                size="2xs"
                username={creator.username}
                avatarUrl={creator.avatarUrl}
              />
            </UserHovercard>
          ) : null}
        </Tooltip>
        <Linkify text={truncated} className="[&_a]:text-primary-800" />
      </Row>
    </Tooltip>
  )
}
export const AnswerLabel = (props: {
  text: string
  className?: string
  truncate?: 'short' | 'long' | 'none' //  | medium (30)
}) => {
  const { text, truncate = 'none', className } = props

  const ELLIPSES_LENGTH = 3
  const maxLength = { short: 20, long: 75, none: undefined }[truncate]
  const truncated =
    maxLength && text.length > maxLength + ELLIPSES_LENGTH
      ? text.slice(0, maxLength) + '...'
      : text

  const answerTextTooltip = truncated === text ? false : text

  return (
    <Tooltip text={answerTextTooltip}>
      <Linkify
        text={truncated}
        className={clsx('[&_a]:text-primary-800', className)}
      />
    </Tooltip>
  )
}

export const AddComment = (props: { onClick: () => void }) => {
  const { onClick } = props
  return (
    <Button
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      color="gray-outline"
      size={'2xs'}
    >
      <ChatIcon className="mr-1 h-5 w-5" />
      Comment
    </Button>
  )
}

export const MultiBettor = (props: {
  answer: Answer
  contract: CPMMMultiContract
  buttonClassName?: string
}) => {
  const { answer, contract, buttonClassName } = props
  const [outcome, setOutcome] = useState<'YES' | 'NO' | undefined>(undefined)

  return (
    <>
      <Modal
        open={outcome != undefined}
        setOpen={(open) => setOutcome(open ? 'YES' : undefined)}
        className={clsx(MODAL_CLASS, SCROLLABLE_MODAL_CLASS)}
      >
        <AnswerCpmmBetPanel
          answer={answer}
          contract={contract}
          outcome={outcome}
          closePanel={() => setOutcome(undefined)}
          alwaysShowOutcomeSwitcher
        />
      </Modal>

      <Button
        size="2xs"
        color="indigo-outline"
        className={clsx('bg-primary-50', buttonClassName)}
        onClick={(e) => {
          e.stopPropagation()
          // TODO: Twomba tracking bet terminology
          track('bet intent', { location: 'answer panel' })
          setOutcome('YES')
        }}
      >
        Bet
      </Button>
    </>
  )
}
const YesNoBetButtons = (props: {
  answer: Answer
  contract: CPMMMultiContract
  fillColor?: string
  feedReason?: string
}) => {
  const { answer, contract, feedReason, fillColor } = props
  const [outcome, setOutcome] = useState<'YES' | 'NO' | undefined>(undefined)

  return (
    <>
      <Modal
        open={outcome != undefined}
        setOpen={(open) => setOutcome(open ? 'YES' : undefined)}
      >
        <AnswerCpmmBetPanel
          answer={answer}
          feedReason={feedReason}
          contract={contract}
          outcome={outcome}
          closePanel={() => setOutcome(undefined)}
        />
      </Modal>

      <Button
        size="2xs"
        color="green-outline"
        className={clsx('!px-2.5', fillColor ?? 'bg-canvas-50')}
        onClick={(e) => {
          e.stopPropagation()
          // TODO: Twomba tracking bet terminology
          track('bet intent', { location: 'answer panel' })
          setOutcome('YES')
        }}
      >
        Yes
      </Button>
      <Button
        size="2xs"
        color="red-outline"
        className={clsx('!px-2.5', fillColor ?? 'bg-canvas-50')}
        onClick={(e) => {
          e.stopPropagation()
          // TODO: Twomba tracking bet terminology
          track('bet intent', { location: 'answer panel' })
          setOutcome('NO')
        }}
      >
        No
      </Button>
    </>
  )
}

export const MultiSeller = (props: {
  answer: Answer
  contract: CPMMMultiContract | CPMMNumericContract
  userBets: Bet[]
  user: User
  className?: string
  showPosition?: boolean
}) => {
  const { answer, contract, userBets, user, className, showPosition } = props
  const [open, setOpen] = useState(false)
  const sharesSum = sumBy(userBets, (bet) =>
    bet.outcome === 'YES' ? bet.shares : -bet.shares
  )
  const sharesOutcome = sharesSum > 0 ? 'YES' : 'NO'

  return (
    <>
      {open && (
        <SellSharesModal
          contract={contract}
          user={user}
          userBets={userBets}
          shares={Math.abs(sharesSum)}
          sharesOutcome={sharesOutcome}
          setOpen={setOpen}
          answerId={answer.id}
        />
      )}
      <button
        className={clsx(
          'hover:text-primary-700 text-primary-600 decoration-2 hover:underline',
          className
        )}
        onClick={() => setOpen(true)}
      >
        <span className="font-bold">Sell</span>
        {showPosition && (
          <>
            <span className="font-bold">
              <MultiSellerPosition contract={contract} userBets={userBets} />
            </span>
            (
            <MultiSellerProfit
              contract={contract}
              userBets={userBets}
              answer={answer}
            />{' '}
            profit)
          </>
        )}
      </button>
    </>
  )
}

export const BinaryMultiSellRow = (props: {
  contract: CPMMMultiContract
  answer: Answer
}) => {
  const { contract, answer } = props
  const user = useUser()
  const userBets = useUserContractBets(user?.id, contract.id)?.filter(
    (b) => b.answerId === answer.id
  )
  const [open, setOpen] = useState(false)
  const { sharesOutcome, shares } = useSaveBinaryShares(contract, userBets)
  if (!sharesOutcome || !user || contract.isResolved) return null
  return (
    <Row className={'mt-2'}>
      {open && (
        <SellSharesModal
          contract={contract}
          user={user}
          userBets={userBets ?? []}
          shares={shares}
          sharesOutcome={sharesOutcome}
          setOpen={setOpen}
          answerId={getMainBinaryMCAnswer(contract)?.id}
        />
      )}
      <Button
        className="!py-1"
        size="xs"
        color="gray-outline"
        onClick={(e) => {
          setOpen(true)
          // Necessary in the profile page to prevent the row from being toggled
          e.stopPropagation()
        }}
      >
        <Row className={'gap-1'}>
          Sell
          <OutcomeLabel
            outcome={sharesOutcome}
            contract={contract}
            truncate={'short'}
          />
        </Row>
      </Button>
    </Row>
  )
}

export const OpenProb = (props: {
  contract: MultiContract
  answer: Answer
  noNewIcon?: boolean
  size?: 'sm' | 'md'
  className?: string
}) => {
  const { contract, answer, noNewIcon, size = 'md', className } = props
  const spring = useAnimatedNumber(getAnswerProbability(contract, answer.id))
  const cutoffTime = Date.now() - 6 * HOUR_MS
  const isNew =
    contract.createdTime < cutoffTime && answer.createdTime > cutoffTime
  return (
    <Row className={'items-center'}>
      <span
        className={clsx(
          'whitespace-nowrap font-bold',
          size == 'sm' ? 'min-w-[36px]' : 'min-w-[2.5rem]  text-lg ',
          className
        )}
      >
        <animated.div>{spring.to((val) => formatPercent(val))}</animated.div>
      </span>
      {isNew && !noNewIcon && (
        <Tooltip text={'Recently submitted'}>
          <SparklesIcon className="h-4 w-4 text-green-500" />
        </Tooltip>
      )}
    </Row>
  )
}
export const ClosedProb = (props: {
  prob: number
  resolvedProb?: number
  className?: string
}) => {
  const { prob, resolvedProb: resolveProb, className } = props
  return (
    <>
      {!!resolveProb && (
        <span
          className={clsx(
            'dark:text-ink-900 text-lg text-purple-500',
            className
          )}
        >
          {Math.round(resolveProb * 100)}%
        </span>
      )}
      <span
        className={clsx(
          'text-ink-500 whitespace-nowrap text-lg',
          resolveProb != undefined &&
            'inline-block min-w-[40px] text-right line-through',
          className
        )}
      >
        {formatPercent(prob)}
      </span>
    </>
  )
}

export const AnswerStatus = (props: {
  contract: MultiContract
  answer: Answer
  noNewIcon?: boolean
  className?: string
}) => {
  const { contract, answer, className } = props
  const { resolutions } = contract

  const answerResolution = answer.resolution

  const prob = getAnswerProbability(contract, answer.id)
  const resolvedProb =
    answerResolution === 'MKT'
      ? answer.resolutionProbability ?? answer.prob
      : resolutions
      ? (resolutions?.[answer.id] ?? 0) / 100
      : undefined

  const isOpen = tradingAllowed(contract, answer)

  if (answerResolution) {
    return (
      <Row className={clsx('items-center gap-1.5 font-semibold', className)}>
        <div className={'text-ink-800 text-base'}>Resolved</div>
        {answerResolution === 'MKT' && answer.resolutionProbability ? (
          <ProbPercentLabel
            prob={answer.resolutionProbability ?? answer.prob}
          />
        ) : (
          <BinaryOutcomeLabel outcome={answerResolution as resolution} />
        )}
      </Row>
    )
  }
  return isOpen ? (
    <OpenProb
      className={className}
      contract={contract}
      answer={answer}
      noNewIcon
    />
  ) : (
    <ClosedProb className={className} prob={prob} resolvedProb={resolvedProb} />
  )
}
export const BetButtons = (props: {
  contract: MultiContract
  answer: Answer
  feedReason?: string
  fillColor?: string
}) => {
  const { contract, answer, fillColor, feedReason } = props

  const isOpen = tradingAllowed(contract, answer)
  if (!isOpen) return null
  return (
    <YesNoBetButtons
      feedReason={feedReason}
      answer={answer}
      contract={contract as CPMMMultiContract}
      fillColor={fillColor}
    />
  )
}

export function AnswerPosition(props: {
  contract: CPMMMultiContract | CPMMNumericContract
  userBets: Bet[]
  answer: Answer
  user: User
  className?: string
}) {
  const { contract, user, userBets, answer, className } = props

  const { invested, totalShares } = getContractBetMetrics(contract, userBets)

  const yesWinnings = totalShares.YES ?? 0
  const noWinnings = totalShares.NO ?? 0
  const position = yesWinnings - noWinnings

  return (
    <Row
      className={clsx(
        className,
        'text-ink-500 gap-1.5 whitespace-nowrap text-xs'
      )}
    >
      <Row className="gap-1">
        Payout
        {position > 1e-7 ? (
          <>
            <span className="text-ink-700">{formatMoney(position)}</span> on
            <YesLabel />
          </>
        ) : position < -1e-7 ? (
          <>
            <span className="text-ink-700">{formatMoney(-position)}</span> on
            <NoLabel />
          </>
        ) : (
          '——'
        )}
      </Row>
      &middot;
      <Row className="gap-1">
        <div className="text-ink-500">Spent</div>
        <div className="text-ink-700">{formatMoney(invested)}</div>
      </Row>
      {(!contract.closeTime || contract.closeTime > Date.now()) &&
        !answer.resolutionTime && (
          <>
            &middot;
            <MultiSeller
              answer={answer}
              contract={contract}
              userBets={userBets}
              user={user}
            />
          </>
        )}
    </Row>
  )
}
