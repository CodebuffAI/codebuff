import { constructPrefixTsQuery } from 'shared/helpers/search'
import {
  from,
  join,
  limit,
  orderBy,
  renderSql,
  select,
  where,
} from 'shared/supabase/sql-builder'
import { type APIHandler } from './helpers/endpoint'
import { convertUser } from 'common/supabase/users'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { toUserAPIResponse } from 'common/api/user-types'
import { uniqBy } from 'lodash'

export const searchUsers: APIHandler<'search-users'> = async (props, auth) => {
  const { term, page, limit } = props

  const pg = createSupabaseDirectClient()

  const offset = page * limit
  const userId = auth?.uid
  const searchFollowersSQL = getSearchUserSQL({ term, offset, limit, userId })
  const searchAllSQL = getSearchUserSQL({ term, offset, limit })
  const [followers, all] = await Promise.all([
    pg.map(searchFollowersSQL, null, convertUser),
    pg.map(searchAllSQL, null, convertUser),
  ])

  return uniqBy([...followers, ...all], 'id')
    .map(toUserAPIResponse)
    .slice(0, limit)
}

function getSearchUserSQL(props: {
  term: string
  offset: number
  limit: number
  userId?: string // search only this user's followers
}) {
  const { term, userId } = props

  return renderSql(
    userId
      ? [
          select('users.*'),
          from('users'),
          join('user_follows on user_follows.follow_id = users.id'),
          where('user_follows.user_id = $1', [userId]),
        ]
      : [select('*'), from('users')],
    term
      ? [
          where(
            `name_username_vector @@ websearch_to_tsquery('english', $1)
             or name_username_vector @@ to_tsquery('english', $2)`,
            [term, constructPrefixTsQuery(term)]
          ),

          orderBy(
            `ts_rank(name_username_vector, websearch_to_tsquery($1)) desc,
             data->>'lastBetTime' desc nulls last`,
            [term]
          ),
        ]
      : orderBy(`data->'creatorTraders'->'allTime' desc nulls last`),
    limit(props.limit, props.offset)
  )
}
