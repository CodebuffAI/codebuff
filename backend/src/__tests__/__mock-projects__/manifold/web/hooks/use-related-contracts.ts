import { uniqBy } from 'lodash'
import { Contract } from 'common/contract'
import { useEffect, useRef, useState } from 'react'
import { usePrivateUser } from './use-user'
import { isContractBlocked } from 'web/lib/firebase/users'
import { useEvent } from './use-event'
import { api } from 'web/lib/api/api'

const LIMIT = 10

export const useRelatedMarkets = (
  contract: Contract,
  initialContracts: Contract[]
) => {
  const [savedContracts, setSavedContracts] = useState(initialContracts)
  const offset = useRef(0)
  const privateUser = usePrivateUser()
  let hasLoadedMoreContracts = false

  const loadMore = useEvent(async () => {
    const { groupContracts } = await api('get-related-markets-by-group', {
      contractId: contract.id,
      limit: LIMIT,
      offset: offset.current,
    })

    setSavedContracts((sc) => {
      const newContracts = uniqBy([...sc, ...groupContracts], (c) => c.id)
      const filteredContracts = newContracts.filter(
        (c) => !isContractBlocked(privateUser, c) && c.id !== contract.id
      )
      if (filteredContracts.length > sc.length) {
        hasLoadedMoreContracts = true
      }
      offset.current += LIMIT
      return filteredContracts
    })

    return hasLoadedMoreContracts
  })

  useEffect(() => {
    if (initialContracts.length === 0) loadMore()
  }, [])

  return { contracts: savedContracts, loadMore }
}
