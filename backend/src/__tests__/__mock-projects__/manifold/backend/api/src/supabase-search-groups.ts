import { createSupabaseDirectClient } from 'shared/supabase/init'
import { type APIHandler } from './helpers/endpoint'
import { convertGroup } from 'common/supabase/groups'
import {
  renderSql,
  select,
  from,
  limit,
  orderBy,
  where,
} from 'shared/supabase/sql-builder'
import {
  constructIlikeQuery,
  constructPrefixTsQuery,
} from 'shared/helpers/search'
import { LiteGroup } from 'common/group'

export const supabasesearchgroups: APIHandler<'search-groups'> = async (
  props,
  auth
) => {
  const { term, offset, limit, addingToContract, type, memberGroupsOnly } =
    props

  const pg = createSupabaseDirectClient()
  const uid = auth?.uid

  const searchGroupSQL = getSearchGroupSQL({
    term,
    offset,
    limit,
    uid,
    addingToContract,
    // An alternative would be to create a topics view with only these lite group columns
    fieldSet:
      type === 'full'
        ? '*'
        : 'id, name, slug, total_members, privacy_status, creator_id',
    memberGroupsOnly,
  })

  const groups = await pg.map(searchGroupSQL, null, convertGroup)
  return {
    full: type === 'full' ? groups : [],
    lite: type === 'lite' ? (groups as LiteGroup[]) : [],
  }
}

function getSearchGroupSQL(props: {
  term: string
  offset: number
  limit: number
  uid?: string
  addingToContract?: boolean
  memberGroupsOnly?: boolean
  fieldSet?: string
}) {
  const { term, fieldSet, memberGroupsOnly, uid, addingToContract } = props

  return renderSql(
    select(fieldSet ?? '*'),
    from('groups'),
    memberGroupsOnly && where(`is_group_member(id, $1) or is_admin($1)`, [uid]),

    addingToContract &&
      where(
        `privacy_status != 'curated' or has_moderator_or_above_role(id, $1)`,
        [uid]
      ),

    term
      ? [
          where(
            `name_fts @@ plainto_tsquery('english', $1)
             or name_fts @@ to_tsquery('english', $2)
             or name ilike $3`,
            [term, constructPrefixTsQuery(term), constructIlikeQuery(term)]
          ),
          orderBy('importance_score * similarity($1, name) desc', term),
        ]
      : !uid
      ? orderBy('importance_score desc')
      : orderBy(
          `importance_score * (CASE WHEN is_group_member(id, '${uid}') THEN 1 ELSE 0.5 END) desc`
        ),

    limit(props.limit, props.offset)
  )
}

export const supabasesearchmygroups: APIHandler<'search-my-groups'> = async (
  props,
  ...rest
) => {
  return supabasesearchgroups({ ...props, memberGroupsOnly: true }, ...rest)
}
