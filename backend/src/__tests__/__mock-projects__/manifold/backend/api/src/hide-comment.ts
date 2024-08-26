import { isAdminId, isModId } from 'common/envs/constants'
import { getContract, revalidateContractStaticProps } from 'shared/utils'
import { getComment } from 'shared/supabase/contract-comments'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { updateData } from 'shared/supabase/utils'
import { APIError, type APIHandler } from './helpers/endpoint'

export const hideComment: APIHandler<'hide-comment'> = async (
  { commentPath },
  auth
) => {
  // Comment path is of the form /[username]/[contractId]/comment/[commentId] because firebase
  const [, contractId, , commentId] = commentPath.split('/')
  if (!contractId || !commentId) {
    throw new APIError(
      400,
      'Invalid comment path. If you can read this, tell sinclair to change this endpoint to have more sensible inputs'
    )
  }

  const pg = createSupabaseDirectClient()

  const contract = await getContract(pg, contractId)
  if (!contract) throw new APIError(404, 'Contract not found')

  const isContractCreator = contract.creatorId === auth.uid

  if (!isAdminId(auth.uid) && !isContractCreator && !isModId(auth.uid)) {
    throw new APIError(
      403,
      'Only the market creator or mod can hide/unhide comments'
    )
  }

  const comment = await getComment(pg, commentId)

  // update the comment
  await updateData(pg, 'contract_comments', 'comment_id', {
    comment_id: commentId,
    hidden: !comment.hidden,
    hiddenTime: Date.now(),
    hiderId: auth.uid,
  })

  await revalidateContractStaticProps(contract)
}
