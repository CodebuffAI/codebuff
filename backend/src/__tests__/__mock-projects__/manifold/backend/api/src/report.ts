import { z } from 'zod'
import type { ReportProps } from 'common/src/report'
import { APIError, authEndpoint, validate } from './helpers/endpoint'
import { createSupabaseClient } from 'shared/supabase/init'

const schema: z.ZodSchema<ReportProps> = z
  .object({
    contentOwnerId: z.string(),
    contentType: z.enum(['user', 'comment', 'contract']),
    contentId: z.string(),
    description: z.string().optional(),
    parentId: z.string().optional(),
    parentType: z.enum(['contract', 'post']).optional(),
  })
  .strict()

// abusable: people can report the wrong person, that didn't write the comment
// but in practice we check it manually and nothing bad happens to them automatically
export const report = authEndpoint(async (req, auth) => {
  const {
    contentOwnerId,
    contentType,
    contentId,
    description,
    parentId,
    parentType,
  } = validate(schema, req.body)

  const db = createSupabaseClient()

  const result = await db.from('reports').insert({
    user_id: auth.uid,
    content_owner_id: contentOwnerId,
    content_type: contentType,
    content_id: contentId,
    description,
    parent_id: parentId,
    parent_type: parentType,
  })

  if (result.error) {
    throw new APIError(500, 'Failed to create report: ' + result.error.message)
  }

  return { success: true }
})
