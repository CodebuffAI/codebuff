import { useEffect } from 'react'
import { safeLocalStorage } from 'web/lib/util/local'

const savedVisitsKey = 'contract-visits'

export const useSaveContractVisitsLocally = (
  shouldSave: boolean,
  contractId: string
) => {
  useEffect(() => {
    if (!shouldSave || !safeLocalStorage) return

    const contractIds = JSON.parse(
      safeLocalStorage.getItem(savedVisitsKey) || '[]'
    )
    if (!contractIds.includes(contractId)) {
      safeLocalStorage.setItem(
        savedVisitsKey,
        JSON.stringify([...contractIds, contractId])
      )
    }
  }, [shouldSave, contractId])
}

export const getSavedContractVisitsLocally = () => {
  if (!safeLocalStorage) return undefined

  const contractIds = JSON.parse(
    safeLocalStorage.getItem(savedVisitsKey) || '[]'
  )
  return contractIds
}
