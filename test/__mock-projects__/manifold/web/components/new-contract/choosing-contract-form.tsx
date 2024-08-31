import clsx from 'clsx'
import {
  CreateableOutcomeType,
  MULTI_NUMERIC_CREATION_ENABLED,
} from 'common/contract'
import { ReactNode, useState } from 'react'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { Spacer } from '../layout/spacer'
import { ALL_CONTRACT_TYPES } from './create-contract-types'
import { CreateContractStateType } from './new-contract-panel'

export function ChoosingContractForm(props: {
  outcomeType: CreateableOutcomeType | undefined
  setOutcomeType: (outcomeType: CreateableOutcomeType) => void
  setState: (state: CreateContractStateType) => void
}) {
  const { outcomeType, setOutcomeType, setState } = props
  return (
    <Col>
      <div className="text-lg">Choose your question type.</div>
      <Spacer h={4} />
      <Col className="gap-2">
        {[
          ...Object.values(ALL_CONTRACT_TYPES).filter(({ value }) =>
            MULTI_NUMERIC_CREATION_ENABLED ? true : value !== 'NUMBER'
          ),
        ].map(({ label, name, descriptor, example, value, visual }) => (
          <OutcomeButton
            key={value + name}
            label={label}
            descriptor={descriptor}
            example={example}
            value={value}
            visual={visual}
            outcomeType={outcomeType}
            setOutcomeType={setOutcomeType}
            setState={setState}
          />
        ))}
      </Col>
    </Col>
  )
}

function OutcomeButton(props: {
  label: string
  descriptor: string
  example: string | ReactNode
  value: CreateableOutcomeType
  visual: ReactNode
  className?: string
  backgroundColor?: string
  selectClassName?: string
  outcomeType: CreateableOutcomeType | undefined
  setOutcomeType: (outcomeType: CreateableOutcomeType) => void
  setState: (state: CreateContractStateType) => void
}) {
  const {
    label,
    example,
    value,
    visual,
    className,
    backgroundColor,
    selectClassName,
    outcomeType,
    setOutcomeType,
    setState,
  } = props
  const [touch, setTouch] = useState(false)
  return (
    <button
      className={clsx(
        'hover:ring-primary-200 cursor-pointer rounded-lg px-4 py-2 text-left transition-all hover:ring-2',
        className,
        outcomeType == value || touch
          ? selectClassName
            ? selectClassName
            : 'from-primary-100 ring-primary-500 bg-gradient-to-br to-transparent ring-2'
          : backgroundColor ?? 'bg-primary-600/5'
      )}
      onClick={() => {
        setOutcomeType(value)
        setState('filling contract params')
      }}
      onTouchStart={() => setTouch(true)}
      onTouchEnd={() => setTouch(false)}
    >
      <Row className="grow gap-4">
        {visual}
        <Col className="w-full">
          <div className="font-semibold sm:text-lg">{label}</div>
          <Col className="sm:text-md text-sm">
            <span className="text-ink-700 mt-0.5 italic">{example}</span>
          </Col>
        </Col>
      </Row>
    </button>
  )
}
