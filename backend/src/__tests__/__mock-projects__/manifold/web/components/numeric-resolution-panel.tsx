import { useState } from 'react'
import { NumberCancelSelector } from './bet/yes-no-selector'
import { Spacer } from './layout/spacer'
import { ResolveConfirmationButton } from './buttons/confirmation-button'
import { PseudoNumericContract, canCancelContract } from 'common/contract'
import { APIError, api } from 'web/lib/api/api'
import { getPseudoProbability } from 'common/pseudo-numeric'
import { BETTORS } from 'common/user'
import { Button } from './buttons/button'
import { AmountInput } from './widgets/amount-input'
import { ResolutionExplainer, ResolveHeader } from './resolution-panel'
import { useUser } from 'web/hooks/use-user'

function getNumericResolveButtonColor(
  outcomeMode: 'NUMBER' | 'CANCEL' | undefined
) {
  return outcomeMode === 'CANCEL' ? 'yellow' : 'indigo'
}

function getNumericResolveButtonLabel(
  outcomeMode: 'NUMBER' | 'CANCEL' | undefined,
  value: number | undefined
) {
  return outcomeMode === 'CANCEL' ? 'N/A' : value ? String(value) : ''
}

export function NumericResolutionPanel(props: {
  contract: PseudoNumericContract
  inModal?: boolean
  onClose: () => void
}) {
  const { contract, inModal, onClose } = props
  const { min, max, question } = contract
  const isCreator = useUser()?.id === contract.creatorId

  const [outcomeMode, setOutcomeMode] = useState<'NUMBER' | 'CANCEL'>('NUMBER')
  const [value, setValue] = useState<number | undefined>()

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)

  const resolve = async () => {
    setIsSubmitting(true)

    const boundedValue = Math.max(Math.min(max, value ?? 0), min)

    const probabilityInt =
      100 * getPseudoProbability(boundedValue, min, max, contract.isLogScale)

    const outcome = outcomeMode === 'CANCEL' ? 'CANCEL' : 'MKT'

    try {
      await api('market/:contractId/resolve', {
        value,
        probabilityInt,
        outcome,
        contractId: contract.id,
      })
    } catch (e) {
      if (e instanceof APIError) {
        setError(e.toString())
      } else {
        console.error(e)
        setError('Error resolving market')
      }
    }

    setIsSubmitting(false)
    onClose()
  }
  const buttonDisabled =
    outcomeMode === undefined ||
    (value === undefined && outcomeMode !== 'CANCEL')

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

      <NumberCancelSelector
        selected={outcomeMode}
        onSelect={setOutcomeMode}
        canCancel={canCancel}
      />

      <Spacer h={4} />

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm">
          {
            outcomeMode === 'CANCEL' ? (
              <>Cancel all trades and return mana back to {BETTORS}.</>
            ) : outcomeMode === 'NUMBER' ? (
              <>
                Pay out {BETTORS} who brought the market closer to the correct
                value.
                <AmountInput
                  amount={value}
                  onChangeAmount={setValue}
                  disabled={isSubmitting}
                  error={value !== undefined && (value < min || value > max)}
                  allowNegative
                  label=""
                  inputClassName="!h-11 w-28"
                />
              </>
            ) : null // never
          }
        </div>

        {inModal ? (
          <Button
            color={getNumericResolveButtonColor(outcomeMode)}
            disabled={buttonDisabled || isSubmitting}
            loading={isSubmitting}
            onClick={resolve}
          >
            Resolve <>{getNumericResolveButtonLabel(outcomeMode, value)}</>
          </Button>
        ) : (
          <ResolveConfirmationButton
            onResolve={resolve}
            isSubmitting={isSubmitting}
            color={getNumericResolveButtonColor(outcomeMode)}
            label={getNumericResolveButtonLabel(outcomeMode, value)}
            marketTitle={question}
            disabled={buttonDisabled}
          />
        )}
      </div>
      {!!error && <div className="text-scarlet-500">{error}</div>}

      <Spacer h={4} />
      <ResolutionExplainer pseudoNumeric />
    </>
  )
}
