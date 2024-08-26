import { createSupabaseClient } from 'shared/supabase/init'
import { APIError, APIHandler } from '../helpers/endpoint'
import { log } from 'shared/utils'

export const starLover: APIHandler<'star-lover'> = async (props, auth) => {
  const { targetUserId, remove } = props
  const creatorId = auth.uid

  const db = createSupabaseClient()

  if (remove) {
    const { error } = await db
      .from('love_stars')
      .delete()
      .eq('creator_id', creatorId)
      .eq('target_id', targetUserId)

    if (error) {
      throw new APIError(500, 'Failed to remove star: ' + error.message)
    }
    return { status: 'success' }
  }

  // Check if star already exists
  const existing = await db
    .from('love_stars')
    .select()
    .eq('creator_id', creatorId)
    .eq('target_id', targetUserId)

  if (existing.data?.length) {
    log('star already exists, do nothing')
    return { status: 'success' }
  }

  // Insert the new star
  const { error } = await db
    .from('love_stars')
    .insert({
      creator_id: creatorId,
      target_id: targetUserId,
    })
    .select()
    .single()

  if (error) {
    throw new APIError(500, 'Failed to add star: ' + error.message)
  }

  return { status: 'success' }
}
