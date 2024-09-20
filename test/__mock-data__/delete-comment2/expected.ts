import { createSupabaseDirectClient } from 'shared/supabase/init'
import { APIError, type APIHandler } from './helpers/endpoint'
import { getComment } from 'shared/supabase/contract-comments'
import { getContract, revalidateContractStaticProps } from 'shared/utils'
import { isAdminId, isModId } from 'common/envs/constants'

export const deleteComment: APIHandler<'delete-comment'> = async (
  { commentId },
  auth
) => {
  const pg = createSupabaseDirectClient()

  const comment = await getComment(pg, commentId)
  if (!comment) {
    throw new APIError(404, 'Comment not found')
  }

  const contract = await getContract(pg, comment.contractId)
  if (!contract) {
    throw new APIError(404, 'Contract not found')
  }

  const isContractCreator = contract.creatorId === auth.uid
  const isCommentCreator = comment.userId === auth.uid

  if (!isAdminId(auth.uid) && !isContractCreator && !isCommentCreator && !isModId(auth.uid)) {
    throw new APIError(403, 'You do not have permission to delete this comment')
  }

  await pg.none(`DELETE FROM contract_comments WHERE comment_id = $1`, [commentId])

  await revalidateContractStaticProps(contract)

  return { success: true }
}
