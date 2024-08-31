import { createSupabaseDirectClient } from 'shared/supabase/init'
import { log } from 'shared/utils'
import {
  DEFAULT_CONVERSION_SCORE_DENOMINATOR,
  DEFAULT_CONVERSION_SCORE_NUMERATOR,
} from 'common/new-contract'
import { chunk } from 'lodash'

export async function calculateConversionScore() {
  const pg = createSupabaseDirectClient()
  log('Loading contract data...')
  const contractIds = await pg.map(
    `select distinct contract_id from user_view_events
        where created_time > now() - interval '1 hour'`,
    [],
    (c) => c.contract_id
  )
  const chunks = chunk(contractIds, 100)
  log(
    `Processing conversion scores for ${contractIds.length} contracts in ${chunks.length} chunks...`
  )
  let processed = 0
  for (const chunk of chunks) {
    await pg
      .none(
        `
        with card_viewers as (
          select contract_id, coalesce(count(distinct user_id), 0) as uniques
          from user_contract_views
          where card_views > 0
            and contract_id= any ($1)
          group by contract_id
        ),
         page_viewers as (
           select contract_id, coalesce(count(distinct user_id), 0) as uniques
           from user_contract_views
           where page_views > 0
             and contract_id= any ($1)
           group by contract_id
         ),
         page_enjoyers as (
           select contract_id, count(distinct user_id) as uniques
           from user_contract_interactions
           where name in ('page bet', 'page comment', 'page repost', 'page like', 'page share')
             and contract_id= any ($1)
           group by contract_id
         ),
         card_enjoyers as (
           select contract_id, count(distinct user_id) as uniques
           from user_contract_interactions
           where name in ('card bet', 'card like', 'card click')
             and contract_id= any ($1)
           group by contract_id
         ),
         recent_card_viewers as (
           select contract_id, count(distinct user_id) as uniques
           from user_view_events
           where name = 'card'
             and contract_id= any ($1)
             and created_time > now() - interval '1 week'
           group by contract_id
         ),
         recent_page_viewers as (
           select contract_id, count(distinct user_id) as uniques
           from user_view_events
           where name = 'page'
             and contract_id= any ($1)
             and created_time > now() - interval '1 week'
           group by contract_id
         ),
         recent_card_enjoyers as (
           select contract_id, count(distinct user_id) as uniques
           from user_contract_interactions
           where name in ('card bet', 'card like', 'card click')
             and contract_id= any ($1)
             and created_time > now() - interval '1 week'
           group by contract_id),
         recent_page_enjoyers as (
           select contract_id, count(distinct user_id) as uniques
           from user_contract_interactions
           where name in ('page bet', 'page comment', 'page repost', 'page like', 'page share')
             and contract_id= any ($1)
             and created_time > now() - interval '1 week'
           group by contract_id)
        update contracts c
        set conversion_score = (
          select 
            case when 
                -- If our data is sus, return default conversion score
              (coalesce(pe.uniques,0) > coalesce(pv.uniques,0) or
              coalesce(ce.uniques,0) > coalesce(cv.uniques,0))
              then ($2 * 1.0) / $3
            else
              power(
                (($2+coalesce(rce.uniques, 0) * 1.0) / (coalesce(nullif(rcv.uniques,0),rce.uniques,0)+$3))
                    *
                (($2+coalesce(rpe.uniques, 0) * 1.0) / (coalesce(nullif(rpv.uniques,0),rpe.uniques,0)+$3))
                    *
                (($2+coalesce(ce.uniques, 0) * 1.0) / (coalesce(nullif(cv.uniques,0),ce.uniques,0)+$3))
                    *
                (($2+coalesce(pe.uniques, 0) * 1.0) / (coalesce(nullif(pv.uniques,0), pe.uniques,0)+$3)),
                1.0 / 4
              ) end
          from contracts c2
             left join recent_card_enjoyers rce on c.id = rce.contract_id
             left join recent_card_viewers rcv on c.id = rcv.contract_id
             left join recent_page_enjoyers rpe on c.id = rpe.contract_id
             left join recent_page_viewers rpv on c.id = rpv.contract_id
             left join card_viewers cv on c2.id = cv.contract_id
             left join card_enjoyers ce on c2.id = ce.contract_id
             left join page_viewers pv on c2.id = pv.contract_id
             left join page_enjoyers pe on c2.id = pe.contract_id
          where c2.id = c.id
        )
        where c.id = any ($1)
        `,
        [
          chunk,
          DEFAULT_CONVERSION_SCORE_NUMERATOR,
          DEFAULT_CONVERSION_SCORE_DENOMINATOR,
        ]
      )
      .catch((e) => {
        log('Error on set conversion scores', e)
        return null
      })
    processed += chunk.length
    log(`Finished processing conversion scores for ${processed} contracts.`)
  }
  log('Done.')
}
