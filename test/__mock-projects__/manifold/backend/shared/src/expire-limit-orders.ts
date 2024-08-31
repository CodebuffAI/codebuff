import { createSupabaseDirectClient } from 'shared/supabase/init'
import { uniq } from 'lodash'
import { convertBet } from 'common/supabase/bets'
import { createLimitBetExpiredNotification } from 'shared/create-notification'
import { getContractsDirect } from 'shared/supabase/contracts'
import { LimitBet } from 'common/bet'

export async function expireLimitOrders() {
  const pg = createSupabaseDirectClient()

  const bets = await pg.map(
    `
    update contract_bets
    set data = data || '{"isCancelled": true}'
    where is_filled = false
    and is_cancelled = false
    and (data->'expiresAt')::bigint < ts_to_millis(now())
    returning *
  `,
    [],
    convertBet
  )
  const uniqueContractIds = uniq(bets.map((bet) => bet.contractId))
  const contracts = await getContractsDirect(uniqueContractIds, pg)
  await Promise.all(
    bets.map(async (bet) => {
      const contract = contracts.find((c) => c.id === bet.contractId)
      if (!contract) {
        console.error(`Contract not found for bet ${bet.id}`)
        return
      }
      if (contract.closeTime && contract.closeTime < Date.now()) {
        return
      }
      await createLimitBetExpiredNotification(bet as LimitBet, contract)
    })
  )

  console.log(`Expired ${bets.length} limit orders`)
}
