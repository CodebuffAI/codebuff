import { createSupabaseClient } from 'shared/supabase/init'
import { APIError, APIHandler } from './helpers/endpoint'
import { millisToTs } from 'common/supabase/utils'
import { isAdminId } from 'common/envs/constants'

export const createManalink: APIHandler<'manalink'> = async (props, auth) => {
  const { amount, expiresTime, maxUses, message } = props
  if (!isAdminId(auth.uid)) {
    throw new APIError(
      403,
      `User ${auth.uid} must be an admin to perform this action.`
    )
  }
  const db = createSupabaseClient()
  const { data, error } = await db
    .from('manalinks')
    .insert({
      amount,
      creator_id: auth.uid,
      max_uses: maxUses,
      expires_time: expiresTime ? millisToTs(expiresTime) : undefined,
      message,
    })
    .select('id')
    .single()

  if (error)
    throw new APIError(500, 'failed to create manalink: ' + error.message)

  return { slug: data.id }
}
