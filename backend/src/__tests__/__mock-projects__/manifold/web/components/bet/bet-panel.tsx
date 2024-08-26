import clsx from 'clsx'
import { useEffect, useRef, useState } from 'react'
import { sumBy } from 'lodash'
import toast from 'react-hot-toast'
import { ChevronDownIcon, XIcon } from '@heroicons/react/outline'

import {
  BinaryContract,
  CPMMMultiContract,
  CPMMNumericContract,
  isBinaryMulti,
  MAX_CPMM_PROB,
  MAX_STONK_PROB,
  MIN_CPMM_PROB,
  MIN_STONK_PROB,
  MultiContract,
  PseudoNumericContract,
  StonkContract,
} from 'common/contract'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import {
  formatLargeNumber,
  formatMoney,
  formatOutcomeLabel,
  formatPercent,
} from 'common/util/format'
import { computeCpmmBet } from 'common/new-bet'
import { firebaseLogin } from 'web/lib/firebase/users'
import { APIError, api } from 'web/lib/api/api'
import { BuyAmountInput } from '../widgets/amount-input'

import { useFocus } from 'web/hooks/use-focus'
import { useUnfilledBetsAndBalanceByUserId } from 'web/hooks/use-bets'
import { getFormattedMappedValue } from 'common/pseudo-numeric'
import { OrderBookPanel, YourOrders } from './order-book'
import { track, withTracking } from 'web/lib/service/analytics'
import { YesNoSelector } from './yes-no-selector'
import { isAndroid, isIOS } from 'web/lib/util/device'
import { WarningConfirmationButton } from '../buttons/warning-confirmation-button'
import { Button } from '../buttons/button'
import { InfoTooltip } from 'web/components/widgets/info-tooltip'
import { getStonkDisplayShares, STONK_NO, STONK_YES } from 'common/stonk'
import { Answer } from 'common/answer'
import { getCpmmProbability } from 'common/calculate-cpmm'
import { removeUndefinedProps } from 'common/util/object'
import { calculateCpmmMultiArbitrageBet } from 'common/calculate-cpmm-arbitrage'
import LimitOrderPanel from './limit-order-panel'
import { useIsAdvancedTrader } from 'web/hooks/use-is-advanced-trader'
import { ChoicesToggleGroup } from '../widgets/choices-toggle-group'
import { useUser } from 'web/hooks/use-user'
import { getFeeTotal } from 'common/fees'
import { FeeDisplay } from './fees'
import { floatingEqual } from 'common/util/math'
import { getTierFromLiquidity } from 'common/tier'
import { getAnswerColor } from '../charts/contract/choice'
import { LimitBet } from 'common/bet'
import { TRADE_TERM, TWOMBA_ENABLED } from 'common/envs/constants'
import { MoneyDisplay } from './money-display'
import { capitalize } from 'lodash'

export type BinaryOutcomes = 'YES' | 'NO' | undefined

export type MultiBetProps = {
  answers: Answer[]
  answerToBuy: Answer
  answerText?: string
}

export function BuyPanel(props: {
  contract:
    | BinaryContract
    | PseudoNumericContract
    | StonkContract
    | CPMMMultiContract
    | CPMMNumericContract
  multiProps?: MultiBetProps
  inModal: boolean
  onBuySuccess?: () => void
  initialOutcome?: BinaryOutcomes
  location?: string
  replyToCommentId?: string
  alwaysShowOutcomeSwitcher?: boolean
  feedReason?: string
  children?: React.ReactNode
}) {
  const {
    contract,
    initialOutcome,
    location = 'bet panel',
    inModal,
    alwaysShowOutcomeSwitcher,
    children,
  } = props

  const isPseudoNumeric = contract.outcomeType === 'PSEUDO_NUMERIC'
  const isStonk = contract.outcomeType === 'STONK'

  const [outcome, setOutcome] = useState<BinaryOutcomes>(initialOutcome)

  const [isPanelBodyVisible, setIsPanelBodyVisible] = useState(false)

  useEffect(() => {
    if (initialOutcome) {
      setOutcome(initialOutcome)
      setIsPanelBodyVisible(true)
    }
  }, [initialOutcome])

  function onOutcomeChoice(choice: 'YES' | 'NO') {
    if (outcome === choice && !initialOutcome) {
      setOutcome(undefined)
      setIsPanelBodyVisible(false)
    } else {
      // TODO: Twomba tracking bet terminology
      track('bet intent', { location, option: outcome })

      setOutcome(choice)
      setIsPanelBodyVisible(true)
    }
  }

  return (
    <Col>
      {!isPanelBodyVisible && (
        <Col>
          <Row className={clsx('mb-2 w-full items-center gap-2')}>
            <YesNoSelector
              className="flex-1"
              btnClassName="flex-1 px-2 sm:px-6"
              selected={outcome}
              highlight
              onSelect={(choice) => {
                onOutcomeChoice(choice)
              }}
              yesLabel={
                isPseudoNumeric ? 'HIGHER' : isStonk ? STONK_YES : 'YES'
              }
              noLabel={isPseudoNumeric ? 'LOWER' : isStonk ? STONK_NO : 'NO'}
              isCash={contract.token === 'CASH'}
              includeWordBet={!isStonk}
            />
          </Row>
        </Col>
      )}
      {isPanelBodyVisible && (
        <BuyPanelBody
          {...props}
          panelClassName={
            TWOMBA_ENABLED
              ? 'bg-canvas-50'
              : outcome === 'NO'
              ? 'bg-scarlet-50'
              : outcome === 'YES'
              ? 'bg-teal-50'
              : ''
          }
          outcome={outcome}
          setOutcome={setOutcome}
          onClose={
            inModal || alwaysShowOutcomeSwitcher
              ? undefined
              : () => {
                  setIsPanelBodyVisible(false)
                  if (initialOutcome == undefined) {
                    setOutcome(undefined)
                  }
                }
          }
        >
          {children}
        </BuyPanelBody>
      )}
    </Col>
  )
}

export const BuyPanelBody = (props: {
  contract:
    | BinaryContract
    | PseudoNumericContract
    | StonkContract
    | CPMMMultiContract
    | CPMMNumericContract
  multiProps?: MultiBetProps
  onBuySuccess?: () => void
  outcome?: BinaryOutcomes
  setOutcome: (outcome: 'YES' | 'NO') => void
  alwaysShowOutcomeSwitcher?: boolean
  location?: string
  onClose?: () => void
  replyToCommentId?: string
  feedReason?: string
  panelClassName?: string
  children?: React.ReactNode
}) => {
  const {
    contract,
    multiProps,
    outcome,
    setOutcome,
    alwaysShowOutcomeSwitcher,
    onBuySuccess,
    location = 'bet panel',
    onClose,
    replyToCommentId,
    feedReason,
    panelClassName,
    children,
  } = props

  const user = useUser()

  const marketTier =
    contract.marketTier ??
    getTierFromLiquidity(contract, contract.totalLiquidity)

  const { unfilledBets: allUnfilledBets, balanceByUserId } =
    useUnfilledBetsAndBalanceByUserId(contract.id)

  const unfilledBetsMatchingAnswer = allUnfilledBets.filter(
    (b) => b.answerId === multiProps?.answerToBuy?.id
  )

  const isBinaryMC = isBinaryMulti(contract)
  const binaryMCColors = isBinaryMC
    ? (contract as MultiContract).answers.map(getAnswerColor)
    : undefined

  const binaryMCOutcomeLabel =
    isBinaryMC && multiProps
      ? multiProps.answerText ?? multiProps.answerToBuy.text
      : undefined

  const initialBetAmount = marketTier === 'play' ? 5 : 50

  const [betAmount, setBetAmount] = useState<number | undefined>(
    initialBetAmount
  )

  const [error, setError] = useState<string | undefined>()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const betDeps = useRef<LimitBet[]>()

  const [inputRef, focusAmountInput] = useFocus()

  const isCpmmMulti = contract.mechanism === 'cpmm-multi-1'
  if (isCpmmMulti && !multiProps) {
    throw new Error('multiProps must be defined for cpmm-multi-1')
  }
  const shouldAnswersSumToOne =
    'shouldAnswersSumToOne' in contract ? contract.shouldAnswersSumToOne : false

  const unfilledBets =
    isCpmmMulti && !shouldAnswersSumToOne
      ? // Always filter to answer for non-sum-to-one cpmm multi
        unfilledBetsMatchingAnswer
      : allUnfilledBets

  const isPseudoNumeric = contract.outcomeType === 'PSEUDO_NUMERIC'
  const isStonk = contract.outcomeType === 'STONK'

  const handleBetTypeChange = (type: 'Market' | 'Limit') => {
    setBetType(type)
  }

  const isAdvancedTrader = useIsAdvancedTrader()

  const [betType, setBetType] = useState<'Market' | 'Limit'>('Market')

  useEffect(() => {
    if (!isIOS() && !isAndroid()) {
      focusAmountInput()
    }
  }, [])

  function onBetChange(newAmount: number | undefined) {
    setBetAmount(newAmount)
  }

  async function submitBet() {
    if (!user || !betAmount) return

    setError(undefined)
    setIsSubmitting(true)

    try {
      const bet = await toast.promise(
        api(
          'bet',
          removeUndefinedProps({
            outcome,
            amount: betAmount,
            contractId: contract.id,
            answerId: multiProps?.answerToBuy.id,
            replyToCommentId,
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
      setBetAmount(undefined)
      if (onBuySuccess) onBuySuccess()
      // TODO: Twomba tracking bet terminology
      track(
        'bet',
        removeUndefinedProps({
          location,
          outcomeType: contract.outcomeType,
          slug: contract.slug,
          contractId: contract.id,
          amount: betAmount,
          betGroupId: bet?.betGroupId,
          betId: bet?.betId,
          outcome,
          isLimitOrder: false,
          answerId: multiProps?.answerToBuy.id,
          feedReason,
        })
      )
    } catch (e) {
      if (e instanceof APIError) {
        const message = e.message.toString()
        if (message.includes('could not serialize access')) {
          setError(`Error placing ${TRADE_TERM} (could not serialize access)`)
          console.error(`Error placing ${TRADE_TERM}`, e)
        } else setError(message)
      } else {
        console.error(e)
        setError(`Error placing ${TRADE_TERM}`)
      }
      return undefined
    } finally {
      setIsSubmitting(false)
    }
  }
  const betDisabled =
    isSubmitting ||
    !betAmount ||
    outcome === undefined ||
    error === 'Insufficient balance'

  const limits =
    contract.outcomeType === 'STONK'
      ? { max: MAX_STONK_PROB, min: MIN_STONK_PROB }
      : { max: MAX_CPMM_PROB, min: MIN_CPMM_PROB }
  const maxProb = limits.max
  const minProb = limits.min

  let currentPayout: number
  let probBefore: number
  let probAfter: number
  let fees: number
  let filledAmount: number

  try {
    if (isCpmmMulti && multiProps && contract.shouldAnswersSumToOne) {
      const { answers, answerToBuy } = multiProps
      const { newBetResult, otherBetResults } = calculateCpmmMultiArbitrageBet(
        answers,
        answerToBuy,
        outcome ?? 'YES',
        betAmount ?? 0,
        undefined,
        unfilledBets,
        balanceByUserId,
        contract.collectedFees
      )
      const { pool, p } = newBetResult.cpmmState
      currentPayout = sumBy(newBetResult.takers, 'shares')
      filledAmount = sumBy(newBetResult.takers, 'amount')
      if (multiProps.answerToBuy.text !== multiProps.answerText && isBinaryMC) {
        probBefore = 1 - answerToBuy.prob
        probAfter = 1 - getCpmmProbability(pool, p)
      } else {
        probBefore = answerToBuy.prob
        probAfter = getCpmmProbability(pool, p)
      }
      fees =
        getFeeTotal(newBetResult.totalFees) +
        sumBy(otherBetResults, (result) => getFeeTotal(result.totalFees))
      betDeps.current = newBetResult.makers
        .map((m) => m.bet)
        .concat(otherBetResults.flatMap((r) => r.makers.map((m) => m.bet)))
        .concat(newBetResult.ordersToCancel)
        .concat(otherBetResults.flatMap((r) => r.ordersToCancel))
    } else {
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

      const result = computeCpmmBet(
        cpmmState,
        outcome ?? 'YES',
        betAmount ?? 0,
        undefined,
        unfilledBets,
        balanceByUserId,
        limits
      )
      currentPayout = result.shares
      filledAmount = result.amount
      probBefore = result.probBefore
      probAfter = result.probAfter
      fees = getFeeTotal(result.fees)
      betDeps.current = result.makers
        .map((m) => m.bet)
        .concat(result.ordersToCancel)
    }
  } catch (err: any) {
    // TODO: Twomba tracking bet terminology
    console.error('Error in calculateCpmmMultiArbitrageBet:', err)
    setError(
      err?.message ??
        `An error occurred during ${TRADE_TERM} calculation, try again.`
    )
    // Set default values or handle the error case as needed
    currentPayout = 0
    probBefore = 0
    probAfter = 0
    fees = 0
    filledAmount = 0
  }

  const probStayedSame = formatPercent(probAfter) === formatPercent(probBefore)
  const probChange = Math.abs(probAfter - probBefore)
  const currentReturn = filledAmount
    ? (currentPayout - filledAmount) / filledAmount
    : 0
  const currentReturnPercent = formatPercent(currentReturn)

  const displayedAfter = isPseudoNumeric
    ? formatLargeNumber(probAfter)
    : formatPercent(probAfter)

  const bankrollFraction = (betAmount ?? 0) / (user?.balance ?? 1e9)

  // warnings
  const highBankrollSpend =
    (betAmount ?? 0) >= 100 && bankrollFraction >= 0.5 && bankrollFraction <= 1
  const highProbMove =
    (betAmount ?? 0) > 10 && probChange > 0.299 && bankrollFraction <= 1

  const warning = highBankrollSpend
    ? `You might not want to spend ${formatPercent(
        bankrollFraction
      )} of your balance on a single trade. \n\nCurrent balance: ${formatMoney(
        user?.balance ?? 0
      )}`
    : highProbMove
    ? `Are you sure you want to move the market to ${displayedAfter}?`
    : undefined

  const choicesMap: { [key: string]: string } = isStonk
    ? { Buy: 'YES', Short: 'NO' }
    : { Yes: 'YES', No: 'NO' }

  const isCashContract = contract.token === 'CASH'

  return (
    <>
      <Col className={clsx(panelClassName, 'relative rounded-xl px-4 py-2')}>
        {children}

        {(isAdvancedTrader || alwaysShowOutcomeSwitcher) && (
          <Row className={'mb-2 mr-8 justify-between'}>
            <Col className={clsx(' gap-1', isBinaryMC && 'invisible')}>
              <div className="text-ink-700">Outcome</div>
              <ChoicesToggleGroup
                currentChoice={outcome}
                color={outcome === 'YES' ? 'green' : 'red'}
                choicesMap={choicesMap}
                setChoice={(outcome) => {
                  setOutcome(outcome as 'YES' | 'NO')
                }}
              />
            </Col>
            {isAdvancedTrader && !isStonk && (
              <Col className="gap-1">
                <div className="text-ink-700">
                  {capitalize(TRADE_TERM)} type
                </div>
                <ChoicesToggleGroup
                  currentChoice={betType}
                  choicesMap={{
                    Market: 'Market',
                    Limit: 'Limit',
                  }}
                  setChoice={(val) => {
                    if (val === 'Market' || val === 'Limit') {
                      handleBetTypeChange(val)
                    }
                  }}
                />
              </Col>
            )}
          </Row>
        )}

        {onClose && (
          <Button
            color="gray-white"
            size="sm"
            className="absolute right-1 top-1"
            onClick={onClose}
          >
            <XIcon className="h-5 w-5" />
          </Button>
        )}
        {betType === 'Market' ? (
          <>
            <Row className={clsx('text-ink-700 mb-2 items-center space-x-3')}>
              {capitalize(TRADE_TERM)} amount
            </Row>

            <Row
              className={clsx(
                'flex-wrap gap-x-8 gap-y-4',
                isAdvancedTrader ? 'items-center' : 'items-end',
                isAdvancedTrader ? 'mb-5' : 'mb-3'
              )}
            >
              <BuyAmountInput
                amount={betAmount}
                onChange={onBetChange}
                error={error}
                setError={setError}
                disabled={isSubmitting}
                inputRef={inputRef}
                binaryOutcome={isBinaryMC ? undefined : outcome}
                showSlider={isAdvancedTrader}
                marketTier={marketTier}
                token={isCashContract ? 'CASH' : 'M$'}
              />

              {isAdvancedTrader && (
                <Col className="gap-3">
                  <Row className=" items-baseline">
                    <span className="text-ink-700 mr-2 min-w-[120px] whitespace-nowrap">
                      {isPseudoNumeric
                        ? 'Estimated value'
                        : isStonk
                        ? 'New stock price'
                        : 'New probability'}
                    </span>
                    <span className="text-lg font-semibold">
                      {getFormattedMappedValue(
                        contract,
                        probStayedSame ? probBefore : probAfter
                      )}
                    </span>
                    {!probStayedSame && !isPseudoNumeric && (
                      <span className={clsx('ml-1', 'text-ink-700')}>
                        {outcome !== 'NO' || isBinaryMC ? '↑' : '↓'}
                        {getFormattedMappedValue(
                          contract,
                          Math.abs(probAfter - probBefore)
                        )}
                        {floatingEqual(probAfter, maxProb)
                          ? ' (max)'
                          : floatingEqual(probAfter, minProb)
                          ? ' (max)'
                          : ''}
                      </span>
                    )}
                  </Row>
                  <Row className="min-w-[128px] items-baseline">
                    <div className="text-ink-700 mr-2 min-w-[120px] flex-nowrap whitespace-nowrap">
                      {isPseudoNumeric || isStonk ? 'Shares' : <>Max payout</>}
                    </div>

                    <span className="mr-1 whitespace-nowrap text-lg">
                      {isStonk ? (
                        getStonkDisplayShares(contract, currentPayout, 2)
                      ) : isPseudoNumeric ? (
                        Math.floor(currentPayout)
                      ) : (
                        <MoneyDisplay
                          amount={currentPayout}
                          isCashContract={isCashContract}
                        />
                      )}
                    </span>
                    <span className="text-green-500 ">
                      {isStonk || isPseudoNumeric
                        ? ''
                        : ' +' + currentReturnPercent}
                    </span>
                  </Row>
                  {betAmount != undefined &&
                    !floatingEqual(filledAmount, betAmount) && (
                      <Row className="min-w-[128px] items-baseline">
                        <div className="text-ink-700 mr-2 min-w-[120px] flex-nowrap whitespace-nowrap">
                          Refund amount
                        </div>
                        <span className="mr-1 whitespace-nowrap text-lg">
                          <MoneyDisplay
                            amount={betAmount - filledAmount}
                            isCashContract={isCashContract}
                          />
                        </span>
                      </Row>
                    )}
                </Col>
              )}
            </Row>
          </>
        ) : (
          <>
            <LimitOrderPanel
              contract={contract}
              multiProps={multiProps}
              user={user}
              unfilledBets={unfilledBets}
              balanceByUserId={balanceByUserId}
              outcome={outcome}
            />
          </>
        )}

        {betType !== 'Limit' && (
          <Col className="gap-2">
            {user ? (
              <WarningConfirmationButton
                marketType="binary"
                amount={betAmount}
                warning={warning}
                userOptedOutOfWarning={user.optOutBetWarnings}
                onSubmit={submitBet}
                ButtonClassName={clsx('flex-grow')}
                actionLabelClassName={'line-clamp-1'}
                isSubmitting={isSubmitting}
                disabled={betDisabled}
                size="xl"
                color={
                  binaryMCColors?.[outcome == 'YES' ? 0 : 1] ??
                  (outcome === 'NO' ? 'red' : 'green')
                }
                actionLabel={
                  betDisabled ? (
                    `Select ${formatOutcomeLabel(
                      contract,
                      'YES'
                    )} or ${formatOutcomeLabel(contract, 'NO')}`
                  ) : isStonk ? (
                    <span>
                      {formatOutcomeLabel(contract, outcome)}{' '}
                      <MoneyDisplay
                        amount={betAmount}
                        isCashContract={isCashContract}
                      />
                    </span>
                  ) : (
                    <span>
                      {capitalize(TRADE_TERM)}{' '}
                      {binaryMCOutcomeLabel ??
                        formatOutcomeLabel(contract, outcome)}{' '}
                      to win{' '}
                      <MoneyDisplay
                        amount={currentPayout}
                        isCashContract={isCashContract}
                      />
                    </span>
                  )
                }
                inModal={!!onClose}
              />
            ) : (
              <Button
                color={outcome === 'NO' ? 'red' : 'green'}
                size="xl"
                // TODO: Twomba tracking bet terminology
                onClick={withTracking(firebaseLogin, 'login from bet panel')}
                className="flex-grow"
              >
                Sign up to predict
              </Button>
            )}
          </Col>
        )}

        {user && (
          <Row className="mt-5 items-start justify-between text-sm">
            <Row className={''}>
              <span
                className={clsx(
                  'text-ink-700 mr-1 whitespace-nowrap ',
                  isAdvancedTrader ? '' : 'min-w-[110px]'
                )}
              >
                Your balance{' '}
              </span>
              <span className="text-ink-700 font-semibold">
                <MoneyDisplay
                  amount={isCashContract ? user.cashBalance : user.balance}
                  isCashContract={isCashContract}
                />
              </span>
            </Row>
          </Row>
        )}

        {!isAdvancedTrader && (
          <Col>
            <Row className="">
              <span className="text-ink-700 mr-1 min-w-[110px] whitespace-nowrap text-sm">
                {isPseudoNumeric
                  ? 'Estimated value'
                  : isStonk
                  ? 'New stock price'
                  : 'New probability'}
              </span>

              <span className="text-ink-700 text-sm font-semibold">
                {getFormattedMappedValue(
                  contract,
                  probStayedSame ? probBefore : probAfter
                )}
              </span>
              {!probStayedSame && !isPseudoNumeric && (
                <span className={clsx('ml-2 text-sm', 'text-ink-700')}>
                  {outcome !== 'NO' || isBinaryMC ? '↑' : '↓'}
                  {getFormattedMappedValue(
                    contract,
                    Math.abs(probAfter - probBefore)
                  )}
                  {floatingEqual(probAfter, maxProb)
                    ? ' (max)'
                    : floatingEqual(probAfter, minProb)
                    ? ' (max)'
                    : ''}{' '}
                </span>
              )}

              {!isPseudoNumeric && !isStonk && !isBinaryMC && (
                <InfoTooltip
                  text={`Your ${TRADE_TERM} will move the probability of Yes from ${getFormattedMappedValue(
                    contract,
                    probBefore
                  )} to ${getFormattedMappedValue(contract, probAfter)}.`}
                  className="text-ink-600 ml-1 mt-0.5"
                  size="sm"
                />
              )}

              {isBinaryMC && (
                <InfoTooltip
                  text={`Your ${TRADE_TERM} will move the probability from ${getFormattedMappedValue(
                    contract,
                    probBefore
                  )} to ${getFormattedMappedValue(contract, probAfter)}.`}
                  className="text-ink-600 ml-1 mt-0.5"
                  size="sm"
                />
              )}
            </Row>
          </Col>
        )}

        {betType !== 'Limit' && (
          <div className="text-ink-700 mt-1 text-sm">
            Fees{' '}
            <FeeDisplay
              amount={betAmount}
              totalFees={fees}
              isCashContract={isCashContract}
            />
          </div>
        )}

        {user && (
          <div className="absolute bottom-2 right-0">
            <button
              className="text-ink-700 mr-2 flex items-center text-sm hover:underline"
              onClick={() => {
                if (!isAdvancedTrader) {
                  setBetType('Market')
                }
                api('me/update', { isAdvancedTrader: !isAdvancedTrader })
              }}
            >
              <span className="hover:underline">
                {isAdvancedTrader ? 'Basic' : 'Advanced'}
              </span>
              <ChevronDownIcon className="ml-1 h-3 w-3" />
            </button>
          </div>
        )}
      </Col>

      {contract.mechanism === 'cpmm-multi-1' && (
        <YourOrders
          className="mt-2 rounded-lg bg-indigo-200/10 py-4"
          contract={contract}
          bets={unfilledBetsMatchingAnswer}
        />
      )}
      {isAdvancedTrader && (
        <OrderBookPanel
          contract={contract}
          limitBets={unfilledBets.filter(
            (b) => b.answerId === multiProps?.answerToBuy?.id
          )}
          answer={multiProps?.answerToBuy}
        />
      )}
    </>
  )
}

export const QuickBetAmountsRow = (props: {
  onAmountChange: (amount: number) => void
  betAmount: number | undefined
  className?: string
}) => {
  const { onAmountChange, betAmount, className } = props
  const QUICK_BET_AMOUNTS = [10, 25, 100]
  return (
    <Row className={clsx('mb-2 items-center space-x-3', className)}>
      <div className="text-ink-700">Amount</div>
      <ChoicesToggleGroup
        currentChoice={
          QUICK_BET_AMOUNTS.includes(betAmount ?? 0) ? betAmount : undefined
        }
        choicesMap={QUICK_BET_AMOUNTS.reduce<{
          [key: number]: number
        }>((map, amount) => {
          map[amount] = amount
          return map
        }, {})}
        setChoice={(amount) => {
          if (typeof amount === 'number') {
            onAmountChange(amount)
          }
        }}
      />
    </Row>
  )
}
