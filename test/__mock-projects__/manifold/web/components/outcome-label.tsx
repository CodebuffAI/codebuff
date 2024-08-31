import clsx from 'clsx'
import { getProbability } from 'common/calculate'
import {
  BinaryContract,
  Contract,
  getMainBinaryMCAnswer,
  MultiContract,
  OutcomeType,
  resolution,
} from 'common/contract'
import { formatLargeNumber, formatPercent } from 'common/util/format'
import { Bet } from 'common/bet'
import { STONK_NO, STONK_YES } from 'common/stonk'
import { AnswerLabel } from './answers/answer-components'

export function OutcomeLabel(props: {
  contract: Contract
  outcome: resolution | string
  truncate: 'short' | 'long' | 'none'
  answerId?: string
}) {
  const { outcome, contract, truncate, answerId } = props
  const { outcomeType, mechanism } = contract
  const mainBinaryMCAnswer = getMainBinaryMCAnswer(contract)

  if (mainBinaryMCAnswer && mechanism === 'cpmm-multi-1') {
    return (
      <MultiOutcomeLabel
        contract={contract}
        resolution={
          outcome === 'YES' ? mainBinaryMCAnswer.id : contract.answers[1].id
        }
        truncate={truncate}
        answerClassName={'font-bold text-base-400 !break-normal'}
      />
    )
  }
  if (outcomeType === 'PSEUDO_NUMERIC')
    return <PseudoNumericOutcomeLabel outcome={outcome as any} />

  if (outcomeType === 'BINARY')
    return <BinaryOutcomeLabel outcome={outcome as any} />

  if (outcomeType === 'QUADRATIC_FUNDING') return <></>

  if (outcomeType === 'STONK') {
    return <StonkOutcomeLabel outcome={outcome as any} />
  }
  if (outcomeType === 'NUMBER') {
    return (
      <span>
        {answerId && (
          <MultiOutcomeLabel
            contract={contract}
            resolution={answerId}
            truncate={truncate}
            answerClassName={'font-bold text-base-400 !break-normal'}
          />
        )}{' '}
        <BinaryOutcomeLabel outcome={outcome as any} />
      </span>
    )
  }

  if (outcomeType === 'MULTIPLE_CHOICE' && mechanism === 'cpmm-multi-1') {
    return (
      <span>
        {answerId && (
          <MultiOutcomeLabel
            contract={contract}
            resolution={answerId}
            truncate={truncate}
            answerClassName={'font-bold text-base-400 !break-normal'}
          />
        )}{' '}
        <BinaryOutcomeLabel outcome={outcome as any} />
      </span>
    )
  }

  if (outcomeType === 'BOUNTIED_QUESTION') {
    return <></>
  }

  if (outcomeType == 'POLL') {
    return <></>
  }

  return (
    <MultiOutcomeLabel
      contract={contract}
      resolution={outcome}
      truncate={truncate}
      answerClassName={'font-bold text-base-400 !break-normal'}
    />
  )
}

export function BinaryOutcomeLabel(props: { outcome: resolution }) {
  const { outcome } = props

  if (outcome === 'YES') return <YesLabel />
  if (outcome === 'NO') return <NoLabel />
  if (outcome === 'MKT') return <ProbLabel />
  return <CancelLabel />
}

export function PseudoNumericOutcomeLabel(props: { outcome: resolution }) {
  const { outcome } = props

  if (outcome === 'YES') return <HigherLabel />
  if (outcome === 'NO') return <LowerLabel />
  if (outcome === 'MKT') return <ProbLabel />
  return <CancelLabel />
}
export function StonkOutcomeLabel(props: { outcome: resolution }) {
  const { outcome } = props

  if (outcome === 'YES') return <BuyLabel />
  if (outcome === 'NO') return <ShortLabel />
  if (outcome === 'MKT') return <ProbLabel />
  return <CancelLabel />
}

export function BinaryContractOutcomeLabel(props: {
  contract: BinaryContract
  resolution: resolution
}) {
  const { contract, resolution } = props

  if (resolution === 'MKT') {
    const prob = contract.resolutionProbability ?? getProbability(contract)
    return <ProbPercentLabel prob={prob} />
  }

  return <BinaryOutcomeLabel outcome={resolution} />
}

export function MultiOutcomeLabel(props: {
  contract: MultiContract
  resolution: string | 'CANCEL' | 'MKT'
  truncate: 'short' | 'long' | 'none'
  answerClassName?: string
}) {
  const { contract, resolution, truncate, answerClassName } = props

  if (resolution === 'CANCEL') return <CancelLabel />
  if (resolution === 'MKT' || resolution === 'CHOOSE_MULTIPLE')
    return <MultiLabel />

  const chosen = contract.answers?.find((answer) => answer.id === resolution)
  return (
    <AnswerLabel
      text={chosen ? chosen.text : `Answer #${resolution}`}
      truncate={truncate}
      className={answerClassName}
    />
  )
}

export function YesLabel() {
  return <span className="text-teal-600">YES</span>
}

export function HigherLabel() {
  return <span className="text-teal-600">HIGHER</span>
}

export function LowerLabel() {
  return <span className="text-scarlet-600">LOWER</span>
}

export function BuyLabel() {
  return <span className="text-teal-600">{STONK_YES}</span>
}

export function ShortLabel() {
  return <span className="text-scarlet-600">{STONK_NO}</span>
}

export function NoLabel() {
  return <span className="text-scarlet-600">NO</span>
}

export function CancelLabel() {
  return <span className="text-yellow-600">N/A</span>
}

export function ProbLabel() {
  return <span className="text-sky-600">PROB</span>
}

export function MultiLabel() {
  return <span className="text-sky-600">MANY</span>
}

export function ProbPercentLabel(props: { prob: number }) {
  const { prob } = props
  return <span className="text-sky-600">{formatPercent(prob)}</span>
}

export function NumericValueLabel(props: { value: number }) {
  const { value } = props
  return <span className="text-sky-600">{formatLargeNumber(value)}</span>
}

export function MultiNumericValueLabel(props: { formattedValue: string }) {
  const { formattedValue } = props
  return <span className="text-sky-600">{formattedValue}</span>
}

export function BetOutcomeLabel(props: {
  contractOutcomeType: OutcomeType
  bet: Bet
  answerText?: string
}) {
  const { contractOutcomeType, bet, answerText } = props
  if (contractOutcomeType === 'BINARY') {
    return <BinaryOutcomeLabel outcome={bet.outcome as resolution} />
  }
  if (contractOutcomeType === 'PSEUDO_NUMERIC') {
    return <PseudoNumericOutcomeLabel outcome={bet.outcome as resolution} />
  }
  if (
    contractOutcomeType === 'MULTIPLE_CHOICE' ||
    contractOutcomeType === 'NUMBER'
  ) {
    return (
      <span className={clsx('text-primary-700')}>
        {answerText ?? bet.outcome}
      </span>
    )
  }
  return <span className={'text-primary-700'}>{bet.outcome}</span>
}
