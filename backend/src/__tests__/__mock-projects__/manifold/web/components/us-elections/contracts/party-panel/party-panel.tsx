import clsx from 'clsx'
import { Answer } from 'common/answer'
import { Bet } from 'common/bet'
import { getAnswerProbability } from 'common/calculate'
import { MultiContract } from 'common/contract'
import { User } from 'common/user'
import { sortBy } from 'lodash'
import { useUser } from 'web/hooks/use-user'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import {
  AnswerBar,
  AnswerStatus,
} from 'web/components/answers/answer-components'
import { CreatorAndAnswerLabel } from 'web/components/answers/answer-components'
import { MultiBettor } from 'web/components/answers/answer-components'
import { CPMMMultiContract } from 'common/contract'
import {
  BubblePercentChange,
  PercentChangeToday,
} from '../candidates-panel/candidate-bar'
import { useUserContractBets } from 'web/hooks/use-user-bets'
import { groupBy, sumBy } from 'lodash'
import { floatingEqual } from 'common/util/math'
import { UserPosition } from '../candidates-panel/candidates-user-position'
import { ProbabilityNeedle } from 'web/components/us-elections/probability-needle'
import { SizedContainer } from 'web/components/sized-container'
import { Spacer } from 'web/components/layout/spacer'
import Image from 'next/image'
import { IoIosPerson } from 'react-icons/io'

// just the bars
export function PartyPanel(props: {
  contract: MultiContract
  maxAnswers?: number
  includeNeedle?: boolean
  includeHead?: boolean
}) {
  const { contract, maxAnswers = Infinity, includeNeedle, includeHead } = props
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
  ]).slice(0, maxAnswers)
  // Note: Hide answers if there is just one "Other" answer.
  const showNoAnswers =
    answers.length === 0 || (shouldAnswersSumToOne && answers.length === 1)

  const userBets = useUserContractBets(user?.id, contract.id)
  const userBetsByAnswer = groupBy(userBets, (bet) => bet.answerId)

  // Calculate Republican to Democratic ratio
  const republicanAnswer = answers.find((a) =>
    a.text.includes('Republican Party')
  )
  const democraticAnswer = answers.find((a) =>
    a.text.includes('Democratic Party')
  )

  const republicanProb = getAnswerProbability(contract, republicanAnswer!.id)
  const democraticProb = getAnswerProbability(contract, democraticAnswer!.id)

  let democratToRepublicanRatio = 0
  if (republicanAnswer && democraticAnswer) {
    const totalProb = republicanProb + democraticProb
    democratToRepublicanRatio = democraticProb / totalProb
  }

  if (includeNeedle) {
    return (
      <Col className="mx-[2px] gap-2">
        <div className="relative hidden md:flex md:items-center md:justify-between">
          <div
            style={{ overflow: 'hidden' }}
            className="absolute -bottom-4 -left-[18px]"
          >
            <Image
              height={250}
              width={250} // Double the width to ensure the image is not stretched
              src="/political-candidates/trump-right.png"
              alt={'trump'}
              className="h-full rounded-bl-lg"
            />
          </div>
          <div
            style={{ overflow: 'hidden' }}
            className="absolute -bottom-4 -right-[18px]"
          >
            <Image
              height={250}
              width={250} // Double the width to ensure the image is not stretched
              src="/political-candidates/kamala-left.png"
              alt={'trump'}
              className="h-full rounded-br-lg"
            />
          </div>
          {!!republicanAnswer && (
            <PartyAnswerSnippet
              contract={contract}
              answer={republicanAnswer}
              color={getPartyColor(republicanAnswer.text)}
              userBets={userBetsByAnswer[republicanAnswer.id]}
              user={user}
              className="absolute left-[90px]"
            />
          )}
          <SizedContainer className="mx-auto h-[210px] w-1/2 lg:w-2/5 xl:w-1/2">
            {(width, height) => (
              <ProbabilityNeedle
                percentage={democratToRepublicanRatio}
                width={width}
                height={height}
              />
            )}
          </SizedContainer>
          {!!democraticAnswer && (
            <PartyAnswerSnippet
              contract={contract}
              answer={democraticAnswer}
              color={getPartyColor(democraticAnswer.text)}
              userBets={userBetsByAnswer[democraticAnswer.id]}
              user={user}
              className="absolute right-[90px]"
            />
          )}
        </div>
        <SizedContainer className="h-[210px] w-full md:hidden">
          {(width, height) => (
            <ProbabilityNeedle
              percentage={democratToRepublicanRatio}
              width={width}
              height={height}
            />
          )}
        </SizedContainer>
        <Col className="gap-2 md:hidden">
          {showNoAnswers ? (
            <div className="text-ink-500 pb-4">No answers yet</div>
          ) : (
            <>
              {displayedAnswers.map((answer) => (
                <PartyAnswer
                  key={answer.id}
                  answer={answer}
                  contract={contract}
                  color={getPartyColor(answer.text)}
                  user={user}
                  userBets={userBetsByAnswer[answer.id]}
                  includeHead={includeHead}
                />
              ))}
            </>
          )}
        </Col>
      </Col>
    )
  }

  return (
    <Col className="gap-2">
      {showNoAnswers ? (
        <div className="text-ink-500 pb-4">No answers yet</div>
      ) : (
        <>
          {displayedAnswers.map((answer) => (
            <PartyAnswer
              key={answer.id}
              answer={answer}
              contract={contract}
              color={getPartyColor(answer.text)}
              user={user}
              userBets={userBetsByAnswer[answer.id]}
              includeHead={includeHead}
            />
          ))}
        </>
      )}
    </Col>
  )
}

export function getPartyColor(name: string) {
  // return 'bg-primary-500'
  if (name == 'Democratic Party' || name.includes('Democratic Party'))
    return '#adc4e3'
  if (name == 'Republican Party' || name.includes('Republican Party'))
    return '#ecbab5'
  return '#9E9FBD'
}

function PartyAnswer(props: {
  contract: MultiContract
  answer: Answer
  color: string
  onHover?: (hovering: boolean) => void
  selected?: boolean
  userBets?: Bet[]
  user?: User | null
  includeHead?: boolean
}) {
  const {
    answer,
    contract,
    onHover,
    selected,
    color,
    userBets,
    user,
    includeHead,
  } = props

  const prob = getAnswerProbability(contract, answer.id)

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

  const isCpmm = contract.mechanism === 'cpmm-multi-1'

  const isDemocraticParty = answer.text == 'Democratic Party'
  const isRepublicanParty = answer.text == 'Republican Party'
  const isOther = answer.text == 'Other'

  const head =
    isOther || (!isDemocraticParty && !isRepublicanParty) ? (
      <IoIosPerson className="text-ink-700 absolute -bottom-6 -left-4 h-16 w-16 rounded-bl" />
    ) : (
      <Image
        height={80}
        width={80} // Double the width to ensure the image is not stretched
        src={
          isDemocraticParty
            ? '/political-candidates/harris.png'
            : '/political-candidates/trump.png'
        }
        alt={''}
        className={clsx('absolute -bottom-3.5 -left-3 h-14 w-14 rounded-bl')}
      />
    )

  return (
    <Col className={'w-full'}>
      <AnswerBar
        color={color}
        prob={prob}
        resolvedProb={resolvedProb}
        onHover={onHover}
        className={clsx(
          'cursor-pointer py-1.5',
          selected && 'ring-primary-600 ring-2'
        )}
        label={
          <Row className="relative h-8">
            {!!includeHead && head}
            <Col className={clsx(includeHead ? 'ml-12' : '')}>
              <CreatorAndAnswerLabel
                text={answer.text}
                createdTime={answer.createdTime}
                className={clsx('items-center !leading-none ')}
              />
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
        }
        end={
          <Row className={'items-center gap-1 sm:gap-2'}>
            <div className="relative">
              <AnswerStatus contract={contract} answer={answer} />
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
        }
      />
    </Col>
  )
}

function PartyAnswerSnippet(props: {
  contract: MultiContract
  answer: Answer
  color: string
  userBets?: Bet[]
  user?: User | null
  className?: string
}) {
  const { answer, contract, userBets, user, className } = props

  const { resolution } = contract
  const sharesSum = sumBy(userBets, (bet) =>
    bet.outcome === 'YES' ? bet.shares : -bet.shares
  )

  const hasBets = userBets && !floatingEqual(sharesSum, 0)

  const isCpmm = contract.mechanism === 'cpmm-multi-1'

  const isDemocraticParty = answer.text == 'Democratic Party'

  return (
    <Col
      className={clsx(
        className,

        isDemocraticParty ? 'items-end text-right' : ''
      )}
    >
      <div className="text-ink-700">{answer.text}</div>
      <Spacer h={1} />
      <Row className={isDemocraticParty ? 'flex-row-reverse' : ''}>
        <AnswerStatus
          className="!text-5xl"
          contract={contract}
          answer={answer}
        />
        <BubblePercentChange
          probChange={answer.probChanges.day}
          className="whitespace-nowrap text-sm"
        />
      </Row>

      <Spacer h={2} />
      <div className="relative">
        <MultiBettor
          contract={contract as CPMMMultiContract}
          answer={answer}
          buttonClassName="w-20"
        />
        {!resolution && hasBets && isCpmm && user && (
          <UserPosition
            contract={contract as CPMMMultiContract}
            answer={answer}
            userBets={userBets}
            user={user}
            className="text-ink-500 dark:text-ink-700 absolute -bottom-[22px] left-0 text-xs hover:underline"
            greenArrowClassName="text-teal-600 dark:text-teal-300"
            redArrowClassName="text-scarlet-600 dark:text-scarlet-400"
          />
        )}
      </div>
    </Col>
  )
}
