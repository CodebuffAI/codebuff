import { getNewLiquidityProvision } from 'common/add-liquidity'
import { APIError, type APIHandler } from './helpers/endpoint'
import { SUBSIDY_FEE } from 'common/economy'
import { runTxn } from 'shared/txn/run-txn'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { getContract, getUser } from 'shared/utils'
import { onCreateLiquidityProvision } from './on-update-liquidity-provision'
import { insertLiquidity } from 'shared/supabase/liquidity'
import { convertLiquidity } from 'common/supabase/liquidity'
import { getTierFromLiquidity } from 'common/tier'
import { FieldVal } from 'shared/supabase/utils'
import { updateContract } from 'shared/supabase/contracts'

export const addLiquidity: APIHandler<
  'market/:contractId/add-liquidity'
> = async ({ contractId, amount }, auth) => {
  return addContractLiquidity(contractId, amount, auth.uid)
}

export const addContractLiquidity = async (
  contractId: string,
  amount: number,
  userId: string
) => {
  // Run as transaction to prevent race conditions
  return await createSupabaseDirectClient().tx(async (tx) => {
    const contract = await getContract(tx, contractId)
    if (!contract) throw new APIError(404, 'Contract not found')

    if (
      contract.mechanism !== 'cpmm-1' &&
      contract.mechanism !== 'cpmm-multi-1'
    )
      throw new APIError(403, 'Only cpmm-1 and cpmm-multi-1 are supported')

    const { closeTime } = contract
    if (closeTime && Date.now() > closeTime)
      throw new APIError(403, 'Trading is closed')

    if (!isFinite(amount)) throw new APIError(400, 'Invalid amount')

    const user = await getUser(userId, tx)
    if (!user) throw new APIError(401, 'Your account was not found')

    if (user.balance < amount) throw new APIError(403, 'Insufficient balance')

    await runTxn(tx, {
      fromId: userId,
      amount: amount,
      toId: contractId,
      toType: 'CONTRACT',
      category: 'ADD_SUBSIDY',
      token: contract.token === 'CASH' ? 'CASH' : 'M$',
      fromType: 'USER',
    })

    const subsidyAmount = (1 - SUBSIDY_FEE) * amount

    const newLiquidityProvision = getNewLiquidityProvision(
      userId,
      subsidyAmount,
      contract
    )

    const liquidityRow = await insertLiquidity(tx, newLiquidityProvision)
    const liquidity = convertLiquidity(liquidityRow)

    await updateContract(tx, contractId, {
      subsidyPool: FieldVal.increment(subsidyAmount),
      totalLiquidity: FieldVal.increment(subsidyAmount),
      marketTier: getTierFromLiquidity(
        contract,
        contract.totalLiquidity + subsidyAmount
      ),
    })

    return {
      result: liquidity,
      continue: () => onCreateLiquidityProvision(liquidity),
    }
  })
}
