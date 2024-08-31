import clsx from 'clsx'
import { ReactNode, useEffect, useState } from 'react'
import { ChevronRightIcon } from '@heroicons/react/solid'
import { User } from 'common/user'
import { CreateableOutcomeType, add_answers_mode } from 'common/contract'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { ChoosingContractForm } from './choosing-contract-form'
import { ContractParamsForm } from './contract-params-form'
import { getContractTypeFromValue } from './create-contract-types'
import { capitalize } from 'lodash'
import { track } from 'web/lib/service/analytics'
import { FaQuestion, FaUsers } from 'react-icons/fa'
import { ExpandSection } from 'web/components/explainer-panel'
import { WEEK_MS } from 'common/util/time'

export type NewQuestionParams = {
  groupIds?: string[]
  groupSlugs?: string[]
  q: string
  description: string
  closeTime: number
  outcomeType?: CreateableOutcomeType
  // Params for PSEUDO_NUMERIC outcomeType
  min?: number
  max?: number
  isLogScale?: boolean
  initValue?: number
  answers?: string[]
  addAnswersMode?: add_answers_mode
  shouldAnswersSumToOne?: boolean
  precision?: number
}

export type CreateContractStateType =
  | 'choosing contract'
  | 'filling contract params'

// Allow user to create a new contract
export function NewContractPanel(props: {
  creator: User
  params?: NewQuestionParams
}) {
  const { creator, params } = props
  const [outcomeType, setOutcomeType] = useState<
    CreateableOutcomeType | undefined
  >(params?.outcomeType ?? undefined)

  const [state, setState] = useState<CreateContractStateType>(
    params?.outcomeType ? 'filling contract params' : 'choosing contract'
  )

  useEffect(() => {
    if (outcomeType !== params?.outcomeType) {
      setOutcomeType(params?.outcomeType)
    }
    if (params?.outcomeType) {
      setState('filling contract params')
    }
  }, [params?.outcomeType])

  return (
    <Col
      className={clsx(
        'text-ink-1000 bg-canvas-0 mx-auto w-full max-w-2xl transition-colors'
      )}
    >
      <CreateStepTracker outcomeType={outcomeType} setState={setState} />
      <Col className={clsx('px-6 py-2')}>
        {state == 'choosing contract' && (
          <>
            <ChoosingContractForm
              outcomeType={outcomeType}
              setOutcomeType={setOutcomeType}
              setState={setState}
            />
            {creator.createdTime > Date.now() - WEEK_MS && <ExplainerPanel />}
          </>
        )}
        {state == 'filling contract params' && outcomeType && (
          <ContractParamsForm
            outcomeType={outcomeType}
            creator={creator}
            params={params}
          />
        )}
      </Col>
    </Col>
  )
}

function CreateStepTracker(props: {
  outcomeType: CreateableOutcomeType | undefined
  setState: (state: CreateContractStateType) => void
}) {
  const { outcomeType, setState } = props
  return (
    <Row
      className={clsx(
        'text-ink-400 bg-canvas-0 border-1 border-ink-200 sticky z-10 w-full items-center gap-1 border-b pb-2 pt-4',
        'top-0 px-6'
      )}
    >
      <CreateStepButton onClick={() => setState('choosing contract')}>
        Choose question type
      </CreateStepButton>
      <ChevronRightIcon className={clsx('h-5 w-5')} />
      <CreateStepButton
        disabled={!outcomeType}
        onClick={() => {
          if (outcomeType) {
            setState('filling contract params')
          }
        }}
      >
        {outcomeType
          ? `${capitalize(getContractTypeFromValue(outcomeType, 'name'))}`
          : ''}
      </CreateStepButton>
    </Row>
  )
}

function CreateStepButton(props: {
  onClick: () => void
  className?: string
  children: ReactNode
  disabled?: boolean
}) {
  const { onClick, children, className, disabled } = props
  return (
    <button
      className={clsx(
        className,
        'disabled:text-ink-400 text-primary-600 enabled:hover:text-primary-800 transition-all  disabled:cursor-not-allowed'
      )}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  )
}

const ExplainerPanel = (props: { className?: string }) => {
  const { className } = props
  const handleSectionClick = (sectionTitle: string) => {
    track('create explainer section click', { sectionTitle })
  }
  return (
    <Col className={clsx('mt-4', className)}>
      <h2 className={clsx('text-ink-600 mb-2 text-xl')}>What is this?</h2>
      <ResolutionPanel onClick={handleSectionClick} />
      <TraderPanel onClick={handleSectionClick} />
    </Col>
  )
}

const ResolutionPanel = ({
  onClick,
}: {
  onClick: (sectionTitle: string) => void
}) => (
  <ExpandSection
    title={
      <Row className="items-start">
        <FaQuestion className="mr-2 mt-[0.25em] flex-shrink-0 align-text-bottom" />{' '}
        Who decides on the answer?
      </Row>
    }
    onClick={() => onClick('Who decides on the answer?')}
  >
    <div className="pb-2">You do!</div>
    <div className="pb-2">
      Isn't this a conflict of interest? If the creator resolves their question
      dishonestly, that will likely be the last question they get traders on.
    </div>
    <div className="pb-2">
      Traders are attracted to markets with clear resolution criteria and
      trustworthy creators. On top of that, mods can step in and re-resolve the
      market if it's clear the creator is being dishonest.
    </div>
  </ExpandSection>
)

const TraderPanel = ({
  onClick,
}: {
  onClick: (sectionTitle: string) => void
}) => (
  <ExpandSection
    title={
      <Row className="items-start">
        <FaUsers className="mr-2 mt-[0.25em] flex-shrink-0 align-text-bottom" />{' '}
        Who will weigh in?
      </Row>
    }
    onClick={() => onClick('Who will weigh in?')}
  >
    <div className="pb-2">Our thousands of daily, active traders.</div>
    <div className="pb-2">
      The traders that have insight into your question will push the probability
      towards the correct answer. The traders that are correct earn more mana
      (our play-money currency), and influence the probability more.
    </div>
  </ExpandSection>
)
