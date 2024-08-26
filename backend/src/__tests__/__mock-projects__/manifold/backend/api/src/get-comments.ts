import { APIError, type APIHandler } from './helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { getContractFromSlugSupabase } from 'shared/utils'
import { getCommentsDirect } from 'shared/supabase/contract-comments'

export const getComments: APIHandler<'comments'> = async (props) => {
  const { userId, contractSlug } = props

  if (!props.contractId && !contractSlug && !userId) {
    throw new APIError(400, 'You must specify a contract or user')
  }
  const contractId =
    props.contractId ?? (await getContractFromSlugSupabase(contractSlug!))?.id
  const pg = createSupabaseDirectClient()

  return await getCommentsDirect(pg, {
    ...props,
    contractId,
  })
}
