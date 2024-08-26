import { z } from 'zod'
import { APIError, authEndpoint, validate } from 'api/helpers/endpoint'
import {
  createSupabaseClient,
  createSupabaseDirectClient,
} from 'shared/supabase/init'
import { baseLoversSchema } from 'api/love/create-lover'
import { removePinnedUrlFromPhotoUrls } from 'shared/love/parse-photos'
import { contentSchema } from 'common/api/zod-types'
import { log } from 'shared/utils'
import { updateUser } from 'shared/supabase/users'

const optionalLoversSchema = z.object({
  political_beliefs: z.array(z.string()).optional(),
  religious_belief_strength: z.number().optional(),
  religious_beliefs: z.string().optional(),
  ethnicity: z.array(z.string()).optional(),
  born_in_location: z.string().optional(),
  height_in_inches: z.number().optional(),
  has_pets: z.boolean().optional(),
  education_level: z.string().optional(),
  last_online_time: z.string().optional(),
  is_smoker: z.boolean().optional(),
  drinks_per_month: z.number().min(0).optional(),
  is_vegetarian_or_vegan: z.boolean().optional(),
  has_kids: z.number().min(0).optional(),
  university: z.string().optional(),
  occupation_title: z.string().optional(),
  occupation: z.string().optional(),
  company: z.string().optional(),
  comments_enabled: z.boolean().optional(),
  website: z.string().optional(),
  bio: contentSchema.optional().nullable(),
  twitter: z.string().optional(),
  avatar_url: z.string().optional(),
})
// TODO: make strict
const combinedLoveUsersSchema = baseLoversSchema.merge(optionalLoversSchema)

export const updatelover = authEndpoint(async (req, auth) => {
  const parsedBody = validate(combinedLoveUsersSchema, req.body)
  log('parsedBody', parsedBody)
  const db = createSupabaseClient()
  const pg = createSupabaseDirectClient()
  const { data: existingLover } = await db
    .from('lovers')
    .select('id')
    .eq('user_id', auth.uid)
    .single()
  if (!existingLover) {
    throw new APIError(400, 'Lover not found')
  }
  !parsedBody.last_online_time &&
    log('Updating lover', { userId: auth.uid, parsedBody })

  await removePinnedUrlFromPhotoUrls(parsedBody)
  if (parsedBody.avatar_url) {
    await updateUser(pg, auth.uid, { avatarUrl: parsedBody.avatar_url })
  }

  const { data, error } = await db
    .from('lovers')
    .update({
      ...parsedBody,
      user_id: auth.uid,
    })
    .eq('id', existingLover.id)
    .select()
  if (error) {
    log('Error updating lover', error)
    throw new APIError(500, 'Error updating lover')
  }
  return {
    success: true,
    lover: data[0],
  }
})
