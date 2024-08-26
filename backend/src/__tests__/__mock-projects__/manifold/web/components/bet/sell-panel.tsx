import { APIError } from 'common/api/utils'
import { Bet, LimitBet } from 'common/bet'
import {
  getAnswerProbability,
  getContractBetMetrics,
  getInvested,
  getProbability,
} from 'common/calculate'
import {
  calculateCpmmMultiSumsToOneSale,
  calculateCpmmSale,
  getCpmmProbability,
} from 'common/calculate-cpmm'
import {
  CPMMContract,
  CPMMMultiContract,
  CPMMNumericContract,
} from 'common/contract'
import { getMappedValue, getFormattedMappedValue } from 'common/pseudo-numeric'
import { User } from 'common/user'
import {
  formatLargeNumber,
  formatPercent,
  formatWithCommas,
  formatMoney,
} from 'common/util/format'
import { sumBy } from 'lodash'
import { useState } from 'react'
import { useUnfilledBetsAndBalanceByUserId } from 'web/hooks/use-bets'
import { api } from 'web/lib/api/api'
import { track } from 'web/lib/service/analytics'
import { WarningConfirmationButton } from '../buttons/warning-confirmation-button'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { Spacer } from '../layout/spacer'
import { AmountInput } from '../widgets/amount-input'
import { getSharesFromStonkShares, getStonkDisplayShares } from 'common/stonk'
import clsx from 'clsx'
import toast from 'react-hot-toast'
import { Answer } from 'common/answer'
import { addObjects } from 'common/util/object'
import { Fees, getFeeTotal, noFees } from 'common/fees'
import { FeeDisplay } from './fees'
import { TRADE_TERM } from 'common/envs/constants'

export function SellPanel(props: {
  contract: CPMMContract | CPMMMultiContract | CPMMNumericContract
  userBets: Bet[]
  shares: number
  sharesOutcome: 'YES' | 'NO'
  user: User
  onSellSuccess?: () => void
  answerId?: string
}) {
  const {
    contract,
    shares,
    sharesOutcome,
    userBets,
    user,
    onSellSuccess,
    answerId,
  } = props
  const { outcomeType } = contract
  const isPseudoNumeric = outcomeType === 'PSEUDO_NUMERIC'
  const isStonk = outcomeType === 'STONK'
  const isMultiSumsToOne =
    (outcomeType === 'MULTIPLE_CHOICE' && contract.shouldAnswersSumToOne) ||
    outcomeType === 'NUMBER'
  const answer =
    answerId && 'answers' in contract
      ? contract.answers.find((a) => a.id === answerId)
      : undefined

  const { unfilledBets: allUnfilledBets, balanceByUserId } =
    useUnfilledBetsAndBalanceByUserId(contract.id)

  const unfilledBets = answerId
    ? allUnfilledBets.filter((b) => b.answerId === answerId)
    : allUnfilledBets

  const [displayAmount, setDisplayAmount] = useState<number | undefined>(() => {
    const probChange = isMultiSumsToOne
      ? getSaleResultMultiSumsToOne(
          contract,
          answerId!,
          shares,
          sharesOutcome,
          unfilledBets,
          balanceByUserId
        ).probChange
      : getSaleResult(
          contract,
          shares,
          sharesOutcome,
          unfilledBets,
          balanceByUserId,
          answer
        ).probChange
    return probChange > 0.2
      ? undefined
      : isStonk
      ? getStonkDisplayShares(contract, shares)
      : shares
  })
  const [amount, setAmount] = useState<number | undefined>(
    isStonk
      ? getSharesFromStonkShares(contract, displayAmount ?? 0, shares)
      : displayAmount
  )

  // just for the input TODO: actually display somewhere
  const [error, setError] = useState<string | undefined>()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [wasSubmitted, setWasSubmitted] = useState(false)

  const betDisabled =
    isSubmitting || !amount || (error && error.includes('Maximum'))

  // Sell all shares if remaining shares would be < 1
  const isSellingAllShares = amount === Math.floor(shares)

  const sellQuantity = isSellingAllShares ? shares : amount ?? 0

  const loanAmount = sumBy(userBets, (bet) => bet.loanAmount ?? 0)
  const soldShares = Math.min(sellQuantity, shares)
  const saleFrac = soldShares / shares
  const loanPaid = saleFrac * loanAmount
  const isLoadPaid = loanPaid === 0

  const invested = getInvested(contract, userBets)
  const costBasis = invested * saleFrac

  async function submitSell() {
    if (!user || !amount) return

    setError(undefined)
    setIsSubmitting(true)

    await api('market/:contractId/sell', {
      shares: isSellingAllShares ? undefined : amount,
      outcome: sharesOutcome,
      contractId: contract.id,
      answerId,
    })
      .then(() => {
        setIsSubmitting(false)
        setWasSubmitted(true)
        setAmount(undefined)
        if (onSellSuccess) onSellSuccess()
      })
      .catch((e: unknown) => {
        console.error(e)
        if (e instanceof APIError) {
          const message = e.message.toString()
          toast.error(
            message.includes('could not serialize access')
              ? 'Error placing bet'
              : message
          )
        } else {
          setError(`Error placing ${TRADE_TERM}`)
        }
        setIsSubmitting(false)
      })

    track('sell shares', {
      outcomeType: contract.outcomeType,
      slug: contract.slug,
      contractId: contract.id,
      shares: sellQuantity,
      outcome: sharesOutcome,
    })
  }

  let initialProb: number, saleValue: number, buyAmount: number
  let fees: Fees
  let cpmmState
  if (isMultiSumsToOne) {
    ;({ initialProb, cpmmState, saleValue, fees, buyAmount } =
      getSaleResultMultiSumsToOne(
        contract,
        answerId!,
        sellQuantity,
        sharesOutcome,
        unfilledBets,
        balanceByUserId
      ))
  } else {
    ;({ initialProb, cpmmState, saleValue, fees, buyAmount } = getSaleResult(
      contract,
      sellQuantity,
      sharesOutcome,
      unfilledBets,
      balanceByUserId,
      answer
    ))
  }

  const totalFees = getFeeTotal(fees)
  const netProceeds = saleValue - loanPaid
  const profit = saleValue - costBasis
  const resultProb = getCpmmProbability(cpmmState.pool, cpmmState.p)

  const rawDifference = Math.abs(
    getMappedValue(contract, resultProb) - getMappedValue(contract, initialProb)
  )
  const displayedDifference =
    contract.outcomeType === 'PSEUDO_NUMERIC'
      ? formatLargeNumber(rawDifference)
      : formatPercent(rawDifference)
  const probChange = Math.abs(resultProb - initialProb)

  const warning =
    probChange >= 0.3
      ? `Are you sure you want to move the probability by ${displayedDifference}?`
      : undefined

  const onAmountChange = (displayAmount: number | undefined) => {
    setDisplayAmount(displayAmount)
    const realAmount = isStonk
      ? getSharesFromStonkShares(contract, displayAmount ?? 0, shares)
      : displayAmount
    setAmount(realAmount)

    // Check for errors.
    if (realAmount !== undefined && realAmount > shares) {
      setError(`Maximum ${formatWithCommas(Math.floor(shares))} shares`)
    } else {
      setError(undefined)
    }
  }

  return (
    <>
      <AmountInput
        amount={
          displayAmount === undefined
            ? undefined
            : isStonk
            ? displayAmount
            : Math.round(displayAmount) === 0
            ? 0
            : Math.floor(displayAmount)
        }
        allowFloat={isStonk}
        onChangeAmount={onAmountChange}
        label="Shares"
        error={!!error}
        disabled={isSubmitting}
        inputClassName="w-full !pl-[69px]"
        quickAddMoreButton={
          <button
            className={clsx(
              'text-ink-500 hover:bg-ink-200 border-ink-300 m-[1px] rounded-r-md px-2.5 transition-colors'
            )}
            onClick={() =>
              onAmountChange(
                isStonk ? getStonkDisplayShares(contract, shares) : shares
              )
            }
          >
            Max
          </button>
        }
      />
      <div className="text-error mb-2 mt-1 h-1 text-xs">{error}</div>

      <Col className="mt-3 w-full gap-3 text-sm">
        {!isStonk && (
          <Row className="text-ink-500 items-center justify-between gap-2">
            Sale value
            <span className="text-ink-700">
              {formatMoney(saleValue + totalFees)}
            </span>
          </Row>
        )}
        {!isLoadPaid && (
          <Row className="text-ink-500  items-center justify-between gap-2">
            Loan repayment
            <span className="text-ink-700">
              {formatMoney(Math.floor(-loanPaid))}
            </span>
          </Row>
        )}
        <Row className="text-ink-500 items-center justify-between gap-2">
          Fees
          <FeeDisplay totalFees={totalFees} amount={saleValue + totalFees} />
        </Row>
        <Row className="text-ink-500 items-center justify-between gap-2">
          Profit
          <span className="text-ink-700">{formatMoney(profit)}</span>
        </Row>
        <Row className="items-center justify-between">
          <div className="text-ink-500">
            {isPseudoNumeric
              ? 'Estimated value'
              : isStonk
              ? 'Stock price'
              : 'Probability'}
          </div>
          <div>
            {getFormattedMappedValue(contract, initialProb)}
            <span className="mx-2">→</span>
            {getFormattedMappedValue(contract, resultProb)}
          </div>
        </Row>

        <Row className="text-ink-1000 mt-4 items-center justify-between gap-2 text-xl">
          Payout
          <span className="text-ink-700">{formatMoney(netProceeds)}</span>
        </Row>
      </Col>

      <Spacer h={8} />

      <WarningConfirmationButton
        marketType="binary"
        amount={undefined}
        warning={warning}
        userOptedOutOfWarning={user.optOutBetWarnings}
        isSubmitting={isSubmitting}
        onSubmit={betDisabled ? undefined : submitSell}
        disabled={!!betDisabled}
        size="xl"
        color="indigo"
        actionLabel={
          isStonk
            ? `Sell ${formatMoney(saleValue)}`
            : `Sell ${formatWithCommas(sellQuantity)} shares`
        }
        inModal={true}
      />

      {wasSubmitted && <div className="mt-4">Sell submitted!</div>}
    </>
  )
}

const getSaleResult = (
  contract: CPMMContract | CPMMMultiContract | CPMMNumericContract,
  shares: number,
  outcome: 'YES' | 'NO',
  unfilledBets: LimitBet[],
  balanceByUserId: { [userId: string]: number },
  answer?: Answer
) => {
  if (contract.mechanism === 'cpmm-multi-1' && !answer)
    throw new Error('getSaleResult: answer must be defined for cpmm-multi-1')

  const initialProb = answer
    ? answer.prob
    : getProbability(contract as CPMMContract)
  const initialCpmmState = answer
    ? {
        pool: { YES: answer.poolYes, NO: answer.poolNo },
        p: 0.5,
        collectedFees: contract.collectedFees,
      }
    : {
        pool: (contract as CPMMContract).pool,
        p: (contract as CPMMContract).p,
        collectedFees: contract.collectedFees,
      }

  const { cpmmState, saleValue, buyAmount, fees } = calculateCpmmSale(
    initialCpmmState,
    shares,
    outcome,
    unfilledBets,
    balanceByUserId
  )
  const resultProb = getCpmmProbability(cpmmState.pool, cpmmState.p)
  const probChange = Math.abs(resultProb - initialProb)

  return {
    saleValue,
    buyAmount,
    cpmmState,
    initialProb,
    resultProb,
    probChange,
    fees,
  }
}

export const getSaleResultMultiSumsToOne = (
  contract: CPMMMultiContract | CPMMNumericContract,
  answerId: string,
  shares: number,
  outcome: 'YES' | 'NO',
  unfilledBets: LimitBet[],
  balanceByUserId: { [userId: string]: number }
) => {
  const initialProb = getAnswerProbability(contract, answerId)
  const answerToSell = contract.answers.find((a) => a.id === answerId)
  const { newBetResult, saleValue, buyAmount, otherBetResults } =
    calculateCpmmMultiSumsToOneSale(
      contract.answers,
      answerToSell!,
      shares,
      outcome,
      undefined,
      unfilledBets,
      balanceByUserId,
      contract.collectedFees
    )
  const { cpmmState, totalFees } = newBetResult
  const resultProb = getCpmmProbability(cpmmState.pool, cpmmState.p)
  const probChange = Math.abs(resultProb - initialProb)

  const fees = addObjects(
    totalFees,
    otherBetResults.map((r) => r.totalFees).reduce(addObjects, noFees)
  )

  return {
    saleValue,
    buyAmount,
    cpmmState,
    initialProb,
    resultProb,
    probChange,
    fees,
  }
}

export function MultiSellerPosition(props: {
  contract: CPMMMultiContract | CPMMNumericContract
  userBets: Bet[]
}) {
  const { contract, userBets } = props
  const { totalShares } = getContractBetMetrics(contract, userBets)
  const yesWinnings = totalShares.YES ?? 0
  const noWinnings = totalShares.NO ?? 0
  const position = yesWinnings - noWinnings

  if (position > 1e-7) {
    return <>YES</>
  }
  return <>NO</>
}

export function MultiSellerProfit(props: {
  contract: CPMMMultiContract | CPMMNumericContract
  userBets: Bet[]
  answer: Answer
}) {
  const { contract, userBets, answer } = props
  const { id: answerId } = answer
  const { outcomeType } = contract
  const isMultiSumsToOne =
    (outcomeType === 'MULTIPLE_CHOICE' && contract.shouldAnswersSumToOne) ||
    outcomeType === 'NUMBER'
  const sharesSum = sumBy(userBets, (bet) =>
    bet.outcome === 'YES' ? bet.shares : -bet.shares
  )
  const sharesOutcome = sharesSum > 0 ? 'YES' : 'NO'

  const { unfilledBets: allUnfilledBets, balanceByUserId } =
    useUnfilledBetsAndBalanceByUserId(contract.id)

  const unfilledBets = allUnfilledBets.filter((b) => b.answerId === answerId)

  let saleValue: number

  if (isMultiSumsToOne) {
    ;({ saleValue } = getSaleResultMultiSumsToOne(
      contract,
      answerId,
      Math.abs(sharesSum),
      sharesOutcome,
      unfilledBets,
      balanceByUserId
    ))
  } else {
    ;({ saleValue } = getSaleResult(
      contract,
      Math.abs(sharesSum),
      sharesOutcome,
      unfilledBets,
      balanceByUserId,
      answer
    ))
  }

  const invested = getInvested(contract, userBets)

  return <>{formatMoney(saleValue - invested)}</>
}
