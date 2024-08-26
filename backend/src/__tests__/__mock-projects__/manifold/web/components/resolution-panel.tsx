import { useState } from 'react'
import { YesNoCancelSelector } from './bet/yes-no-selector'
import { Spacer } from './layout/spacer'
import { ResolveConfirmationButton } from './buttons/confirmation-button'
import { APIError, api } from 'web/lib/api/api'
import { getAnswerProbability, getProbability } from 'common/calculate'
import {
  BinaryContract,
  CPMMMultiContract,
  Contract,
  canCancelContract,
  resolution,
} from 'common/contract'
import { BETTORS } from 'common/user'
import { Row } from 'web/components/layout/row'
import { ProbabilityInput } from './widgets/probability-input'
import { Button, IconButton } from './buttons/button'
import { Answer } from 'common/answer'
import { Col } from './layout/col'
import { removeUndefinedProps } from 'common/util/object'
import { XIcon } from '@heroicons/react/solid'
import { useUser } from 'web/hooks/use-user'
import { EditCloseTimeModal } from 'web/components/contract/contract-details'
import clsx from 'clsx'
import { linkClass } from 'web/components/widgets/site-link'
import Link from 'next/link'

function getResolveButtonColor(outcome: resolution | undefined) {
  return outcome === 'YES'
    ? 'green'
    : outcome === 'NO'
    ? 'red'
    : outcome === 'CANCEL'
    ? 'yellow'
    : outcome === 'MKT'
    ? 'blue'
    : 'indigo'
}

function getResolveButtonLabel(
  outcome: resolution | undefined,
  prob: number | undefined
) {
  return outcome === 'CANCEL'
    ? 'N/A'
    : outcome === 'MKT'
    ? `${prob}%`
    : outcome ?? ''
}

export function ResolutionPanel(props: {
  contract: BinaryContract
  inModal?: boolean
  onClose: () => void
}) {
  const { contract, inModal, onClose } = props
  const isCreator = useUser()?.id === contract.creatorId

  const [outcome, setOutcome] = useState<resolution | undefined>()

  const [prob, setProb] = useState<number | undefined>(
    Math.round(getProbability(contract) * 100)
  )

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)

  const resolve = async () => {
    if (!outcome) return

    setIsSubmitting(true)

    try {
      await api('market/:contractId/resolve', {
        outcome,
        contractId: contract.id,
        probabilityInt: prob,
      })
      onClose()
    } catch (e) {
      if (e instanceof APIError) {
        setError(e.message.toString())
      } else {
        console.error(e)
        setError('Error resolving question')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const user = useUser()
  const canCancel = !!user && canCancelContract(user.id, contract)

  return (
    <>
      <ResolveHeader
        contract={contract}
        isCreator={isCreator}
        onClose={onClose}
        fullTitle={inModal}
      />

      <YesNoCancelSelector
        selected={outcome}
        onSelect={setOutcome}
        canCancel={canCancel}
      />

      <Spacer h={4} />
      {!!error && <div className="text-scarlet-500">{error}</div>}

      <Row className={'items-center justify-between gap-3'}>
        <div className="text-sm">
          {outcome === 'YES' ? (
            <>Pay out {BETTORS} who bought YES.</>
          ) : outcome === 'NO' ? (
            <>Pay out {BETTORS} who bought NO.</>
          ) : outcome === 'CANCEL' ? (
            <>
              Cancel all trades and return mana back to {BETTORS}. You repay
              earned fees.
            </>
          ) : outcome === 'MKT' ? (
            <Col className="gap-2">
              <Row className="flex-wrap items-center gap-2">
                <span>Pay out at this probability:</span>{' '}
                <ProbabilityInput
                  prob={prob}
                  onChange={setProb}
                  className="!h-11 w-28"
                />
              </Row>
              <div className="text-ink-500">
                Yes holders get this percent of the winnings and No holders get
                the rest.
              </div>
            </Col>
          ) : (
            <ResolutionExplainer />
          )}
        </div>
        {!inModal && (
          <ResolveConfirmationButton
            color={getResolveButtonColor(outcome)}
            label={getResolveButtonLabel(outcome, prob)}
            marketTitle={contract.question}
            disabled={!outcome}
            onResolve={resolve}
            isSubmitting={isSubmitting}
          />
        )}
        {inModal && (
          <Button
            color={getResolveButtonColor(outcome)}
            disabled={!outcome || isSubmitting}
            loading={isSubmitting}
            onClick={resolve}
          >
            Resolve to {getResolveButtonLabel(outcome, prob)}
          </Button>
        )}
      </Row>
    </>
  )
}

export function ResolveHeader(props: {
  fullTitle?: boolean
  contract: Contract
  isCreator: boolean
  onClose: () => void
}) {
  const { fullTitle, contract, isCreator, onClose } = props
  const { closeTime } = contract
  const [isEditingCloseTime, setIsEditingCloseTime] = useState(false)
  const setNewCloseTime = (newCloseTime: number) => {
    if (newCloseTime > Date.now()) onClose()
  }
  return (
    <Col>
      <Row className="mb-6 items-start justify-between">
        {closeTime && closeTime < Date.now() ? (
          <Col>
            <span className="mb-2 text-lg">
              {!isCreator && (
                <span className="mr-2 rounded bg-purple-100 p-1 align-baseline text-xs uppercase text-purple-600 dark:bg-purple-900 dark:text-purple-300">
                  Mod
                </span>
              )}
              If {isCreator ? 'your' : 'this'} question closed too early{' '}
            </span>
            <Button color={'gray'} onClick={() => setIsEditingCloseTime(true)}>
              Extend the close time
            </Button>
          </Col>
        ) : (
          <div />
        )}
        <IconButton size={'2xs'} onClick={onClose}>
          <XIcon className="h-5 w-5" />
        </IconButton>
      </Row>
      <div className="mb-2 text-lg">
        {!isCreator && (
          <span className="mr-2 rounded bg-purple-100 p-1 align-baseline text-xs uppercase text-purple-600 dark:bg-purple-900 dark:text-purple-300">
            Mod
          </span>
        )}
        If you know the answer, resolve{' '}
        {fullTitle
          ? `"${contract.question}"`
          : isCreator
          ? 'your question'
          : contract.creatorName + `'s question`}
      </div>
      <EditCloseTimeModal
        contract={contract}
        isOpen={isEditingCloseTime}
        setOpen={setIsEditingCloseTime}
        setNewCloseTime={setNewCloseTime}
      />
    </Col>
  )
}

export function MiniResolutionPanel(props: {
  contract: CPMMMultiContract
  answer: Answer
  isAdmin: boolean
  isCreator: boolean
  modalSetOpen?: (open: boolean) => void
}) {
  const { contract, answer, isAdmin, isCreator, modalSetOpen } = props

  const user = useUser()
  const canCancel = !!user && canCancelContract(user.id, contract)

  const [outcome, setOutcome] = useState<resolution | undefined>()
  const toggleOutcome = (newOutcome: resolution | undefined) => {
    if (newOutcome === outcome) {
      setOutcome(undefined)
    } else {
      setOutcome(newOutcome)
    }
  }

  const [prob, setProb] = useState<number | undefined>(
    Math.round(getAnswerProbability(contract, answer.id) * 100)
  )

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)

  const resolve = async () => {
    if (!outcome) return

    setIsSubmitting(true)

    try {
      await api(
        'market/:contractId/resolve',
        removeUndefinedProps({
          outcome,
          contractId: contract.id,
          probabilityInt: prob,
          answerId: answer.id,
        })
      )
    } catch (e) {
      if (e instanceof APIError) {
        setError(e.toString())
      } else {
        console.error(e)
        setError('Error resolving question')
      }
    }

    setIsSubmitting(false)
    if (modalSetOpen) {
      modalSetOpen(false)
    }
  }

  return (
    <Row className="mt-2 flex-wrap gap-4">
      {isAdmin && !isCreator && (
        <div className="bg-scarlet-50 text-scarlet-500 self-start rounded p-1 text-xs">
          ADMIN
        </div>
      )}
      <Col className="gap-1">
        <YesNoCancelSelector
          selected={outcome}
          onSelect={toggleOutcome}
          canCancel={canCancel}
        />
        {outcome === 'MKT' && (
          <Col className="gap-2">
            <Row className="flex-wrap items-center gap-1">
              Resolve to
              <ProbabilityInput
                prob={prob}
                onChange={setProb}
                className="w-28"
                inputClassName=""
              />
            </Row>
            <div className="text-ink-500">
              Yes holders get this percent of the winnings and No holders get
              the rest.
            </div>
          </Col>
        )}
        {outcome === 'CANCEL' && (
          <div className="text-warning">Cancel trades and return mana</div>
        )}
        {error && (
          <div className="text-scarlet-500 self-start rounded p-1 text-xs">
            {error}
          </div>
        )}
      </Col>
      <ResolveConfirmationButton
        color={getResolveButtonColor(outcome)}
        label={getResolveButtonLabel(outcome, prob)}
        marketTitle={`${contract.question} - ${answer.text}`}
        disabled={!outcome}
        onResolve={resolve}
        isSubmitting={isSubmitting}
      />
    </Row>
  )
}

export const ResolutionExplainer = (props: {
  independentMulti?: boolean
  pseudoNumeric?: boolean
}) => {
  const { independentMulti, pseudoNumeric } = props
  const answerOrQuestion = independentMulti ? 'answer' : 'question'
  return (
    <div className="text-ink-500 text-sm">
      {!pseudoNumeric && (
        <>
          Resolves the {answerOrQuestion} and pays out {BETTORS} that got it
          right. <br />{' '}
        </>
      )}
      If you need help, ask in the comments section below; mention{' '}
      <span className="font-semibold">@mods</span> in your comment if you want
      to cancel the {answerOrQuestion}. Or, ask in our{' '}
      <Link
        onClick={(e) => {
          e.stopPropagation()
        }}
        href="https://discord.gg/eHQBNBqXuh"
        className={clsx(linkClass, 'underline')}
      >
        Discord
      </Link>
      !
    </div>
  )
}
