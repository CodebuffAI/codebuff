import {
  createSupabaseClient,
  createSupabaseDirectClient,
} from 'shared/supabase/init'
import { APIError, APIHandler } from './helpers/endpoint'
import { Headline } from 'common/news'

export const getHeadlines: APIHandler<'headlines'> = async (props) => {
  const { slug } = props
  const pg = createSupabaseDirectClient()
  const columnName = (slug ? `${slug}_` : '') + 'importance_score'
  return await pg
    .map(
      `select id, slug, title from dashboards where ${columnName} > 0 order by ${columnName} desc`,
      [],
      (row) => row as Headline
    )
    .catch((error) => {
      throw new APIError(500, 'Error fetching headlines ' + error.message)
    })
}

export const getPoliticsHeadlines: APIHandler<
  'politics-headlines'
> = async () => {
  const db = createSupabaseClient()

  const all = await db
    .from('dashboards')
    .select('id, slug, title')
    .gt('politics_importance_score', 0)
    .order('politics_importance_score', { ascending: false })

  if (all.error)
    throw new APIError(500, 'Error fetching headlines ' + all.error.message)

  return all.data
}
