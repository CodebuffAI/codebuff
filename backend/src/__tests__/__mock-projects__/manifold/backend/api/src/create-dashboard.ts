import { createSupabaseDirectClient } from 'shared/supabase/init'
import { z } from 'zod'
import { authEndpoint, validate } from './helpers/endpoint'
import { DashboardItemSchema } from 'common/api/zod-types'
import { slugify } from 'common/util/slugify'
import { randomString } from 'common/util/random'
import { updateDashboardGroups } from 'shared/supabase/dashboard'
import { MAX_DASHBOARD_TITLE_LENGTH } from 'common/dashboard'
import { log } from 'shared/utils'

const schema = z
  .object({
    title: z.string().min(1).max(MAX_DASHBOARD_TITLE_LENGTH),
    items: z.array(DashboardItemSchema),
    topics: z.array(z.string()),
  })
  .strict()

export const createdashboard = authEndpoint(async (req, auth) => {
  const { title, items, topics } = validate(schema, req.body)

  log('creating dashboard')
  const pg = createSupabaseDirectClient()

  let slug = slugify(title)
  const data = await pg.manyOrNone(
    `select slug from dashboards where slug = $1`,
    [slug]
  )

  if (data && data.length > 0) {
    slug = `${slug}-${randomString(8)}`
  }

  const { data: user } = await pg.one(`select data from users where id = $1`, [
    auth.uid,
  ])

  // create if not exists the group invite link row
  const { id } = await pg.one(
    `insert into dashboards(slug, creator_id, title, items, creator_username, creator_name, creator_avatar_url)
      values ($1, $2, $3,$4, $5, $6, $7)
      returning id, slug`,
    [
      slug,
      auth.uid,
      title,
      JSON.stringify(items),
      user.username,
      user.name,
      user.avatarUrl,
    ]
  )

  await pg.tx((txn) => updateDashboardGroups(id, topics, txn))

  return { id: id, slug: slug }
})
