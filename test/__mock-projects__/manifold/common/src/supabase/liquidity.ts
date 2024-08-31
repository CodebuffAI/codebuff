import { LiquidityProvision } from 'common/liquidity-provision'
import { Row } from './utils'

export const convertLiquidity = (
  row: Row<'contract_liquidity'>
): LiquidityProvision => ({
  ...(row.data as any),
  id: row.liquidity_id,
  contractId: row.contract_id,
})
