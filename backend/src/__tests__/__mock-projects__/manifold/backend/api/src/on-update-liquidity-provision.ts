import { getContract, getUser, log } from 'shared/utils'
import { createFollowOrMarketSubsidizedNotification } from 'shared/create-notification'
import { LiquidityProvision } from 'common/liquidity-provision'
import { broadcastNewSubsidy } from 'shared/websockets/helpers'
import { type Contract } from 'common/contract'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { followContractInternal } from 'api/follow-contract'

export const onCreateLiquidityProvision = async (
  liquidity: LiquidityProvision
) => {
  const pg = createSupabaseDirectClient()
  const contract = (await getContract(pg, liquidity.contractId)) as Contract & {
    mechanism: 'cpmm-1' | 'cpmm-multi-1'
  }

  if (!contract)
    throw new Error('Could not find contract corresponding with liquidity')

  broadcastNewSubsidy(contract.id, contract.visibility, liquidity.amount)

  // Ignore Manifold Markets liquidity for now - users see a notification for free market liquidity provision
  if (liquidity.isAnte) return

  log(`onCreateLiquidityProvision: ${JSON.stringify(liquidity)}`)

  const liquidityProvider = await getUser(liquidity.userId)
  if (!liquidityProvider) throw new Error('Could not find liquidity provider')
  await followContractInternal(pg, contract.id, true, liquidityProvider.id)
  await createFollowOrMarketSubsidizedNotification(
    contract.id,
    'liquidity',
    'created',
    liquidityProvider,
    `subsidy-${liquidity.id}`,
    liquidity.amount.toString(),
    { contract }
  )
}
