import { APIHandler } from 'api/helpers/endpoint'
import { createSupabaseClient } from 'shared/supabase/init'
import { run } from 'common/supabase/utils'
import { sumBy } from 'lodash'
import { log } from 'shared/utils'

export const getadanalytics: APIHandler<'get-ad-analytics'> = async (body) => {
  const { contractId } = body
  const db = createSupabaseClient()
  const [{ data: adData }, { data: viewData }] = await Promise.all([
    run(
      db
        .from('market_ads')
        .select('id, funds, created_at, cost_per_view')
        .eq('market_id', contractId)
    ),
    run(
      db
        .from('user_contract_views')
        .select('user_id, promoted_views, card_views')
        .eq('contract_id', contractId)
        .or('promoted_views.gt.0, card_views.gt.0')
    ),
  ])
  log({ adData, viewData })

  const lastAdData = adData?.[0]

  const { count: redeemCount } = await run(
    db
      .from('txns')
      .select('*', { count: 'exact' })
      .eq('category', 'MARKET_BOOST_REDEEM')
      .eq('from_id', lastAdData?.id)
  )
  const promotedViewData = viewData?.filter((v) => v.promoted_views > 0)
  const totalFunds = adData?.reduce((acc, v) => acc + v.funds, 0) ?? 0
  return {
    uniquePromotedViewers: promotedViewData.length,
    totalPromotedViews: sumBy(promotedViewData, (d) => d.promoted_views),
    uniqueViewers: viewData.length,
    totalViews: sumBy(viewData, (d) => d.promoted_views + d.card_views),
    redeemCount,
    isBoosted: !!adData?.length,
    totalFunds,
    adCreatedTime: lastAdData?.created_at,
  }
}
