import { XIcon } from '@heroicons/react/outline'
import { CheckIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import { Answer } from 'common/answer'
import { getAnswerProbability } from 'common/calculate'
import {
  CPMMMultiContract,
  isBinaryMulti,
  MAX_CPMM_PROB,
  MIN_CPMM_PROB,
} from 'common/contract'
import { formatPercent, formatPercentShort } from 'common/util/format'
import { removeUndefinedProps } from 'common/util/object'
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { useUnfilledBetsAndBalanceByUserId } from 'web/hooks/use-bets'
import { useFocus } from 'web/hooks/use-focus'
import { useUser } from 'web/hooks/use-user'
import { APIError, api } from 'web/lib/api/api'
import { isAndroid, isIOS } from 'web/lib/util/device'
import { BinaryOutcomes, MultiBetProps } from '../bet/bet-panel'
import { Button } from '../buttons/button'
import { Col } from '../layout/col'
import { MODAL_CLASS, Modal } from '../layout/modal'
import { Row } from '../layout/row'

import { computeCpmmBet } from 'common/new-bet'
import { formatMoney } from 'common/util/format'
import { firebaseLogin } from 'web/lib/firebase/users'
import { BuyAmountInput } from '../widgets/amount-input'

import { getFormattedMappedValue } from 'common/pseudo-numeric'
import { InfoTooltip } from 'web/components/widgets/info-tooltip'
import { track, withTracking } from 'web/lib/service/analytics'
import { YourOrders } from '../bet/order-book'
import { WarningConfirmationButton } from '../buttons/warning-confirmation-button'
import {
  COLOR_MIXED_THRESHOLD,
  DEM_DARK_HEX,
  DEM_LIGHT_HEX,
  REP_DARK_HEX,
  REP_LIGHT_HEX,
  hexToRgb,
} from './state-election-map'
import { useIsAdvancedTrader } from 'web/hooks/use-is-advanced-trader'
import { capitalize } from 'lodash'
import { TRADE_TERM } from 'common/envs/constants'

export const HouseStatus = (props: {
  contract: CPMMMultiContract
  answer: Answer
  noNewIcon?: boolean
}) => {
  const { contract, answer } = props

  const prob = getAnswerProbability(contract, answer.id)

  return (
    <div className="flex flex-col items-center gap-1 sm:flex-row sm:gap-8 ">
      <Row className="items-center ">
        <div className="text-ink-600 w-[40px] font-light sm:hidden">DEM</div>
        <div className="w-[48px]">{formatPercentShort(1 - prob)}</div>
        <HouseBettor answer={answer} contract={contract} outcome="NO" />
      </Row>
      <Row className=" items-center ">
        <div className="text-ink-600 w-[40px] font-light  sm:hidden">REP</div>
        <div className="w-[48px]">{formatPercentShort(prob)}</div>
        <HouseBettor answer={answer} contract={contract} outcome="YES" />
      </Row>
    </div>
  )
}

export const HouseBettor = (props: {
  answer: Answer
  contract: CPMMMultiContract
  outcome: 'YES' | 'NO'
}) => {
  const { answer, contract, outcome } = props
  const [open, setOpen] = useState(false)
  return (
    <>
      <Modal
        open={open}
        setOpen={setOpen}
        className={clsx(
          MODAL_CLASS,

          //DEM
          outcome === 'NO'
            ? 'bg-azure-100 dark:bg-azure-950'
            : //REP
            outcome === 'YES'
            ? 'bg-sienna-100 dark:bg-sienna-950'
            : ''
        )}
      >
        <HouseBetPanel
          answer={answer}
          contract={contract}
          outcome={outcome}
          closePanel={() => setOpen(false)}
        />
      </Modal>

      <Button
        size="2xs"
        color="indigo-outline"
        className="bg-primary-50"
        onClick={(e) => {
          e.stopPropagation()
          setOpen(true)
        }}
      >
        {capitalize(TRADE_TERM)}
      </Button>
    </>
  )
}

export function HouseBetPanel(props: {
  answer: Answer
  contract: CPMMMultiContract
  closePanel: () => void
  outcome: 'YES' | 'NO' | undefined
}) {
  const { answer, contract, closePanel, outcome } = props

  return (
    <Col>
      <HouseBuyPanel
        contract={contract}
        multiProps={{
          answers: contract.answers,
          answerToBuy: answer,
        }}
        initialOutcome={outcome}
        // singularView={outcome}
        onBuySuccess={() => setTimeout(closePanel, 500)}
        inModal={true}
      >
        <Row className="text-ink-900 mb-6 justify-between text-lg">
          <h1>{answer.text}</h1>
          <div className="font-semibold">{formatPercent(answer.prob)}</div>
        </Row>
      </HouseBuyPanel>
    </Col>
  )
}

export function HouseBuyPanel(props: {
  contract: CPMMMultiContract
  multiProps?: MultiBetProps
  inModal: boolean
  onBuySuccess?: () => void
  initialOutcome?: BinaryOutcomes
  children?: React.ReactNode
}) {
  const { initialOutcome, children } = props

  return (
    <Col>
      <BuyPanelBody {...props} outcome={initialOutcome}>
        {children}
      </BuyPanelBody>
    </Col>
  )
}

export const BuyPanelBody = (props: {
  contract: CPMMMultiContract
  multiProps?: MultiBetProps
  onBuySuccess?: () => void
  outcome?: BinaryOutcomes
  location?: string
  onClose?: () => void

  panelClassName?: string
  children?: React.ReactNode
}) => {
  const {
    contract,
    multiProps,
    onBuySuccess,
    outcome,
    location = 'bet panel',
    onClose,
    panelClassName,
    children,
  } = props

  const user = useUser()

  const { unfilledBets: allUnfilledBets, balanceByUserId } =
    useUnfilledBetsAndBalanceByUserId(contract.id)

  const unfilledBetsMatchingAnswer = allUnfilledBets.filter(
    (b) => b.answerId === multiProps?.answerToBuy?.id
  )

  const initialBetAmount = 10
  const [betAmount, setBetAmount] = useState<number | undefined>(
    initialBetAmount
  )

  const [error, setError] = useState<string | undefined>()
  const [isSubmitting, setIsSubmitting] = useState(false)

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
  const isAdvancedTrader = useIsAdvancedTrader()

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

    const bet = await api(
      'bet',
      removeUndefinedProps({
        outcome,
        amount: betAmount,
        contractId: contract.id,
        answerId: multiProps?.answerToBuy.id,
      })
    )
      .then((r) => {
        console.log(`placed ${TRADE_TERM}. Result:`, r)
        setIsSubmitting(false)
        setBetAmount(undefined)
        if (onBuySuccess) onBuySuccess()
        else {
          toast('Trade submitted!', {
            icon: <CheckIcon className={'h-5 w-5 text-teal-500'} />,
          })
        }
        return r
      })
      .catch((e) => {
        if (e instanceof APIError) {
          const message = e.message.toString()
          if (message.includes('could not serialize access')) {
            setError(`Error placing ${TRADE_TERM}`)
            console.error(`Error placing ${TRADE_TERM}`, e)
          } else setError(message)
        } else {
          console.error(e)
          setError(`Error placing ${TRADE_TERM}`)
        }
        setIsSubmitting(false)
        return undefined
      })

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
      })
    )
  }
  const betDisabled = isSubmitting || !betAmount || outcome === undefined

  const cpmmState = {
    pool: {
      YES: multiProps!.answerToBuy.poolYes,
      NO: multiProps!.answerToBuy.poolNo,
    },
    p: 0.5,
    collectedFees: contract.collectedFees,
  }

  const result = computeCpmmBet(
    cpmmState,
    outcome ?? 'YES',
    betAmount ?? 0,
    undefined,
    unfilledBets,
    balanceByUserId,
    { max: MAX_CPMM_PROB, min: MIN_CPMM_PROB }
  )
  const currentPayout = result.shares

  const probBefore = result.probBefore
  const probAfter = result.probAfter

  const probStayedSame = formatPercent(probAfter) === formatPercent(probBefore)
  const probChange = Math.abs(probAfter - probBefore)

  const isBinaryMC = isBinaryMulti(contract)

  const displayedAfter = formatPercent(probAfter)

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

  return (
    <>
      <Col className={clsx(panelClassName, 'relative rounded-xl px-4 py-2')}>
        {children}

        {onClose && (
          <Button
            color="gray-white"
            className="absolute right-1 top-1"
            onClick={onClose}
          >
            <XIcon className="h-5 w-5" />
          </Button>
        )}

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
            showSlider={isAdvancedTrader}
          />
        </Row>

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
              color={outcome === 'NO' ? '#6989c8' : '#d16762'}
              actionLabel={`${capitalize(TRADE_TERM)} ${
                outcome === 'NO' ? 'Democratic' : 'Republican'
              } to win ${formatMoney(currentPayout)}`}
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

        {user ? (
          <Row className="mt-3 items-start justify-between">
            <div className="flex-grow">
              <span className="text-ink-700 mt-4 whitespace-nowrap text-sm">
                Your balance{' '}
                <span className="text-ink-700 font-semibold">
                  {formatMoney(user.balance)}
                </span>
              </span>
            </div>
          </Row>
        ) : null}

        <Row className=" items-start justify-between">
          <div className=" flex-grow">
            <span className="text-ink-700 mr-1 whitespace-nowrap text-sm">
              New probability
            </span>

            <span className="text-sm font-semibold">
              {getFormattedMappedValue(
                contract,
                probStayedSame ? probBefore : probAfter
              )}
            </span>
            {!probStayedSame && (
              <span className={clsx('ml-1 text-sm', 'text-ink-700')}>
                {outcome !== 'NO' || isBinaryMC ? '↑' : '↓'}
                {getFormattedMappedValue(
                  contract,
                  Math.abs(probAfter - probBefore)
                )}
              </span>
            )}

            <InfoTooltip
              text={`Your ${TRADE_TERM} will move the probability of ${
                outcome == 'YES' ? 'Republican' : 'Democratic'
              } from ${getFormattedMappedValue(
                contract,
                probBefore
              )} to ${getFormattedMappedValue(contract, probAfter)}.`}
              className="text-ink-600 ml-1 mt-0.5"
              size="sm"
            />
          </div>
        </Row>
      </Col>

      <YourOrders
        className="mt-2 rounded-lg bg-indigo-200/10 py-4"
        contract={contract}
        bets={unfilledBetsMatchingAnswer}
      />
      {/* Stonks don't allow limit orders but users may have them from before the conversion */}
    </>
  )
}

export const houseProbToColor = (prob: number) => {
  type Color = { r: number; g: number; b: number }
  function interpolateColor(color1: Color, color2: Color, factor: number) {
    // Linear interpolation between two colors
    const r = Math.round(color1.r + factor * (color2.r - color1.r))
    const g = Math.round(color1.g + factor * (color2.g - color1.g))
    const b = Math.round(color1.b + factor * (color2.b - color1.b))

    // Convert RGB to Hex
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)
  }
  // Base colors
  const DEM_LIGHT = hexToRgb(DEM_LIGHT_HEX)
  const REP_LIGHT = hexToRgb(REP_LIGHT_HEX)
  const DEM_DARK = hexToRgb(DEM_DARK_HEX)
  const REP_DARK = hexToRgb(REP_DARK_HEX)

  const probDemocratic = 1 - prob
  const probRepublican = prob

  if (probDemocratic === undefined || probRepublican === undefined)
    return undefined

  // Calculate the difference
  const repOverDem = probRepublican - probDemocratic
  const absoluteDifference = Math.abs(repOverDem)

  if (absoluteDifference < COLOR_MIXED_THRESHOLD / 2) {
    // Blend the light colors if difference is less than 5%
    return interpolateColor(
      DEM_LIGHT,
      REP_LIGHT,
      (repOverDem + COLOR_MIXED_THRESHOLD / 2) / COLOR_MIXED_THRESHOLD
    )
  } else {
    // Interpolate towards the darker shade based on the dominant side
    if (repOverDem < 0) {
      return interpolateColor(
        DEM_LIGHT,
        DEM_DARK,
        (absoluteDifference - COLOR_MIXED_THRESHOLD) /
          (1 - COLOR_MIXED_THRESHOLD)
      )
    } else {
      return interpolateColor(
        REP_LIGHT,
        REP_DARK,
        (absoluteDifference - COLOR_MIXED_THRESHOLD) /
          (1 - COLOR_MIXED_THRESHOLD)
      )
    }
  }
}
