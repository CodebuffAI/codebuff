import { XIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import { PHONE_VERIFICATION_BONUS } from 'common/economy'
import { ENV_CONFIG } from 'common/envs/constants'
import { User, verifiedPhone } from 'common/user'
import { formatMoney } from 'common/util/format'
import { ReactNode, useEffect, useState } from 'react'
import { VerifyPhoneModal } from 'web/components/user/verify-phone-number-banner'
import { useIsAdvancedTrader } from 'web/hooks/use-is-advanced-trader'
import { useCurrentPortfolio } from 'web/hooks/use-portfolio-history'
import { useUser } from 'web/hooks/use-user'
import { ManaCoin } from 'web/public/custom-components/manaCoin'
import { SpiceCoin } from 'web/public/custom-components/spiceCoin'
import { AddFundsModal } from '../add-funds-modal'
import { BetSlider } from '../bet/bet-slider'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import {
  IncrementButton,
  IncrementDecrementAmountButton,
} from './increment-button'
import { Input } from './input'
import { MarketTierType } from 'common/tier'
import { SweepiesCoin } from 'web/public/custom-components/sweepiesCoin'

export function AmountInput(
  props: {
    amount: number | undefined
    onChangeAmount: (newAmount: number | undefined) => void
    error?: boolean
    label?: any
    disabled?: boolean
    className?: string
    inputClassName?: string
    inputStyle?: React.CSSProperties
    // Needed to focus the amount input
    inputRef?: React.MutableRefObject<any>
    quickAddMoreButton?: ReactNode
    allowFloat?: boolean
    allowNegative?: boolean
    disableClearButton?: boolean
  } & JSX.IntrinsicElements['input']
) {
  const {
    amount,
    onChangeAmount,
    error,
    label = ENV_CONFIG.moneyMoniker,
    disabled,
    className,
    inputClassName,
    inputStyle,
    inputRef,
    quickAddMoreButton,
    allowFloat,
    allowNegative,
    disableClearButton,
    ...rest
  } = props

  const [amountString, setAmountString] = useState(amount?.toString() ?? '')

  const parse = allowFloat ? parseFloat : parseInt

  const bannedChars = new RegExp(
    `[^\\d${allowFloat && '.'}${allowNegative && '-'}]`,
    'g'
  )

  useEffect(() => {
    if (amount !== parse(amountString))
      setAmountString(amount?.toString() ?? '')
  }, [amount])

  const onAmountChange = (str: string) => {
    const s = str.replace(bannedChars, '')
    if (s !== amountString) {
      setAmountString(s)
      const amount = parse(s)
      const isInvalid = !s || isNaN(amount)
      onChangeAmount(isInvalid ? undefined : amount)
    }
  }

  return (
    <Col className={clsx('relative', className)}>
      <label className="font-sm md:font-lg relative">
        {label && (
          <span className="text-ink-400 absolute top-1/2 my-auto ml-2 -translate-y-1/2">
            {label}
          </span>
        )}
        <Row>
          <Input
            {...rest}
            className={clsx(label && 'pl-9', ' !text-lg', inputClassName)}
            style={inputStyle}
            ref={inputRef}
            type={allowFloat ? 'number' : 'text'}
            inputMode={allowFloat ? 'decimal' : 'numeric'}
            placeholder="0"
            maxLength={9}
            value={amountString}
            error={error}
            disabled={disabled}
            onChange={(e) => onAmountChange(e.target.value)}
            onBlur={() => setAmountString(amount?.toString() ?? '')}
            onKeyDown={(e) => {
              if (e.key === 'ArrowUp') {
                onChangeAmount((amount ?? 0) + 5)
              } else if (e.key === 'ArrowDown') {
                onChangeAmount(Math.max(0, (amount ?? 0) - 5))
              }
            }}
          />
          <Row className="divide-ink-300 absolute right-[1px] h-full divide-x">
            {!disableClearButton && (
              <ClearInputButton
                className={clsx(
                  'w-12 transition-opacity',
                  amount === undefined && 'opacity-0'
                )}
                onClick={() => onChangeAmount(undefined)}
              />
            )}
            {quickAddMoreButton}
          </Row>
        </Row>
      </label>
    </Col>
  )
}

function ClearInputButton(props: { onClick: () => void; className?: string }) {
  const { onClick, className } = props
  return (
    <button
      className={clsx(
        className,
        'text-ink-400 hover:text-ink-500 active:text-ink-500 flex items-center justify-center'
      )}
      onClick={onClick}
    >
      <XIcon className="h-4 w-4" />
    </button>
  )
}

export function BuyAmountInput(props: {
  amount: number | undefined
  onChange: (newAmount: number | undefined) => void
  error: string | undefined
  setError: (error: string | undefined) => void
  minimumAmount?: number
  maximumAmount?: number
  disabled?: boolean
  showBalance?: boolean
  parentClassName?: string
  binaryOutcome?: 'YES' | 'NO'
  showSlider?: boolean
  className?: string
  inputClassName?: string
  // Needed to focus the amount input
  inputRef?: React.MutableRefObject<any>
  disregardUserBalance?: boolean
  quickButtonValues?: number[] | 'large'
  disableQuickButtons?: boolean
  token?: 'M$' | 'SPICE' | 'CASH'
  marketTier?: MarketTierType | undefined
}) {
  const {
    amount,
    onChange,
    error,
    setError,
    marketTier,
    disabled,
    binaryOutcome,
    showBalance,
    showSlider,
    parentClassName,
    className,
    inputClassName,
    minimumAmount,
    inputRef,
    maximumAmount,
    disregardUserBalance,
    quickButtonValues,
    disableQuickButtons,
    token = 'M$',
  } = props
  const user = useUser()

  // Check for errors.
  useEffect(() => {
    if (amount !== undefined) {
      if (
        !disregardUserBalance &&
        user &&
        ((token === 'M$' && user.balance < amount) ||
          (token === 'SPICE' && user.spiceBalance < amount))
      ) {
        setError('Insufficient balance')
      } else if (minimumAmount && amount < minimumAmount) {
        setError('Minimum amount: ' + formatMoney(minimumAmount))
      } else if (maximumAmount && amount > maximumAmount) {
        setError('Maximum amount: ' + formatMoney(maximumAmount))
      } else {
        setError(undefined)
      }
    } else {
      setError(undefined)
    }
  }, [amount, user, minimumAmount, maximumAmount, disregardUserBalance])

  const portfolio = useCurrentPortfolio(user?.id)
  const hasLotsOfMana =
    !!portfolio && portfolio.balance + portfolio.investmentValue > 10000

  const amountWithDefault = amount ?? 0

  const incrementBy = (increment: number) => {
    const newAmount = amountWithDefault + increment
    if (newAmount <= 0) onChange(undefined)
    else if (amountWithDefault < increment) onChange(increment)
    else onChange(newAmount)
  }

  const isAdvancedTrader = useIsAdvancedTrader()
  const advancedIncrementValues = (
    hasLotsOfMana ? [50, 250, 1000] : [10, 50, 250]
  ).map((v) => (marketTier === 'play' ? v / 10 : v))
  const defaultIncrementValues = (hasLotsOfMana ? [50, 250] : [10, 100]).map(
    (v) => (marketTier === 'play' ? v / 10 : v)
  )

  const incrementValues =
    quickButtonValues === 'large'
      ? [1000, 5000]
      : quickButtonValues ??
        (isAdvancedTrader ? advancedIncrementValues : defaultIncrementValues)

  return (
    <>
      <Col className={clsx('w-full max-w-[350px] gap-2', parentClassName)}>
        <AmountInput
          className={className}
          inputClassName={clsx(
            'w-full !text-xl',
            isAdvancedTrader && '!h-[72px]',
            !disableQuickButtons &&
              (incrementValues.length > 2 ? 'pr-[182px]' : 'pr-[134px]'),
            inputClassName
          )}
          label={
            token === 'SPICE' ? (
              <SpiceCoin />
            ) : token == 'CASH' ? (
              <SweepiesCoin />
            ) : (
              <ManaCoin />
            )
          }
          amount={amount}
          onChangeAmount={onChange}
          error={!!error}
          disabled={disabled}
          inputRef={inputRef}
          disableClearButton={!isAdvancedTrader}
          quickAddMoreButton={
            disableQuickButtons ? undefined : (
              <Row className="divide-ink-300 border-ink-300 divide-x border-l text-sm">
                {incrementValues.map((increment) =>
                  isAdvancedTrader ? (
                    <IncrementDecrementAmountButton
                      key={increment}
                      amount={increment}
                      incrementBy={incrementBy}
                    />
                  ) : (
                    <IncrementButton
                      key={increment}
                      amount={increment}
                      onIncrement={() => incrementBy(increment)}
                    />
                  )
                )}
              </Row>
            )
          }
        />
        {showSlider && (
          <BetSlider
            className="-mt-2"
            amount={amount}
            onAmountChange={onChange}
            binaryOutcome={binaryOutcome}
            disabled={disabled}
            smallManaAmounts={!hasLotsOfMana || marketTier === 'play'}
          />
        )}
        {error ? (
          <div className="text-scarlet-500 mt-4 flex-wrap text-sm">
            {error === 'Insufficient balance' && token === 'M$' ? (
              <BuyMoreFunds user={user} />
            ) : (
              error
            )}
          </div>
        ) : (
          showBalance &&
          user && (
            <div className="text-ink-500 mt-4 whitespace-nowrap text-sm">
              Balance{' '}
              <span className="text-ink-800">{formatMoney(user.balance)}</span>
            </div>
          )
        )}
      </Col>
    </>
  )
}

const BuyMoreFunds = (props: { user: User | null | undefined }) => {
  const { user } = props
  const [addFundsModalOpen, setAddFundsModalOpen] = useState(false)
  const [showVerifyPhone, setShowVerifyPhone] = useState(false)
  return (
    <>
      Not enough funds.
      <button
        className="text-primary-500 hover:decoration-primary-400 ml-1 hover:underline"
        onClick={() => setAddFundsModalOpen(true)}
      >
        Buy more?
      </button>
      {user && !verifiedPhone(user) && (
        <button
          className="text-primary-500 hover:decoration-primary-400 ml-1 hover:underline"
          onClick={() => setShowVerifyPhone(true)}
        >
          Verify your phone number for {formatMoney(PHONE_VERIFICATION_BONUS)}
        </button>
      )}
      <VerifyPhoneModal open={showVerifyPhone} setOpen={setShowVerifyPhone} />
      <AddFundsModal open={addFundsModalOpen} setOpen={setAddFundsModalOpen} />
    </>
  )
}
