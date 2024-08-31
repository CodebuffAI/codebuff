import { CPMMContract, CPMMMultiContract } from 'common/contract'
import { getContractSupabase, isProd } from 'shared/utils'
import {
  DEV_HOUSE_LIQUIDITY_PROVIDER_ID,
  HOUSE_LIQUIDITY_PROVIDER_ID,
} from 'common/antes'
import { getNewLiquidityProvision } from 'common/add-liquidity'
import { insertLiquidity } from 'shared/supabase/liquidity'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { APIError } from 'common/api/utils'
import { updateContract } from 'shared/supabase/contracts'
import { FieldVal } from 'shared/supabase/utils'

export const addHouseSubsidy = async (contractId: string, amount: number) => {
  const pg = createSupabaseDirectClient()

  const contract = await getContractSupabase(contractId)
  if (!contract) {
    throw new APIError(500, 'Contract not found')
  }

  const providerId = isProd()
    ? HOUSE_LIQUIDITY_PROVIDER_ID
    : DEV_HOUSE_LIQUIDITY_PROVIDER_ID

  const newLiquidityProvision = getNewLiquidityProvision(
    providerId,
    amount,
    contract as CPMMContract | CPMMMultiContract
  )

  await pg.tx(async (tx) => {
    await insertLiquidity(tx, newLiquidityProvision)
    await updateContract(tx, contractId, {
      subsidyPool: FieldVal.increment(amount),
      totalLiquidity: FieldVal.increment(amount),
    })
  })
}

export const addHouseSubsidyToAnswer = async (
  contractId: string,
  answerId: string,
  amount: number
) => {
  const pg = createSupabaseDirectClient()

  const contract = await getContractSupabase(contractId)
  if (!contract) {
    throw new APIError(500, 'Contract not found')
  }

  const providerId = isProd()
    ? HOUSE_LIQUIDITY_PROVIDER_ID
    : DEV_HOUSE_LIQUIDITY_PROVIDER_ID

  const newLiquidityProvision = getNewLiquidityProvision(
    providerId,
    amount,
    contract as CPMMContract | CPMMMultiContract,
    answerId
  )

  await pg.tx(async (tx) => {
    await insertLiquidity(tx, newLiquidityProvision)

    await tx.none(
      `update answers
      set
        total_liquidity = total_liquidity + $1,
        subsidy_pool = subsidy_pool + $1
      where id = $2`,
      [amount, answerId]
    )

    await updateContract(tx, contractId, {
      totalLiquidity: FieldVal.increment(amount),
    })
  })
}
