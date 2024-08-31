import clsx from 'clsx'
import { Contract } from 'common/contract'
import { useState } from 'react'
import { usePrivateUser } from 'web/hooks/use-user'
import { Button } from './buttons/button'
import { Row } from './layout/row'
import {
  SupabaseAdditionalFilter,
  SupabaseSearch,
} from 'web/components/supabase-search'

export function SelectMarkets(props: {
  submitLabel: (length: number) => string
  onSubmit: (contracts: Contract[]) => void | Promise<void>
  className?: string
  additionalFilter?: SupabaseAdditionalFilter
}) {
  const { submitLabel, onSubmit, className, additionalFilter } = props

  const privateUser = usePrivateUser()
  const [contracts, setContracts] = useState<Contract[]>([])
  const [loading, setLoading] = useState(false)

  async function toggleContract(contract: Contract) {
    if (contracts.some((c) => c.id === contract.id)) {
      setContracts(contracts.filter((c) => c.id !== contract.id))
    } else setContracts([...contracts, contract])
  }

  async function onFinish() {
    setLoading(true)
    await onSubmit(contracts)
    setLoading(false)
    setContracts([])
  }

  return (
    <div className={clsx('px-1', className)}>
      <SupabaseSearch
        persistPrefix="contract-select-modal"
        onContractClick={toggleContract}
        hideActions
        highlightContractIds={contracts.map((c) => c.id)}
        additionalFilter={{
          excludeContractIds: [
            ...(additionalFilter?.excludeContractIds ?? []),
            ...(privateUser?.blockedContractIds ?? []),
          ],
          excludeGroupSlugs: privateUser?.blockedGroupSlugs,
          excludeUserIds: privateUser?.blockedUserIds,
        }}
        headerClassName={'!bg-canvas-0'}
        contractsOnly
        defaultFilter="all"
      />
      <Row className="bg-canvas-0 fixed inset-x-0 bottom-0 justify-end px-8 py-2">
        {!loading && (
          <Row className="grow justify-end gap-4">
            <Button
              onClick={() => {
                if (contracts.length > 0) {
                  setContracts([])
                } else {
                  onSubmit([])
                }
              }}
              color="gray"
            >
              {contracts.length > 0 ? 'Reset' : 'Cancel'}
            </Button>
            <Button
              onClick={onFinish}
              color="indigo"
              disabled={contracts.length <= 0}
              loading={loading}
            >
              {contracts.length > 0
                ? submitLabel(contracts.length)
                : 'Add questions'}
            </Button>
          </Row>
        )}
      </Row>
    </div>
  )
}
