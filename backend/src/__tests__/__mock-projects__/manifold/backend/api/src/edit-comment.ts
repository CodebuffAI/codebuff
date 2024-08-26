import { APIError, authEndpoint, validate } from 'api/helpers/endpoint'
import { z } from 'zod'
import { validateComment } from 'api/create-comment'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { contentSchema } from 'common/api/zod-types'
import { isAdminId } from 'common/envs/constants'
import { revalidateStaticProps } from 'shared/utils'
import { contractPath } from 'common/contract'
import { getComment } from 'shared/supabase/contract-comments'
import { updateData } from 'shared/supabase/utils'

const editSchema = z
  .object({
    contractId: z.string(),
    commentId: z.string(),
    content: contentSchema.optional(),
    html: z.string().optional(),
    markdown: z.string().optional(),
  })
  .strict()
export const editcomment = authEndpoint(async (req, auth) => {
  const { commentId, contractId, content, html, markdown } = validate(
    editSchema,
    req.body
  )
  const {
    you: editor,
    contract,
    contentJson,
  } = await validateComment(contractId, auth.uid, content, html, markdown)

  const pg = createSupabaseDirectClient()
  const comment = await getComment(pg, commentId)

  if (editor.id !== comment.userId && !isAdminId(editor.id))
    throw new APIError(403, 'User is not the creator of the comment.')

  await updateData(pg, 'contract_comments', 'comment_id', {
    comment_id: commentId,
    content: contentJson,
    editedTime: Date.now(),
  })
  await pg.none(
    `
    insert into contract_comment_edits (contract_id, editor_id, comment_id, data)
    values ($1, $2, $3, $4)
    `,
    [contract.id, editor.id, comment.id, comment]
  )
  await revalidateStaticProps(contractPath(contract))

  return { success: true }
})
