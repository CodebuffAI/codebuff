import { Answer } from 'common/answer'
import { CPMMMultiContract, MultiContract } from 'common/contract'
import { Button, SizeType } from 'web/components/buttons/button'
import { useState } from 'react'
import { formatPercent } from 'common/util/format'
import { track } from 'web/lib/service/analytics'
import {
  Answer as AnswerComponent,
  EditAnswerModal,
  canEditAnswer,
} from './answers-panel'
import { BuyPanelBody } from 'web/components/bet/bet-panel'
import { getAnswerColor } from '../charts/contract/choice'
import { useUser } from 'web/hooks/use-user'
import { PencilIcon } from '@heroicons/react/solid'
import { useAnswersCpmm } from 'web/hooks/use-answers'

export function BinaryMultiAnswersPanel(props: {
  contract: CPMMMultiContract
  feedReason?: string
}) {
  const { feedReason, contract } = props
  const answers = useAnswersCpmm(contract.id) ?? contract.answers

  const [outcome, setOutcome] = useState<'YES' | 'NO' | undefined>(undefined)

  if (contract.isResolved) {
    return (
      <>
        {answers.map((answer) => (
          <AnswerComponent
            shouldShowLimitOrderChart={false}
            key={answer.id}
            user={null}
            answer={answer}
            contract={contract as MultiContract}
            color={getAnswerColor(answer)}
            feedReason={feedReason}
          />
        ))}
      </>
    )
  }

  return (
    <>
      {outcome === undefined ? (
        <div className="mx-[2px] mt-1 flex flex-col justify-between gap-2 sm:flex-row">
          {answers.map((answer, i) => (
            <BetButton
              outcome={i === 0 ? 'YES' : 'NO'}
              setOutcome={setOutcome}
              key={answer.id}
              answer={answer}
              color={getAnswerColor(answer)}
            />
          ))}
        </div>
      ) : (
        <BinaryMultiChoiceBetPanel
          answer={outcome === 'YES' ? answers[0] : answers[1]}
          contract={contract}
          outcome={outcome}
          setOutcome={setOutcome}
          closePanel={() => setOutcome(undefined)}
        />
      )}
    </>
  )
}

const BetButton = (props: {
  answer: Answer
  outcome: 'YES' | 'NO'
  setOutcome: (outcome: 'YES' | 'NO') => void
  color?: string
  size?: SizeType
}) => {
  const { answer, size, outcome, setOutcome, color } = props

  return (
    <>
      <Button
        size={size ?? 'xl'}
        color="none"
        style={{ backgroundColor: color }}
        className={'flex flex-1 items-center justify-between gap-1 text-white'}
        onClick={() => {
          // TODO: Twomba tracking bet terminology
          track('bet intent', { location: 'answer panel' })
          setOutcome(outcome)
        }}
      >
        <span className="line-clamp-1 text-left sm:line-clamp-2">
          {answer.text}
        </span>
        <span className={'text-xl'}>{formatPercent(answer.prob)}</span>
      </Button>
    </>
  )
}

function BinaryMultiChoiceBetPanel(props: {
  answer: Answer
  contract: CPMMMultiContract
  closePanel: () => void
  outcome: 'YES' | 'NO' | undefined
  setOutcome: (outcome: 'YES' | 'NO') => void
}) {
  const { answer, contract, closePanel, outcome, setOutcome } = props

  const [editing, setEditing] = useState(false)
  const color = getAnswerColor(answer)
  const user = useUser()
  const canEdit = canEditAnswer(answer, contract, user)

  return (
    <BuyPanelBody
      contract={contract}
      multiProps={{
        answers: contract.answers,
        answerToBuy: contract.answers[0],
        answerText: answer.text,
      }}
      outcome={outcome}
      setOutcome={setOutcome}
      onBuySuccess={() => setTimeout(closePanel, 500)}
      onClose={closePanel}
      location={'contract page answer'}
      panelClassName="!bg-canvas-50 gap-2"
    >
      <div className={'group mr-6 text-2xl'}>
        {answer.text}
        {canEdit && user && (
          <>
            <Button
              color="gray-white"
              className="visible group-hover:visible sm:invisible"
              size="xs"
              onClick={() => setEditing(true)}
            >
              <PencilIcon className="text-primary-700 h-4 w-4" />
            </Button>
            <EditAnswerModal
              open={editing}
              setOpen={setEditing}
              contract={contract}
              answer={answer}
              color={color}
              user={user}
            />
          </>
        )}
      </div>
    </BuyPanelBody>
  )
}
