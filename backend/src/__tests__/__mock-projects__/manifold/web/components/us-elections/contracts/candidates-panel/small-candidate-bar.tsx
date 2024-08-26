import clsx from 'clsx'
import { Answer } from 'common/answer'
import { CPMMMultiContract, MultiContract } from 'common/contract'
import Image from 'next/image'
import { IoIosPerson } from 'react-icons/io'
import { MultiBettor, OpenProb } from 'web/components/answers/answer-components'
import { CANDIDATE_DATA } from '../../ candidates/candidate-data'
import { Col } from '../../../layout/col'
import { Row } from '../../../layout/row'
import { PercentChangeToday, removeTextInParentheses } from './candidate-bar'
import { Bet } from 'common/bet'
import { User } from 'common/user'
import { sumBy } from 'lodash'
import { floatingEqual } from 'common/util/math'
import { UserPosition } from './candidates-user-position'

export const SmallCandidateBar = (props: {
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

  const sharesSum = sumBy(userBets, (bet) =>
    bet.outcome === 'YES' ? bet.shares : -bet.shares
  )

  const hasBets = userBets && !floatingEqual(sharesSum, 0)
  const { resolution } = contract

  const isCpmm = contract.mechanism === 'cpmm-multi-1'

  return (
    <>
      <Col className={clsx('relative isolate h-full w-full', className)}>
        <Row className="my-auto h-full items-center justify-between gap-x-4 pr-4 leading-none">
          <Row className="w-full items-center gap-2">
            {!photo ? (
              <IoIosPerson className="text-ink-600 h-[60px] w-[60px] " />
            ) : (
              <Image
                src={photo}
                alt={answer.text}
                width={60}
                height={60}
                className="rounded-bl object-fill"
              />
            )}

            <Col className="gap-1">
              {shortName ?? answer.text}
              {!resolution && hasBets && isCpmm && user && (
                <UserPosition
                  contract={contract as CPMMMultiContract}
                  answer={answer}
                  userBets={userBets}
                  user={user}
                  className="text-ink-700 dark:text-ink-800 text-xs hover:underline"
                  greenArrowClassName="text-teal-600 dark:text-teal-300"
                  redArrowClassName="text-scarlet-600 dark:text-scarlet-400"
                />
              )}
            </Col>
          </Row>
          <Row className="items-center gap-1 sm:gap-2">
            <div className="relative">
              <OpenProb contract={contract} answer={answer} />
              <PercentChangeToday
                probChange={answer.probChanges.day}
                className="absolute right-1 top-6 whitespace-nowrap text-xs"
              />
            </div>
            <MultiBettor
              contract={contract as CPMMMultiContract}
              answer={answer}
            />
          </Row>
        </Row>
        <div
          className={clsx(
            'absolute bottom-0 left-0 right-0 -z-10 h-full rounded transition-all ',
            hideBar ? 'bg-ink-200' : 'bg-canvas-50'
          )}
        >
          {/* bar outline if resolved */}
          {!!resolvedProb && !hideBar && (
            <div
              className={clsx(
                'absolute top-0 h-full rounded ring-1 ring-orange-500 sm:ring-2',
                resolvedProb > prob
                  ? 'bg-orange-100 dark:bg-orange-900'
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
        </div>
      </Col>
    </>
  )
}
