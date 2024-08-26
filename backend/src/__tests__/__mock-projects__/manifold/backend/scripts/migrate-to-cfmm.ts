import { runScript } from 'run-script'
import { uniqBy } from 'lodash'
import { Contract } from 'common/contract'
import { Bet } from 'common/bet'
import { calculateDpmPayout, getDpmProbability } from 'common/calculate-dpm'
import {
  DEV_HOUSE_LIQUIDITY_PROVIDER_ID,
  HOUSE_LIQUIDITY_PROVIDER_ID,
  getCpmmInitialLiquidity,
} from 'common/antes'
import { noFees } from 'common/fees'
import { addObjects } from 'common/util/object'
import {
  getContract,
  getUsers,
  isProd,
  revalidateContractStaticProps,
} from 'shared/utils'
import { calculateUserMetrics } from 'common/calculate-metrics'
import { bulkUpdateContractMetrics } from 'shared/helpers/user-contract-metrics'
import { insertLiquidity } from 'shared/supabase/liquidity'
import { SupabaseDirectClient } from 'shared/supabase/init'
import { getBetsWithFilter } from 'shared/supabase/bets'
import { updateData } from 'shared/supabase/utils'
import { updateContract } from 'shared/supabase/contracts'

async function recalculateContract(
  pg: SupabaseDirectClient,
  contractId: string,
  isCommit = false
) {
  await pg.tx(async (tx) => {
    const contract = await getContract(tx, contractId)

    if (!contract) {
      console.error('contract not found')
      return
    }

    if (!contract.slug) {
      console.log('missing slug; id=', contractId)
      return
    }

    console.log('recalculating', contract.slug)

    if (
      (contract as any).mechanism !== 'dpm-2' ||
      contract.outcomeType !== 'BINARY'
    ) {
      console.log('invalid candidate to port to cfmm')
      return
    }

    const bets = await getBetsWithFilter(tx, { contractId })

    const getSoldBetPayout = (bet: Bet) => {
      const soldBet = bets.find((b) => (bet as any).sale?.betId === b.id)
      return soldBet
        ? -soldBet.amount / Math.sqrt(soldBet.probBefore * soldBet.probAfter)
        : 0
    }

    const newBets: Bet[] = []
    for (const bet of bets) {
      const shares = (bet as any).sale
        ? getSoldBetPayout(bet)
        : (bet as any).isSold
        ? bet.amount / Math.sqrt(bet.probBefore * bet.probAfter) // make up fake share qty
        : calculateDpmPayout(contract, bet, bet.outcome)

      console.log(
        'converting',
        bet.shares,
        bet.outcome,
        (bet as any).isSold ? '(sold)' : '',
        'shares to',
        shares
      )

      if (isCommit)
        await updateData(tx, 'contract_bets', 'bet_id', {
          bet_id: bet.id,
          shares,
          dpmShares: bet.shares,
        } as any)

      newBets.push({ ...bet, shares })
    }

    const prob =
      contract.resolutionProbability ??
      getDpmProbability((contract as any).totalShares)

    const ante = 100
    const newPool = { YES: ante, NO: ante }
    console.log('creating liquidity pool at p=', prob, 'for Ṁ', ante)

    const contractUpdate: Partial<Contract> = {
      pool: newPool,
      p: prob,
      mechanism: 'cpmm-1' as const,
      totalLiquidity: ante,
      collectedFees: addObjects(contract.collectedFees ?? noFees, noFees),
      subsidyPool: 0,
      prob,
      probChanges: {
        day: 0,
        week: 0,
        month: 0,
      },
    }

    const additionalInfo = {
      cfmmConversionTime: Date.now(),
      dpmPool: contract.pool,
    }

    const providerId = isProd()
      ? HOUSE_LIQUIDITY_PROVIDER_ID
      : DEV_HOUSE_LIQUIDITY_PROVIDER_ID
    const lp = getCpmmInitialLiquidity(
      providerId,
      {
        ...contract,
        ...contractUpdate,
      } as any,
      ante,
      contract.createdTime
    )

    const userIds = uniqBy(newBets, (b) => b.userId).map((b) => b.userId)
    const users = await getUsers(userIds)
    const updatedContract = {
      ...contract,
      ...contractUpdate,
      ...additionalInfo,
    }
    const userContractMetrics = users.flatMap((user) =>
      calculateUserMetrics(
        updatedContract as any,
        newBets.filter((b) => b.userId === user.id),
        user,
        []
      )
    )
    if (isCommit) {
      await updateContract(tx, contractId, {
        ...contractUpdate,
        ...additionalInfo,
      })

      await insertLiquidity(pg, lp)

      await bulkUpdateContractMetrics(userContractMetrics)
      console.log('updated', contract.slug)

      await revalidateContractStaticProps(contract)
    }
  })
}

if (require.main === module) {
  runScript(async ({ pg, db }) => {
    const slug = process.argv[2]
    const isCommit = process.argv[3] === 'commit'

    const query = db
      .from('contracts')
      .select('id')
      .eq('mechanism', 'dpm-2')
      .eq('outcome_type', 'BINARY')

    if (slug !== 'all') {
      query.eq('slug', slug)
    }

    const { data, error } = await query

    if (error) {
      console.error('error fetching contracts', error)
      return
    }

    for (const { id } of data) {
      await recalculateContract(pg, id, isCommit).catch((e) =>
        console.error('error: ', e, 'id=', id)
      )
      console.log()
      console.log()
    }
  })
}
