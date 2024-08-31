import dayjs from 'dayjs'
import { clamp, sumBy } from 'lodash'
import { useRef, useState } from 'react'
import toast from 'react-hot-toast'

import { Answer } from 'common/answer'
import { LimitBet } from 'common/bet'
import { getProbability } from 'common/calculate'
import { CpmmState } from 'common/calculate-cpmm'
import { calculateCpmmMultiArbitrageBet } from 'common/calculate-cpmm-arbitrage'
import {
  BinaryContract,
  CPMMMultiContract,
  CPMMNumericContract,
  getBinaryMCProb,
  isBinaryMulti,
  MAX_CPMM_PROB,
  MIN_CPMM_PROB,
  MultiContract,
  PseudoNumericContract,
  StonkContract,
} from 'common/contract'
import { computeCpmmBet } from 'common/new-bet'
import { formatPercent } from 'common/util/format'
import { DAY_MS, HOUR_MS, MINUTE_MS, WEEK_MS } from 'common/util/time'
import { Input } from 'web/components/widgets/input'
import { User } from 'web/lib/firebase/users'
import { Button } from '../buttons/button'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { BinaryOutcomeLabel, PseudoNumericOutcomeLabel } from '../outcome-label'
import { BuyAmountInput } from '../widgets/amount-input'
import { ProbabilityOrNumericInput } from '../widgets/probability-input'
import { getPseudoProbability } from 'common/pseudo-numeric'
import { usePersistentInMemoryState } from 'web/hooks/use-persistent-in-memory-state'
import { MultiBetProps } from 'web/components/bet/bet-panel'
import { track } from 'web/lib/service/analytics'
import { APIError } from 'common/api/utils'
import { addObjects, removeUndefinedProps } from 'common/util/object'
import { api } from 'web/lib/api/api'
import clsx from 'clsx'
import { getAnswerColor } from '../charts/contract/choice'
import { Fees, getFeeTotal, noFees } from 'common/fees'
import { FeeDisplay } from './fees'
import { MoneyDisplay } from './money-display'
import { TRADE_TERM } from 'common/envs/constants'
import { capitalize } from 'lodash'

export default function LimitOrderPanel(props: {
  contract:
    | BinaryContract
    | PseudoNumericContract
    | StonkContract
    | CPMMMultiContract
    | CPMMNumericContract
  multiProps?: MultiBetProps
  user: User | null | undefined
  unfilledBets: LimitBet[]
  balanceByUserId: { [userId: string]: number }

  onBuySuccess?: () => void
  className?: string
  outcome: 'YES' | 'NO' | undefined
}) {
  const {
    contract,
    multiProps,
    unfilledBets,
    balanceByUserId,
    user,
    outcome,
    onBuySuccess,
  } = props
  const isBinaryMC = isBinaryMulti(contract)
  const binaryMCColors = isBinaryMC
    ? (contract as MultiContract).answers.map(getAnswerColor)
    : undefined

  const binaryMCOutcome =
    isBinaryMC && multiProps
      ? multiProps.answerText === multiProps.answerToBuy.text
        ? 'YES'
        : 'NO'
      : undefined
  const isCpmmMulti = contract.mechanism === 'cpmm-multi-1'
  if (isCpmmMulti && !multiProps) {
    throw new Error('multiProps must be defined for cpmm-multi-1')
  }
  const isPseudoNumeric = contract.outcomeType === 'PSEUDO_NUMERIC'

  const defaultBetAmount = 1000
  const [betAmount, setBetAmount] = useState<number | undefined>(
    defaultBetAmount
  )
  const [error, setError] = useState<string | undefined>()
  const [inputError, setInputError] = useState<boolean>(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const betDeps = useRef<LimitBet[]>()
  // Expiring orders
  const [addExpiration, setAddExpiration] = usePersistentInMemoryState(
    false,
    'add-limit-order-expiration'
  )
  const initTimeInMs = Number(Date.now() + 5 * MINUTE_MS)
  const initDate = dayjs(initTimeInMs).format('YYYY-MM-DD')
  const initTime = dayjs(initTimeInMs).format('HH:mm')
  const [expirationDate, setExpirationDate] =
    usePersistentInMemoryState<string>(initDate, 'limit-order-expiration-date')
  const [expirationHoursMinutes, setExpirationHoursMinutes] =
    usePersistentInMemoryState<string>(initTime, 'limit-order-expiration-time')

  const expiresAt = addExpiration
    ? dayjs(`${expirationDate}T${expirationHoursMinutes}`).valueOf()
    : undefined

  const initialProb =
    isBinaryMC && outcome === 'YES'
      ? multiProps!.answerToBuy.prob
      : isBinaryMC && outcome === 'NO'
      ? 1 - multiProps!.answerToBuy.prob
      : isCpmmMulti
      ? multiProps!.answerToBuy.prob
      : getProbability(contract)

  const [limitProbInt, setLimitProbInt] = useState<number | undefined>(
    Math.round(initialProb * 100)
  )

  const hasLimitBet = !!limitProbInt && !!betAmount

  const betDisabled =
    isSubmitting ||
    !outcome ||
    !betAmount ||
    !hasLimitBet ||
    error === 'Insufficient balance'

  const preLimitProb =
    limitProbInt === undefined
      ? undefined
      : clamp(
          isPseudoNumeric
            ? getPseudoProbability(
                limitProbInt,
                contract.min,
                contract.max,
                contract.isLogScale
              )
            : limitProbInt / 100,
          0.001,
          0.999
        )
  const limitProb =
    !preLimitProb || !isBinaryMC
      ? preLimitProb
      : getBinaryMCProb(preLimitProb, outcome as 'YES' | 'NO')

  const amount = betAmount ?? 0

  function onBetChange(newAmount: number | undefined) {
    setBetAmount(newAmount)
  }

  const cpmmState = isCpmmMulti
    ? {
        pool: {
          YES: multiProps!.answerToBuy.poolYes,
          NO: multiProps!.answerToBuy.poolNo,
        },
        p: 0.5,
        collectedFees: contract.collectedFees,
      }
    : {
        pool: contract.pool,
        p: contract.p,
        collectedFees: contract.collectedFees,
      }

  async function submitBet() {
    if (!user || betDisabled) return

    setError(undefined)
    setIsSubmitting(true)

    const answerId = multiProps?.answerToBuy.id

    try {
      const bet = await toast.promise(
        api(
          'bet',
          removeUndefinedProps({
            outcome,
            amount,
            contractId: contract.id,
            answerId,
            limitProb: limitProb,
            expiresAt,
            deps: betDeps.current?.map((b) => b.userId),
          })
        ),
        {
          loading: `Submitting ${TRADE_TERM}...`,
          success: `${capitalize(TRADE_TERM)} submitted!`,
          error: `Error submitting ${TRADE_TERM}`,
        }
      )

      console.log(`placed ${TRADE_TERM}. Result:`, bet)
      if (onBuySuccess) onBuySuccess()

      // TODO: Twomba tracking bet terminology
      await track('bet', {
        location: 'bet panel',
        outcomeType: contract.outcomeType,
        slug: contract.slug,
        contractId: contract.id,
        amount,
        outcome,
        limitProb: limitProb,
        isLimitOrder: true,
        answerId: multiProps?.answerToBuy.id,
      })
    } catch (e) {
      if (e instanceof APIError) {
        setError(e.message.toString())
      } else {
        console.error(e)
        setError(`Error placing ${TRADE_TERM}`)
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const shouldAnswersSumToOne =
    'shouldAnswersSumToOne' in contract ? contract.shouldAnswersSumToOne : false

  let currentPayout = 0
  let currentReturn = 0
  let orderAmount = 0
  let filledAmount = 0
  let fees = noFees
  try {
    const result = getBetReturns(
      cpmmState,
      binaryMCOutcome ?? outcome ?? 'YES',
      amount,
      limitProb ?? initialProb,
      unfilledBets,
      balanceByUserId,
      shouldAnswersSumToOne ? multiProps : undefined
    )
    currentPayout = result.currentPayout
    currentReturn = result.currentReturn
    orderAmount = result.orderAmount
    filledAmount = result.amount
    fees = result.fees
    betDeps.current = result.betDeps
  } catch (err: any) {
    // TODO: Twomba tracking bet terminology
    console.error('Error in calculateCpmmMultiArbitrageBet:', err)
    setError(
      err?.message ??
        `An error occurred during ${TRADE_TERM} calculation, try again.`
    )
  }
  const returnPercent = formatPercent(currentReturn)
  const totalFees = getFeeTotal(fees)

  const isCashContract = contract.token === 'CASH'

  return (
    <>
      <Col className="relative my-2 w-full gap-3">
        <Row className="text-ink-700 w-full items-center gap-3">
          {isPseudoNumeric ? 'Value' : 'Probability'}
          <ProbabilityOrNumericInput
            contract={contract}
            prob={limitProbInt}
            setProb={setLimitProbInt}
            error={inputError}
            onRangeError={setInputError}
            disabled={isSubmitting}
          />
        </Row>
      </Col>

      <Row className={'text-ink-700 my-2 items-center space-x-3'}>
        {capitalize(TRADE_TERM)} amount
      </Row>
      <BuyAmountInput
        amount={betAmount}
        onChange={onBetChange}
        error={error}
        setError={setError}
        disabled={isSubmitting}
        showSlider
        token={isCashContract ? 'CASH' : 'M$'}
      />

      <div className="my-3">
        <Button
          className={'mt-4'}
          onClick={() => setAddExpiration(!addExpiration)}
          color={'indigo-outline'}
          disabled={isSubmitting}
        >
          {addExpiration ? 'Remove expiration date' : 'Add expiration date'}
        </Button>
        {addExpiration && (
          <Col className="gap-2">
            <Row className="mt-4 gap-2">
              <Input
                type={'date'}
                className="dark:date-range-input-white"
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => {
                  setExpirationDate(e.target.value)
                  if (!expirationHoursMinutes) {
                    setExpirationHoursMinutes(initTime)
                  }
                }}
                min={dayjs().format('YYYY-MM-DD')}
                max="9999-12-31"
                disabled={isSubmitting}
                value={expirationDate}
              />
              <Input
                type={'time'}
                className="dark:date-range-input-white"
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => setExpirationHoursMinutes(e.target.value)}
                disabled={isSubmitting}
                value={expirationHoursMinutes}
              />
            </Row>
            <Row className="gap-2">
              <Button
                color={'indigo-outline'}
                size={'sm'}
                onClick={() => {
                  const num =
                    dayjs(
                      `${expirationDate}T${expirationHoursMinutes}`
                    ).valueOf() + MINUTE_MS
                  const addTime = dayjs(num).format('HH:mm')
                  setExpirationHoursMinutes(addTime)
                }}
              >
                + 1Min
              </Button>{' '}
              <Button
                color={'indigo-outline'}
                size={'sm'}
                onClick={() => {
                  const num =
                    dayjs(
                      `${expirationDate}T${expirationHoursMinutes}`
                    ).valueOf() + HOUR_MS
                  const addTime = dayjs(num).format('HH:mm')
                  setExpirationHoursMinutes(addTime)
                }}
              >
                + 1Hr
              </Button>
              <Button
                color={'indigo-outline'}
                size={'sm'}
                onClick={() => {
                  const num = dayjs(expirationDate).valueOf() + DAY_MS
                  const addDay = dayjs(num).format('YYYY-MM-DD')
                  setExpirationDate(addDay)
                }}
              >
                + 1D
              </Button>
              <Button
                color={'indigo-outline'}
                size={'sm'}
                onClick={() => {
                  const num = dayjs(expirationDate).valueOf() + WEEK_MS
                  const addDay = dayjs(num).format('YYYY-MM-DD')
                  setExpirationDate(addDay)
                }}
              >
                + 1W
              </Button>
            </Row>
          </Col>
        )}
      </div>

      <Col className="mt-2 w-full gap-3">
        {outcome && hasLimitBet && filledAmount > 0 && (
          <Row className="items-center justify-between gap-2 text-sm">
            <div className="text-ink-500 whitespace-nowrap">
              {isPseudoNumeric ? (
                <PseudoNumericOutcomeLabel outcome={outcome} />
              ) : (
                !isBinaryMC && <BinaryOutcomeLabel outcome={outcome} />
              )}{' '}
              {isBinaryMC ? 'Filled' : 'filled'} now
            </div>
            <div className="mr-2 whitespace-nowrap">
              <MoneyDisplay
                amount={filledAmount}
                isCashContract={isCashContract}
              />{' '}
              of{' '}
              <MoneyDisplay
                amount={orderAmount}
                isCashContract={isCashContract}
              />
            </div>
          </Row>
        )}

        {outcome && hasLimitBet && (
          <Row className="items-center justify-between gap-2 text-sm">
            <Row className="text-ink-500 flex-nowrap items-center gap-2 whitespace-nowrap">
              <div>
                {isPseudoNumeric ? (
                  'Shares'
                ) : (
                  <>
                    Max{' '}
                    {!isBinaryMC && <BinaryOutcomeLabel outcome={outcome} />}{' '}
                    payout
                  </>
                )}
              </div>
            </Row>
            <div>
              <span className="mr-2 whitespace-nowrap">
                <MoneyDisplay
                  amount={currentPayout}
                  isCashContract={isCashContract}
                />
              </span>
              ({returnPercent})
            </div>
          </Row>
        )}

        <Row className="items-center justify-between gap-2 text-sm">
          <Row className="text-ink-500 flex-nowrap items-center gap-2 whitespace-nowrap">
            Fees
          </Row>
          <FeeDisplay
            amount={filledAmount}
            totalFees={totalFees}
            isCashContract={isCashContract}
          />
        </Row>

        <Row className="items-center justify-between gap-2">
          {user && (
            <Button
              size="xl"
              disabled={betDisabled || inputError}
              color={isBinaryMC ? 'none' : outcome === 'YES' ? 'green' : 'red'}
              loading={isSubmitting}
              className={clsx('flex-1 text-white')}
              style={{
                backgroundColor: binaryMCColors?.[outcome == 'YES' ? 0 : 1],
              }}
              onClick={submitBet}
            >
              {isSubmitting ? (
                'Submitting...'
              ) : !outcome ? (
                'Choose YES or NO'
              ) : !limitProb ? (
                'Enter a probability'
              ) : !betAmount ? (
                'Enter an amount'
              ) : binaryMCOutcome ? (
                <span>
                  Submit order for{' '}
                  <MoneyDisplay
                    amount={betAmount}
                    isCashContract={isCashContract}
                  />{' '}
                  at {formatPercent(preLimitProb ?? 0)}
                </span>
              ) : (
                <span>
                  Submit {outcome} order for{' '}
                  <MoneyDisplay
                    amount={betAmount}
                    isCashContract={isCashContract}
                  />{' '}
                  at {formatPercent(limitProb)}
                </span>
              )}
            </Button>
          )}
        </Row>
      </Col>
    </>
  )
}

const getBetReturns = (
  cpmmState: CpmmState,
  outcome: 'YES' | 'NO',
  betAmount: number,
  limitProb: number | undefined,
  unfilledBets: LimitBet[],
  balanceByUserId: { [userId: string]: number },
  arbitrageProps?: {
    answers: Answer[]
    answerToBuy: Answer
  }
) => {
  const orderAmount = betAmount
  let amount: number
  let shares: number
  let fees: Fees
  let betDeps: LimitBet[]
  if (arbitrageProps) {
    const { answers, answerToBuy } = arbitrageProps
    const { newBetResult, otherBetResults } = calculateCpmmMultiArbitrageBet(
      answers,
      answerToBuy,
      outcome,
      betAmount,
      limitProb,
      unfilledBets,
      balanceByUserId,
      cpmmState.collectedFees
    )
    amount = sumBy(newBetResult.takers, 'amount')
    shares = sumBy(newBetResult.takers, 'shares')
    betDeps = newBetResult.makers
      .map((m) => m.bet)
      .concat(otherBetResults.flatMap((r) => r.makers.map((m) => m.bet)))
      .concat(newBetResult.ordersToCancel)
      .concat(otherBetResults.flatMap((r) => r.ordersToCancel))
    fees = addObjects(
      newBetResult.totalFees,
      otherBetResults.reduce(
        (feeSum, results) => addObjects(feeSum, results.totalFees),
        noFees
      )
    )
  } else {
    const result = computeCpmmBet(
      cpmmState,
      outcome,
      betAmount,
      limitProb,
      unfilledBets,
      balanceByUserId,
      !arbitrageProps && { max: MAX_CPMM_PROB, min: MIN_CPMM_PROB }
    )
    amount = result.amount
    shares = result.shares
    fees = result.fees
    betDeps = result.makers.map((m) => m.bet).concat(result.ordersToCancel)
  }

  const remainingMatched = limitProb
    ? ((orderAmount ?? 0) - amount) /
      (outcome === 'YES' ? limitProb : 1 - limitProb)
    : 0
  const currentPayout = shares + remainingMatched
  const currentReturn = betAmount ? (currentPayout - betAmount) / betAmount : 0

  return {
    orderAmount,
    amount,
    shares,
    currentPayout,
    currentReturn,
    fees,
    betDeps,
  }
}
