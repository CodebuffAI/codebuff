import {
  createSupabaseClient,
  createSupabaseDirectClient,
} from 'shared/supabase/init'
import { APIError, APIHandler } from '../helpers/endpoint'
import { createLoveShipNotification } from 'shared/create-love-notification'
import { log } from 'shared/utils'

export const shipLovers: APIHandler<'ship-lovers'> = async (props, auth) => {
  const { targetUserId1, targetUserId2, remove } = props
  const creatorId = auth.uid

  const db = createSupabaseClient()
  const pg = createSupabaseDirectClient()

  // Check if ship already exists or with swapped target IDs
  const existing = await pg.oneOrNone<{ ship_id: string }>(
    `
    select ship_id from love_ships
    where creator_id = $1
    and (
      target1_id = $2 and target2_id = $3
      or target1_id = $3 and target2_id = $2
    )
  `,
    [creatorId, targetUserId1, targetUserId2]
  )

  if (existing) {
    if (remove) {
      const { error } = await db
        .from('love_ships')
        .delete()
        .eq('ship_id', existing.ship_id)
      if (error) {
        throw new APIError(500, 'Failed to remove ship: ' + error.message)
      }
    } else {
      log('Ship already exists, do nothing')
    }
    return { status: 'success' }
  }

  // Insert the new ship
  const { data, error } = await db
    .from('love_ships')
    .insert({
      creator_id: creatorId,
      target1_id: targetUserId1,
      target2_id: targetUserId2,
    })
    .select()
    .single()

  if (error) {
    throw new APIError(500, 'Failed to create ship: ' + error.message)
  }

  const continuation = async () => {
    await Promise.all([
      createLoveShipNotification(data, data.target1_id),
      createLoveShipNotification(data, data.target2_id),
    ])
  }

  return {
    result: { status: 'success' },
    continue: continuation,
  }
}
