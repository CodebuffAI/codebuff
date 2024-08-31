import clsx from 'clsx'
import {
  BinaryContract,
  CPMMMultiContract,
  CPMMNumericContract,
  MAX_CPMM_PROB,
  MIN_CPMM_PROB,
  PseudoNumericContract,
  StonkContract,
} from 'common/contract'
import { Col } from '../layout/col'
import { Input } from './input'
import { AmountInput } from './amount-input'
import { IncrementDecrementButton } from './increment-button'

export function ProbabilityInput(props: {
  prob: number | undefined
  onChange: (newProb: number | undefined) => void
  disabled?: boolean
  placeholder?: string
  className?: string
  inputClassName?: string
  error?: boolean
  limitProbs?: { max: number; min: number }
}) {
  const {
    prob,
    onChange,
    disabled,
    placeholder,
    className,
    inputClassName,
    error,
    limitProbs,
  } = props
  const maxBetProbInt = 100 * (limitProbs?.max ?? 0.99)
  const minBetProbInt = 100 * (limitProbs?.min ?? 0.01)
  const onProbChange = (str: string) => {
    let prob = parseInt(str.replace(/\D/g, ''))
    const isInvalid = !str || isNaN(prob)
    if (prob.toString().length > 2) {
      if (prob > maxBetProbInt) prob = maxBetProbInt
      else if (prob < minBetProbInt) prob = minBetProbInt
      else prob = +prob.toString().slice(-2)
    }
    onChange(isInvalid ? undefined : prob)
  }
  const incrementProb = () => {
    onChange(Math.min(maxBetProbInt, (prob ?? 0) + 1))
  }
  const decrementProb = () => {
    if (prob === undefined) return
    if (prob === minBetProbInt) onChange(undefined)
    else onChange((prob ?? 0) - 1)
  }

  return (
    <Col className={clsx(className, 'relative')}>
      <Input
        className={clsx('pr-2 !text-lg', 'w-full', inputClassName)}
        type="text"
        pattern="[0-9]*"
        inputMode="numeric"
        maxLength={2}
        placeholder={placeholder ?? '0'}
        value={prob ?? ''}
        disabled={disabled}
        onChange={(e) => onProbChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp') {
            incrementProb()
          } else if (e.key === 'ArrowDown') {
            decrementProb()
          }
        }}
        error={error}
      />
      <span className="text-ink-400 absolute right-12 top-1/2 my-auto -translate-y-1/2">
        %
      </span>
      <IncrementDecrementButton
        className="absolute right-[1px] top-[1px] h-full"
        onIncrement={incrementProb}
        onDecrement={decrementProb}
      />
    </Col>
  )
}

export function ProbabilityOrNumericInput(props: {
  contract:
    | BinaryContract
    | PseudoNumericContract
    | StonkContract
    | CPMMMultiContract
    | CPMMNumericContract
  prob: number | undefined
  setProb: (prob: number | undefined) => void
  disabled?: boolean
  placeholder?: string
  error?: boolean
  onRangeError?: (error: boolean) => void
}) {
  const {
    contract,
    prob,
    setProb,
    disabled,
    placeholder,
    error = false,
    onRangeError,
  } = props
  const isPseudoNumeric = contract.outcomeType === 'PSEUDO_NUMERIC'
  const isSumsToOne =
    contract.outcomeType === 'MULTIPLE_CHOICE' && contract.shouldAnswersSumToOne

  return isPseudoNumeric ? (
    <AmountInput
      inputClassName="w-24"
      label=""
      amount={prob}
      onChangeAmount={(val) => {
        onRangeError?.(
          val !== undefined && (val < contract.min || val > contract.max)
        )
        setProb(val)
      }}
      allowNegative
      disabled={disabled}
      placeholder={placeholder}
      error={error}
    />
  ) : (
    <ProbabilityInput
      className={'w-28'}
      prob={prob}
      onChange={setProb}
      disabled={disabled}
      placeholder={placeholder}
      error={error}
      limitProbs={
        !isSumsToOne ? { max: MAX_CPMM_PROB, min: MIN_CPMM_PROB } : undefined
      }
    />
  )
}
