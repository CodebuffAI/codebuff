import { SupabaseDirectClient } from 'shared/supabase/init'
import { Bet } from 'common/bet'
import { convertContract } from 'common/supabase/contracts'
import { GROUP_SCORE_PRIOR, FeedContract } from 'common/feed'
import { TopicToInterestWeights } from 'shared/topic-interests'
import { average } from 'common/util/math'

export const getFollowedReposts = async (
  userId: string,
  limit: number,
  offset: number,
  topicToInterests: TopicToInterestWeights,
  userBlockSql: string,
  pg: SupabaseDirectClient
) => {
  return pg.map(
    `select
         contracts.data as contract_data,
         contracts.importance_score,
         contracts.view_count,
         contracts.conversion_score,
         contracts.freshness_score,
         contract_comments.data as comment,
         contract_comments.likes as comment_likes,
         contract_bets.data as bet_data,
         json_agg(group_contracts.group_id) as group_ids,
         posts.*
        from posts
           join contracts on posts.contract_id = contracts.id and contracts.close_time > now()
           join group_contracts on group_contracts.contract_id = contracts.id
           join contract_comments on posts.contract_comment_id = contract_comments.comment_id
           left join contract_bets on contract_comments.data->>'betId' = contract_bets.bet_id
            where posts.user_id in (select follow_id from user_follows where user_id = $1)
            and not exists (
                select 1 from user_contract_views ucv
                where user_id = $1
                and contract_id = posts.contract_id
                and posts.created_time < coalesce(greatest(ucv.last_page_view_ts, ucv.last_card_view_ts),millis_to_ts(0))
            )
            and contracts.close_time > now()
            and posts.created_time > now() - interval '1 week'
            and coalesce((contract_comments.data->'hidden')::boolean, false) = false
            and contracts.outcome_type != 'STONK'
            and contracts.visibility = 'public'
            ${userBlockSql}
            and contracts.id not in (select contract_id from user_disinterests where user_id = $1 and contract_id = contracts.id)
     group by contracts.data, comment, comment_likes,bet_data, posts.id, posts.created_time,  contracts.importance_score, contracts.view_count, contracts.conversion_score, contracts.freshness_score
        order by posts.created_time desc
        offset $2 limit $3
`,
    [userId, offset, limit],
    (r) => {
      const {
        contract_data,
        importance_score,
        view_count,
        freshness_score,
        conversion_score,
        comment,
        bet_data,
        comment_likes,
        group_ids,
        ...rest
      } = r as any
      const topicWeights = group_ids
        .filter((gid: string) => topicToInterests[gid])
        .map((gid: string) => topicToInterests[gid])
      return {
        contract: convertContract({
          data: contract_data,
          importance_score: importance_score + comment_likes,
          view_count,
          freshness_score: freshness_score + 1,
          conversion_score,
        }),
        comment: {
          ...comment,
          likes: comment_likes,
        },
        bet: bet_data as Bet,
        topicConversionScore:
          topicWeights.length > 0 ? average(topicWeights) : GROUP_SCORE_PRIOR,
        repost: rest,
      } as FeedContract
    }
  )
}

export const getTopicReposts = async (
  userId: string,
  limit: number,
  offset: number,
  userInterestTopicIds: string[],
  userInterestWeights: number[],
  userBlockSql: string,
  pg: SupabaseDirectClient
) => {
  return pg.map(
    `
        select
            avg(group_score) as topic_conversion_score,
            contracts.data as contract_data,
            contracts.importance_score,
            contracts.view_count,
            contracts.conversion_score,
            contracts.freshness_score,
            contract_comments.likes as comment_likes,
            contract_comments.data as comment,
            contract_bets.data as bet_data,
            posts.*
        from 
            (select unnest(array[$1]) as group_id, unnest(array[$2]) as group_score) as uti
           join group_contracts on group_contracts.group_id = uti.group_id
           join posts on posts.contract_id = group_contracts.contract_id
           join contracts on contracts.id = posts.contract_id
           join contract_comments on posts.contract_comment_id = contract_comments.comment_id
           left join contract_bets on contract_comments.data->>'betId' = contract_bets.bet_id
             where not exists (
                select 1 from user_contract_views ucv
                where user_id = $3
                and contract_id = posts.contract_id
                and posts.created_time < coalesce(greatest(ucv.last_page_view_ts, ucv.last_card_view_ts),millis_to_ts(0))
              )
             and posts.user_id not in (select follow_id from user_follows where user_id = $3)
             and group_score > 0.45
             and case when contract_comments.user_id = 'hDq0cvn68jbAUVd6aWIU9aSv9ZA2' 
                 then contract_comments.likes > 1
                 else contract_comments.likes > 0 end
             and contracts.close_time > now()
             and posts.created_time > now() - interval '1 week'
             and coalesce((contract_comments.data->'hidden')::boolean, false) = false
             and contracts.outcome_type != 'STONK' 
             and contracts.visibility = 'public'
             ${userBlockSql}
             and contracts.id not in (select contract_id from user_disinterests where user_id = $3 and contract_id = contracts.id)
        group by contracts.id, posts.id, comment, bet_data, comment_likes
        order by avg(group_score  * contracts.conversion_score) desc
        offset $4 limit $5
`,
    [userInterestTopicIds, userInterestWeights, userId, offset, limit],
    (r) => {
      const {
        contract_data,
        importance_score,
        view_count,
        freshness_score,
        conversion_score,
        comment,
        bet_data,
        comment_likes,
        topic_conversion_score,
        ...rest
      } = r as any

      return {
        contract: convertContract({
          data: contract_data,
          importance_score: importance_score + comment_likes,
          view_count,
          freshness_score: freshness_score + 1,
          conversion_score,
        }),
        comment: {
          ...comment,
          likes: comment_likes,
        },
        bet: bet_data as Bet,
        topicConversionScore: topic_conversion_score,
        repost: rest,
      } as FeedContract
    }
  )
}
