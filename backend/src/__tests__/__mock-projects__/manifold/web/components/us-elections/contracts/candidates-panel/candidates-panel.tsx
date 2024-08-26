import { ArrowRightIcon } from '@heroicons/react/outline'
import clsx from 'clsx'
import { Answer } from 'common/answer'
import { Bet } from 'common/bet'
import { getAnswerProbability } from 'common/calculate'
import { MultiContract, contractPath } from 'common/contract'
import { User } from 'common/user'
import { sortBy } from 'lodash'
import Link from 'next/link'
import { useUser } from 'web/hooks/use-user'
import { Col } from '../../../layout/col'
import { CandidateBar, removeTextInParentheses } from './candidate-bar'
import { CANDIDATE_DATA } from '../../ candidates/candidate-data'
import { Carousel } from 'web/components/widgets/carousel'
import { Row } from 'web/components/layout/row'
import { useUserContractBets } from 'web/hooks/use-user-bets'
import { groupBy } from 'lodash'

// just the bars
export function CandidatePanel(props: {
  contract: MultiContract
  maxAnswers?: number
  excludeAnswers?: string[]
}) {
  const { contract, maxAnswers = Infinity, excludeAnswers } = props
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

  const shownAnswersLength = displayedAnswers.length

  const userBets = useUserContractBets(user?.id, contract.id)
  const userBetsByAnswer = groupBy(userBets, (bet) => bet.answerId)

  return (
    <Col className="mx-[2px] select-none">
      {showNoAnswers ? (
        <div className="text-ink-500 pb-4">No answers yet</div>
      ) : (
        <>
          <Row
            className={clsx(
              'w-min gap-4',
              shownAnswersLength < 5 ? 'hidden sm:flex' : 'hidden'
            )}
          >
            {displayedAnswers.map((answer) => (
              <CandidateAnswer
                key={answer.id}
                answer={answer}
                contract={contract}
                color={getCandidateColor(removeTextInParentheses(answer.text))}
                user={user}
                userBets={userBetsByAnswer[answer.id]}
              />
            ))}
            {moreCount > 0 && (
              <Link href={contractPath(contract)} className="my-auto h-full">
                <Col
                  className={clsx(
                    ' text-ink-1000 h-full items-center justify-center overflow-hidden text-sm transition-all hover:underline'
                  )}
                >
                  <Col className=" items-center gap-1 whitespace-nowrap">
                    {moreCount} more{' '}
                    <span>
                      <ArrowRightIcon className="h-4 w-4" />
                    </span>
                  </Col>
                </Col>
              </Link>
            )}
          </Row>

          <Carousel
            className={clsx(
              'w-full gap-2',
              shownAnswersLength < 5 ? 'sm:hidden' : ''
            )}
          >
            {displayedAnswers.map((answer) => (
              <CandidateAnswer
                key={answer.id}
                answer={answer}
                contract={contract}
                color={getCandidateColor(removeTextInParentheses(answer.text))}
                user={user}
                userBets={userBetsByAnswer[answer.id]}
              />
            ))}
            {moreCount > 0 && (
              <Link href={contractPath(contract)} className="my-auto h-full">
                <Col
                  className={clsx(
                    ' text-ink-1000 items-center justify-center overflow-hidden text-sm transition-all hover:underline '
                  )}
                >
                  <Col className=" items-center gap-1 whitespace-nowrap">
                    {moreCount} more{' '}
                    <span>
                      <ArrowRightIcon className="h-4 w-4" />
                    </span>
                  </Col>
                </Col>
              </Link>
            )}
          </Carousel>
        </>
      )}
    </Col>
  )
}

export function getCandidateColor(name: string) {
  // return 'bg-primary-500'
  if (!CANDIDATE_DATA[name]) return '#9E9FBD'
  if (CANDIDATE_DATA[name]?.party === 'Democrat') return '#adc4e3'
  return '#ecbab5'
}

function CandidateAnswer(props: {
  contract: MultiContract
  answer: Answer
  color: string
  selected?: boolean
  userBets?: Bet[]
  user?: User | null
}) {
  const { answer, contract, selected, color, userBets, user } = props

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
      <CandidateBar
        color={color}
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
      {/* {!resolution && hasBets && isCpmm && user && (
        <AnswerPosition
          contract={contract}
          answer={answer}
          userBets={userBets}
          className="mt-0.5 self-end sm:mx-3 sm:mt-0"
          user={user}
        />
      )} */}
    </Col>
  )
}
