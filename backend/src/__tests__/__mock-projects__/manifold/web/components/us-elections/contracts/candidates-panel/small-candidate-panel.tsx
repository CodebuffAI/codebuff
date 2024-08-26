import { ArrowRightIcon } from '@heroicons/react/outline'
import clsx from 'clsx'
import { Answer } from 'common/answer'
import { Bet } from 'common/bet'
import { getAnswerProbability } from 'common/calculate'
import { MultiContract, contractPath } from 'common/contract'
import { User } from 'common/user'
import { sortBy } from 'lodash'
import Link from 'next/link'
import { Row } from 'web/components/layout/row'
import { useUser } from 'web/hooks/use-user'
import { Col } from '../../../layout/col'
import { SmallCandidateBar } from './small-candidate-bar'
import { getCandidateColor } from './candidates-panel'
import { removeTextInParentheses } from './candidate-bar'
import { useUserContractBets } from 'web/hooks/use-user-bets'
import { groupBy } from 'lodash'

// just the bars
export function SmallCandidatePanel(props: {
  contract: MultiContract
  maxAnswers?: number
  excludeAnswers?: string[]
  panelClassName?: string
}) {
  const {
    contract,
    maxAnswers = Infinity,
    excludeAnswers,
    panelClassName,
  } = props
  const { resolutions, outcomeType } = contract

  const shouldAnswersSumToOne =
    'shouldAnswersSumToOne' in contract ? contract.shouldAnswersSumToOne : true
  const user = useUser()
  const answers =
    outcomeType !== 'MULTIPLE_CHOICE'
      ? []
      : contract.answers.map((a) => ({
          ...a,
          prob: getAnswerProbability(contract, a.id),
        }))

  const sortByProb = true
  const displayedAnswers = sortBy(answers, [
    // Winners for shouldAnswersSumToOne
    (answer) => (resolutions ? -1 * resolutions[answer.id] : answer),
    // Winners for independent binary
    (answer) => (answer.resolution ? -answer.subsidyPool : -Infinity),
    // then by prob or index
    (answer) => (!sortByProb ? answer.index : -1 * answer.prob),
  ])
    .filter(
      (a) =>
        a.text !== 'Other' &&
        (!excludeAnswers || !excludeAnswers.includes(a.text))
    )
    .slice(0, maxAnswers)

  const moreCount = answers.length - displayedAnswers.length

  // Note: Hide answers if there is just one "Other" answer.
  const showNoAnswers =
    answers.length === 0 || (shouldAnswersSumToOne && answers.length === 1)

  const userBets = useUserContractBets(user?.id, contract.id)
  const userBetsByAnswer = groupBy(userBets, (bet) => bet.answerId)

  return (
    <Col className={clsx('mx-[2px] gap-2', panelClassName)}>
      {showNoAnswers ? (
        <div className="text-ink-500 pb-4">No answers yet</div>
      ) : (
        <>
          {displayedAnswers.map((answer) => (
            <SmallCandidateAnswer
              key={answer.id}
              answer={answer}
              contract={contract}
              user={user}
              userBets={userBetsByAnswer[answer.id]}
            />
          ))}
          {moreCount > 0 && (
            <Link href={contractPath(contract)} className="group">
              <Row className="sm:text-md group-hover:text-primary-700 text-ink-700 w-full items-center justify-end gap-1 text-sm">
                See {moreCount} more{' '}
                <span>
                  <ArrowRightIcon className="h-5 w-5" />
                </span>
              </Row>
            </Link>
          )}
        </>
      )}
    </Col>
  )
}

function SmallCandidateAnswer(props: {
  contract: MultiContract
  answer: Answer
  selected?: boolean
  userBets?: Bet[]
  user?: User | null
}) {
  const { answer, contract, selected, userBets, user } = props

  const prob = getAnswerProbability(contract, answer.id)

  const { resolution, resolutions } = contract
  const resolvedProb =
    resolution == undefined
      ? undefined
      : resolution === answer.id
      ? 1
      : (resolutions?.[answer.id] ?? 0) / 100

  return (
    <Col className={'w-full'}>
      <SmallCandidateBar
        color={getCandidateColor(removeTextInParentheses(answer.text))}
        prob={prob}
        resolvedProb={resolvedProb}
        className={clsx(
          'cursor-pointer',
          selected && 'ring-primary-600 rounded ring-2'
        )}
        answer={answer}
        contract={contract}
        userBets={userBets}
        user={user}
      />
    </Col>
  )
}
