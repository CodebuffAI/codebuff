import { type APIHandler } from './helpers/endpoint'
import { updateUserInterestEmbedding } from 'shared/helpers/embeddings'
import { createSupabaseDirectClient } from 'shared/supabase/init'

export const updateUserEmbedding: APIHandler<'update-user-embedding'> = async (
  _,
  auth
) => {
  const pg = createSupabaseDirectClient()
  await updateUserInterestEmbedding(pg, auth.uid)
  return {
    success: true,
  }
}
