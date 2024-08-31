import { authEndpoint, validate } from './helpers/endpoint'
import { addContractToUserDisinterestEmbedding } from 'shared/helpers/embeddings'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { z } from 'zod'

const bodySchema = z
  .object({
    contractId: z.string(),
    creatorId: z.string(),
    feedId: z.number().optional(),
    removeContract: z.boolean().optional(),
  })
  .strict()

export const updateUserDisinterestEmbedding = authEndpoint(
  async (req, auth) => {
    const pg = createSupabaseDirectClient()
    const { contractId, creatorId, feedId, removeContract } = validate(
      bodySchema,
      req.body
    )

    await addContractToUserDisinterestEmbedding(
      pg,
      auth.uid,
      contractId,
      creatorId,
      feedId,
      removeContract
    )
    return { success: true }
  }
)
