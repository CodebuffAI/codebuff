import { isAdminId, isModId } from 'common/envs/constants'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { APIError, APIHandler } from './helpers/endpoint'
import { log, revalidateStaticProps } from 'shared/utils'
import { track } from 'shared/analytics'

export const setnews: APIHandler<'set-news'> = async (props, auth) => {
  const { dashboardIds } = props
  const nonNewsSlug = props.endpoint !== 'news' ? props.endpoint : undefined
  log('set-news', { dashboardIds, endpoint: nonNewsSlug })

  if (!isAdminId(auth.uid) && !isModId(auth.uid)) {
    throw new APIError(403, 'You are not an admin or mod')
  }

  const pg = createSupabaseDirectClient()
  // TODO: if we keep adding more dashboard order types, we may want to make a dashboard_order table and have rows with slugs and orders
  const slugs: { slug: string }[] = await pg.tx(async (t) => {
    const columnName =
      (nonNewsSlug ? `${nonNewsSlug}_` : '') + 'importance_score'
    await t.none(`update dashboards set ${columnName} = 0`)
    if (dashboardIds.length === 0) return []
    const queries = dashboardIds.map((id, i) =>
      t.one(
        `update dashboards set ${columnName} = $2 where id = $1 returning slug`,
        [id, 1 - i / dashboardIds.length]
      )
    )

    return t.batch(queries)
  })

  await Promise.all(
    nonNewsSlug
      ? [revalidateStaticProps(`/${nonNewsSlug}`)]
      : [
          revalidateStaticProps(`/home`),
          revalidateStaticProps(`/news`),
          ...slugs.map(({ slug }) => revalidateStaticProps(`/news/${slug}`)),
        ]
  )

  track(auth.uid, 'set-news', { dashboardIds, endpoint: nonNewsSlug })

  return { success: true }
}
