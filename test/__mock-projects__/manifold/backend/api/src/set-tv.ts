import { authEndpoint, validate } from './helpers/endpoint'
import { z } from 'zod'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { getContractIdFromSlug } from 'shared/supabase/contracts'
import { isAdminId, isModId } from 'common/envs/constants'
import { broadcastTVScheduleUpdate } from 'shared/websockets/helpers'

const schema = z.object({
  id: z.string().optional(),
  slug: z.string(),
  streamId: z.string(),
  source: z.union([
    z.literal('youtube'),
    z.literal('twitch'),
    z.literal('twitter'),
  ]),
  title: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  isFeatured: z.boolean(),
})

export const settv = authEndpoint(async (req, auth) => {
  const tvSettings = validate(schema, req.body)

  const pg = createSupabaseDirectClient()

  const { id, slug, streamId, source, title, startTime, endTime } = tvSettings

  const isFeatured =
    (isModId(auth.uid) || isAdminId(auth.uid)) && tvSettings.isFeatured

  const contractId = await getContractIdFromSlug(pg, slug)

  if (id) {
    await pg.none(
      'UPDATE tv_schedule SET contract_id = $1, stream_id = $2, source = $3, title = $4, start_time = $5, end_time = $6, is_featured = $7 WHERE id = $8',
      [contractId, streamId, source, title, startTime, endTime, isFeatured, id]
    )
    return { status: 'success' }
  }

  await pg.none(
    'INSERT INTO tv_schedule (creator_id, contract_id, stream_id, source, title, start_time, end_time, is_featured) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
    [
      auth.uid,
      contractId,
      streamId,
      source,
      title,
      startTime,
      endTime,
      isFeatured,
    ]
  )
  broadcastTVScheduleUpdate()

  return { status: 'success' }
})

const deleteSchema = z.object({
  id: z.string(),
})

export const deletetv = authEndpoint(async (req, auth) => {
  const { id } = validate(deleteSchema, req.body)
  const userId = auth.uid

  const pg = createSupabaseDirectClient()

  if (isAdminId(userId) || isModId(auth.uid)) {
    await pg.none('delete from tv_schedule where id = $1', [id])
  } else {
    await pg.none('delete from tv_schedule where id = $1 and creator_id = $2', [
      id,
      userId,
    ])
  }

  broadcastTVScheduleUpdate()
  return { status: 'success' }
})
