import { APIError, APIHandler } from 'api/helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { ValidatedAPIParams } from 'common/api/schema'
import { log, metrics } from 'shared/utils'
import { filterDefined } from 'common/util/array'

const VIEW_COLUMNS = {
  card: ['last_card_view_ts', 'card_views'],
  promoted: ['last_promoted_view_ts', 'promoted_views'],
  page: ['last_page_view_ts', 'page_views'],
} as const

const viewsByContract: Record<
  string,
  ValidatedAPIParams<'record-contract-view'>[]
> = {}
let queueProcessing = false

export const recordContractView: APIHandler<'record-contract-view'> = async (
  body,
  auth
) => {
  const { userId, contractId } = body
  if (userId !== auth?.uid) {
    throw new APIError(401, 'Can only insert views for own user ID.')
  }
  if (!viewsByContract[contractId]) viewsByContract[contractId] = []
  viewsByContract[contractId].push(body)
  metrics.inc('app/contract_view_count', { contract_id: contractId })
  return {
    result: { status: 'success' },
    continue: async () => {
      if (!queueProcessing) {
        queueProcessing = true
        await processViewQueue()
          .catch((e) => log.error('Error processing view queue', e))
          .finally(() => (queueProcessing = false))
      }
    },
  }
}

const processViewQueue = async () => {
  const pg = createSupabaseDirectClient()
  while (Object.values(viewsByContract).length > 0) {
    const totalViews = Object.values(viewsByContract).length
    const contractIds = Object.keys(viewsByContract)
    const oldestViewsUniqueByContract = filterDefined(
      contractIds.map((contractId) => viewsByContract[contractId].shift())
    )
    log(
      `Processing ${oldestViewsUniqueByContract.length} of ${totalViews} views for ${contractIds.length} contracts`
    )
    await Promise.all(
      oldestViewsUniqueByContract.map(async (viewEvent) => {
        log('Processing view', { viewEvent })
        const { userId, kind, contractId } = viewEvent
        const [ts_column, count_column] = VIEW_COLUMNS[kind]

        // Returning count ensures we ignore consecutive views by the same user on same contract within 1 minute
        const count = await pg.oneOrNone(
          `insert into user_contract_views as ucv (user_id, contract_id, $3:name, $4:name)
             values ($1, $2, now(), 1)
             on conflict (user_id, contract_id) do update set $3:name = excluded.$3:name,
                                                              $4:name = ucv.$4:name + excluded.$4:name
             where $1 is null
                or ucv.$3:name is null
                or ucv.$3:name < now() - interval '1 minute'
                returning $4:name as count`,
          [userId ?? null, contractId, ts_column, count_column],
          (r) => r?.count
        )
        if (!count) return
        if (userId) {
          await pg.none(
            `insert into user_view_events(user_id, contract_id, name)
             values ($1, $2, $3)`,
            [userId, contractId, kind]
          )
        }
        if (kind === 'page') {
          await pg.none(
            `update contracts set view_count = view_count + 1 where id = $1`,
            [contractId]
          )
        }
      })
    )
    for (const contractId of contractIds) {
      if (viewsByContract[contractId].length === 0) {
        delete viewsByContract[contractId]
      }
    }
  }
}
