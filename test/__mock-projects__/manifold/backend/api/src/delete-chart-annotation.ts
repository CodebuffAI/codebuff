import { z } from 'zod'
import { authEndpoint, validate } from 'api/helpers/endpoint'
import { throwErrorIfNotMod } from 'shared/helpers/auth'
import { createSupabaseDirectClient } from 'shared/supabase/init'

const bodySchema = z
  .object({
    id: z.number(),
  })
  .strict()

export const deletechartannotation = authEndpoint(async (req, auth) => {
  const { id } = validate(bodySchema, req.body)

  const pg = createSupabaseDirectClient()
  const res = await pg.one(
    `select creator_id from chart_annotations where id = $1`,
    [id]
  )
  if (res.creator_id !== auth.uid) await throwErrorIfNotMod(auth.uid)
  await pg.none(`delete from chart_annotations where id = $1`, [id])

  return { success: true, id }
})
