import { LiquidityProvision } from 'common/liquidity-provision'
import { useEffect, useState } from 'react'
import { getLiquidtyDocs } from 'web/lib/supabase/liquidity'
import { useApiSubscription } from './use-api-subscription'
import { useIsPageVisible } from './use-page-visible'

export const useLiquidity = (contractId: string) => {
  const [liquidities, setLiquidities] = useState<
    LiquidityProvision[] | undefined
  >(undefined)

  const isPageVisible = useIsPageVisible()

  useEffect(() => {
    if (isPageVisible) {
      getLiquidtyDocs(contractId).then(setLiquidities)
    }
  }, [contractId, isPageVisible])

  useApiSubscription({
    topics: [`contract/${contractId}/new-subsidy`],
    onBroadcast: () => {
      getLiquidtyDocs(contractId).then(setLiquidities)
    },
  })

  return liquidities
}
