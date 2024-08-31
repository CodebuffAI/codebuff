import clsx from 'clsx'
import { Answer } from 'common/answer'
import { CPMMMultiContract, MultiContract, contractPath } from 'common/contract'
import Image from 'next/image'
import { useRouter } from 'next/router'
import { IoIosPerson } from 'react-icons/io'
import { MultiBettor, OpenProb } from 'web/components/answers/answer-components'
import { ClickFrame } from 'web/components/widgets/click-frame'
import { CANDIDATE_DATA } from '../../ candidates/candidate-data'
import { Col } from '../../../layout/col'
import { Row } from '../../../layout/row'
import { formatPercentShort, getPercent } from 'common/util/format'
import { Bet } from 'common/bet'
import { sumBy } from 'lodash'
import { floatingEqual } from 'common/util/math'
import { User } from 'common/user'
import { UserPosition } from './candidates-user-position'

export function removeTextInParentheses(input: string): string {
  return input.replace(/\s*\([^)]*\)/g, '')
}

export const CandidateBar = (props: {
  color: string // 6 digit hex
  prob: number // 0 - 1
  resolvedProb?: number // 0 - 1
  className?: string
  hideBar?: boolean
  answer: Answer
  contract: MultiContract
  userBets?: Bet[]
  user?: User | null
}) => {
  const {
    color,
    prob,
    resolvedProb,
    className,
    hideBar,
    answer,
    contract,
    userBets,
    user,
  } = props

  const candidatefullName = removeTextInParentheses(answer.text)

  const { shortName, photo } = CANDIDATE_DATA[candidatefullName] ?? {}
  const router = useRouter()

  const sharesSum = sumBy(userBets, (bet) =>
    bet.outcome === 'YES' ? bet.shares : -bet.shares
  )

  const hasBets = userBets && !floatingEqual(sharesSum, 0)
  const { resolution } = contract

  const isCpmm = contract.mechanism === 'cpmm-multi-1'
  return (
    <ClickFrame
      onClick={() => {
        router.push(contractPath(contract))
      }}
      // onPointerOver={onHover && (() => onHover(true))}
      // onPointerLeave={onHover && (() => onHover(false))}
      className={clsx(
        ' bg-canvas-0 relative h-[164px] w-[112px] justify-between overflow-hidden rounded transition-all',
        className
      )}
    >
      <div className={clsx(' transition-all')}>
        {/* bar outline if resolved */}
        {!!resolvedProb && !hideBar && (
          <div
            className={clsx(
              'absolute bottom-0 w-full ring-1 ring-orange-500 sm:ring-2',
              resolvedProb > prob ? 'bg-orange-100 dark:bg-orange-900' : 'z-10'
            )}
            style={{
              height: `${resolvedProb * 100}%`,
            }}
          />
        )}
        {/* main bar */}
        {!hideBar && (
          <Col className="absolute h-full w-full justify-end">
            <div
              className="w-full dark:brightness-75"
              style={{
                height: `max(1px, ${prob * 100}%)`,
                background: color,
              }}
            />
          </Col>
        )}
      </div>
      <Col className="absolute inset-0">
        <Col className="mt-1 px-2">
          <div className="sm:text-md w-full text-sm">
            {shortName ?? answer.text}
          </div>
          <Row className="w-full items-center justify-between">
            <OpenProb contract={contract} answer={answer} />
            <MultiBettor
              contract={contract as CPMMMultiContract}
              answer={answer}
            />
          </Row>
          <PercentChangeToday
            probChange={answer.probChanges.day}
            className="-mt-1 whitespace-nowrap text-xs"
          />
        </Col>
        {!photo ? (
          <IoIosPerson className="text-ink-600 -mb-4 h-[112px] w-[112px]" />
        ) : (
          <Image
            src={photo}
            alt={candidatefullName}
            width={112}
            height={112}
            className="mx-auto object-fill"
          />
        )}
      </Col>
      {!resolution && hasBets && isCpmm && user && (
        <UserPosition
          contract={contract as CPMMMultiContract}
          answer={answer}
          userBets={userBets}
          user={user}
          className="bg-ink-700/80 hover:bg-ink-700 hover:dark:bg-ink-200 dark:bg-ink-200/80 absolute bottom-0 left-0 right-0 z-20 flex flex-row gap-1.5 whitespace-nowrap px-2 py-1 text-xs text-white transition-opacity"
        />
      )}
    </ClickFrame>
  )
}

export function PercentChangeToday(props: {
  className?: string
  threshold?: number
  probChange: number
}) {
  const { className, threshold = 0.02, probChange } = props
  const percentChangeToday = getPercent(probChange)
  if (Math.abs(probChange) < threshold) {
    return null
  }
  if (percentChangeToday > threshold) {
    return (
      <div className={clsx('text-teal-700', className)}>
        +<b>{formatPercentShort(probChange)}</b> today
      </div>
    )
  }
  return (
    <div className={clsx('text-scarlet-700', className)}>
      <b>{formatPercentShort(probChange)}</b> today
    </div>
  )
}

export function BubblePercentChange(props: {
  className?: string
  threshold?: number
  probChange: number
}) {
  const { className, threshold = 0.02, probChange } = props
  const percentChangeToday = getPercent(probChange)
  if (Math.abs(probChange) < threshold) {
    return null
  }
  if (percentChangeToday > threshold) {
    return (
      <div
        className={clsx(
          'h-fit w-fit rounded-full bg-teal-700/20 px-1.5 py-0.5 text-teal-700',
          className
        )}
      >
        +<b>{formatPercentShort(probChange)}</b>
      </div>
    )
  }
  return (
    <div
      className={clsx(
        'text-scarlet-700 bg-scarlet-700/20 h-fit w-fit rounded-full px-2 py-1',
        className
      )}
    >
      <b>{formatPercentShort(probChange)}</b>
    </div>
  )
}
