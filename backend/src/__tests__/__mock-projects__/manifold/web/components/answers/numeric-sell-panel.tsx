import { CPMMNumericContract } from 'common/contract'
import { Col } from 'web/components/layout/col'
import { Answer } from 'common/answer'
import { Button, IconButton } from 'web/components/buttons/button'
import { useMemo, useState } from 'react'
import { debounce, find, groupBy, mapValues, sum, sumBy } from 'lodash'
import { floatingEqual, floatingGreater } from 'common/util/math'
import clsx from 'clsx'
import { formatMoney } from 'common/util/format'
import { RangeSlider } from 'web/components/widgets/slider'
import { api } from 'web/lib/api/api'
import { removeUndefinedProps } from 'common/util/object'
import { filterDefined } from 'common/util/array'
import { toast } from 'react-hot-toast'
import {
  getExpectedValue,
  answerTextToRange,
  getRangeContainingValues,
  answerToMidpoint,
  formatExpectedValue,
  NEW_GRAPH_COLOR,
  answerToRange,
} from 'common/multi-numeric'
import { Bet } from 'common/bet'
import { calculateCpmmMultiArbitrageSellYesEqually } from 'common/calculate-cpmm-arbitrage'
import { useUnfilledBetsAndBalanceByUserId } from 'web/hooks/use-bets'
import { SizedContainer } from 'web/components/sized-container'
import { MultiNumericDistributionChart } from 'web/components/answers/numeric-bet-panel'
import { Row } from 'web/components/layout/row'
import { getInvested } from 'common/calculate'
import { DiagonalPattern } from 'web/components/charts/generic-charts'
import { NUMERIC_GRAPH_COLOR } from 'common/numeric-constants'
import { FeeDisplay } from 'web/components/bet/fees'
import { XIcon } from '@heroicons/react/solid'

export const NumericSellPanel = (props: {
  contract: CPMMNumericContract
  userBets: Bet[]
  cancel: () => void
}) => {
  const { contract, userBets, cancel } = props
  const { answers, min: minimum, max: maximum } = contract
  const expectedValue = getExpectedValue(contract)
  const userNonRedemptionBetsByAnswer = groupBy(
    userBets.filter((bet) => bet.shares !== 0),
    (bet) => bet.answerId
  )

  const answersToSharesIn = mapValues(userNonRedemptionBetsByAnswer, (bets) =>
    sumBy(bets, (b) => b.shares)
  )
  const answersWithSharesIn = answers.filter((a) =>
    floatingGreater(answersToSharesIn[a.id], 0)
  )
  const sharesRange = getRangeContainingValues(
    answersWithSharesIn.map(answerToMidpoint),
    contract
  )
  const [range, setRange] = useState<[number, number]>(sharesRange)
  const [debouncedRange, setDebouncedRange] =
    useState<[number, number]>(sharesRange)

  const [isSubmitting, setIsSubmitting] = useState(false)
  const { unfilledBets, balanceByUserId } = useUnfilledBetsAndBalanceByUserId(
    contract.id
  )
  const stringifiedAnswers = JSON.stringify(answers)

  const roundToEpsilon = (num: number) => Number(num.toFixed(2))

  const shouldIncludeAnswer = (a: Answer) => {
    const answerRange = answerTextToRange(a.text)
    return (
      answerRange[0] >= range[0] &&
      answerRange[1] <= range[1] &&
      answersToSharesIn[a.id] > 0
    )
  }
  const answerIdsToSell = answers
    .filter((a) => shouldIncludeAnswer(a))
    .map((a) => a.id)
  const sharesInAnswersToSell = sum(
    answerIdsToSell.map((a) => answersToSharesIn[a])
  )

  const sellShares = async () => {
    setIsSubmitting(true)
    await toast
      .promise(
        api(
          'multi-sell',
          removeUndefinedProps({
            contractId: contract.id,
            answerIds: filterDefined(answerIdsToSell),
          })
        ),
        {
          loading: 'Selling shares...',
          success: 'Shares sold!',
          error: (e) => e.message,
        }
      )
      .finally(() => setIsSubmitting(false))
  }

  const debounceRange = useMemo(
    () =>
      debounce((range: number[]) => {
        setDebouncedRange(range as [number, number])
      }, 300),
    []
  )

  const onChangeRange = (low: number, high: number) => {
    if (low === high) return
    if (low < sharesRange[0]) {
      low = sharesRange[0]
    }
    if (high > sharesRange[1]) {
      high = sharesRange[1]
    }
    setRange([
      roundToEpsilon(low),
      roundToEpsilon(
        high !== range[1] ? (high === maximum ? maximum : high) : range[1]
      ),
    ])
    debounceRange(range)
  }

  const {
    potentialPayout,
    potentialExpectedValue,
    potentialContractState,
    loanPaid,
    invested,
    totalFee,
  } = useMemo(() => {
    const nullRes = {
      potentialPayout: 0,
      potentialExpectedValue: expectedValue,
      potentialContractState: contract,
      loanPaid: 0,
      invested: 0,
      totalFee: 0,
    }
    if (sharesInAnswersToSell <= 0 || !answerIdsToSell.length) return nullRes
    const betsOnAnswersToSell = userBets.filter(
      (bet) => bet.answerId && answerIdsToSell.includes(bet.answerId)
    )
    const invested = getInvested(contract, betsOnAnswersToSell)

    const userBetsToSellByAnswerId = groupBy(
      betsOnAnswersToSell.filter((bet) => bet.shares !== 0),
      (bet) => bet.answerId
    )
    const loanPaid = sumBy(betsOnAnswersToSell, (bet) => bet.loanAmount ?? 0)
    const { newBetResults, updatedAnswers, totalFee } =
      calculateCpmmMultiArbitrageSellYesEqually(
        contract.answers,
        userBetsToSellByAnswerId,
        unfilledBets,
        balanceByUserId,
        contract.collectedFees
      )
    const potentialPayout = sumBy(
      newBetResults.flatMap((r) => r.takers),
      (taker) => -taker.amount
    )

    const potentialContractState = {
      ...contract,
      answers: answers.map(
        (a) => find(updatedAnswers, (update) => update.id === a.id) ?? a
      ),
    }
    const potentialExpectedValue = getExpectedValue(potentialContractState)

    return {
      loanPaid,
      invested,
      potentialPayout,
      potentialExpectedValue,
      potentialContractState,
      totalFee,
    }
  }, [
    JSON.stringify(userBets),
    stringifiedAnswers,
    JSON.stringify(unfilledBets),
    JSON.stringify(balanceByUserId),
    debouncedRange,
  ])
  const isLoanOwed = loanPaid > 0
  const profit = potentialPayout - invested
  const netProceeds = potentialPayout - loanPaid
  const patternId = `pattern-${Math.random().toString(36).slice(2, 9)}`
  return (
    <Col className={'mt-2 gap-2'}>
      <Row className={'justify-between'}>
        <span className={'mb-2 text-xl'}>Probability Distribution</span>
        <IconButton className={'w-12'} disabled={isSubmitting} onClick={cancel}>
          <XIcon className={'h-4 w-4'} />
        </IconButton>
      </Row>
      <Row className={' flex-wrap gap-4'}>
        <Row className={'gap-1'}>
          <svg width="20" height="20" viewBox="0 0 120 120">
            <circle
              cx="60"
              cy="60"
              r="50"
              fill={NUMERIC_GRAPH_COLOR}
              opacity={0.7}
            />
          </svg>
          <span className={'text-ink-500 text-sm'}>Before sale</span>
        </Row>
        <Row className={'gap-1'}>
          <svg width="20" height="20" viewBox="0 0 120 120">
            <circle
              cx="60"
              cy="60"
              r="50"
              fill={NEW_GRAPH_COLOR}
              opacity={0.7}
            />
          </svg>
          <span className={'text-ink-500 text-sm'}>After sale</span>
        </Row>
        <Row className={'gap-1'}>
          <svg width="20" height="20" viewBox="0 0 120 120">
            <defs>
              <DiagonalPattern
                size={20}
                strokeWidth={5}
                id={patternId}
                color={'#007bcb'}
              />
            </defs>
            <circle cx="60" cy="60" r="50" fill={`url(#${patternId})`} />
          </svg>
          <span className={'text-ink-500 text-sm'}>
            Range you have shares in ({sharesRange[0]} - {sharesRange[1]})
          </span>
        </Row>
      </Row>
      <Col className={'mb-2 gap-2'}>
        <SizedContainer
          className={clsx('h-[150px] w-full pb-3 pr-6 sm:h-[200px]')}
        >
          {(w, h) => (
            <MultiNumericDistributionChart
              newColor={NEW_GRAPH_COLOR}
              contract={contract}
              updatedContract={potentialContractState}
              width={w}
              height={h}
              range={range}
              shadedRanges={
                answersWithSharesIn.map(answerToRange) as [number, number][]
              }
            />
          )}
        </SizedContainer>
        <RangeSlider
          step={Math.abs(maximum - minimum) / contract.answers.length}
          color={'indigo'}
          className={'-ml-1 mr-4 h-4 items-end'}
          highValue={range[1]}
          lowValue={range[0]}
          setValues={onChangeRange}
          min={minimum}
          max={maximum}
        />
      </Col>
      <Row className="text-ink-500 mx-4 items-center justify-between sm:justify-end sm:gap-28 ">
        <Col className={'text-ink-500 gap-2'}>
          <span className={''}>Sale value:</span>
          {isLoanOwed && <span>Loan repayment</span>}
          Profit
          <div className="text-ink-500">{'Expected value'}</div>
          Payout
          <div>Fees</div>
        </Col>
        <Col className={'text-ink-700 items-end gap-2'}>
          <span className="text-ink-700">{formatMoney(potentialPayout)}</span>
          {isLoanOwed && <span>{formatMoney(Math.floor(-loanPaid))}</span>}
          <span className="text-ink-700">{formatMoney(profit)}</span>
          <div>
            {formatExpectedValue(expectedValue, contract)}
            <span className="mx-2">→</span>
            {formatExpectedValue(
              potentialExpectedValue,
              potentialContractState
            )}
          </div>
          <span className="text-ink-700">{formatMoney(netProceeds)}</span>
          <FeeDisplay totalFees={totalFee} amount={potentialPayout} />
        </Col>
      </Row>
      <Row className={'mx-4 justify-end'}>
        <Button
          disabled={isSubmitting || sharesInAnswersToSell <= 0}
          onClick={sellShares}
          loading={isSubmitting}
        >
          Sell {Math.floor(sharesInAnswersToSell)} shares between {range[0]} and{' '}
          {range[1]}
        </Button>
      </Row>
    </Col>
  )
}
export const MultiNumericSellPanel = (props: {
  contract: CPMMNumericContract
  userBets: Bet[]
}) => {
  const { contract, userBets } = props
  const [showSellPanel, setShowSellPanel] = useState(false)
  const totalShares = sumBy(userBets, (bet) => bet.shares)
  if (floatingEqual(totalShares, 0)) return null

  return (
    <Col className={'mt-2 gap-2'}>
      {!showSellPanel && (
        <Button
          color={'gray-outline'}
          className={'w-48'}
          size={'sm'}
          onClick={async () => {
            setShowSellPanel(!showSellPanel)
          }}
        >
          Show sell shares panel
        </Button>
      )}
      {showSellPanel && (
        <NumericSellPanel
          cancel={() => setShowSellPanel(false)}
          contract={contract}
          userBets={userBets}
        />
      )}
    </Col>
  )
}
