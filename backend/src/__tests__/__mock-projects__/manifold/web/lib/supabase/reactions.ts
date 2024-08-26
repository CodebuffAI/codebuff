import { run } from 'common/supabase/utils'
import { db } from 'web/lib/supabase/db'
import { api } from '../api/api'
import { ReactionContentTypes } from 'common/reaction'

export const unLike = async (
  contentId: string,
  contentType: ReactionContentTypes
) => {
  api('react', {
    remove: true,
    contentId,
    contentType,
  })
}

export const like = async (
  contentId: string,
  contentType: ReactionContentTypes
) => {
  api('react', {
    remove: false,
    contentId,
    contentType,
  })
}

export async function getLikedContracts(userId: string) {
  // TODO: The best way to do this would be to join the matching table via contentId and type

  const reacts = await run(
    db
      .from('user_reactions')
      .select('reaction_id, content_id, created_time')
      .eq('content_type', 'contract')
      .eq('user_id', userId)
      .order('created_time', { ascending: false })
      .limit(1000)
  )

  const contracts = await run(
    db
      .from('contracts')
      .select('id, question, slug')
      .in(
        'id',
        reacts.data.map((r) => r.content_id)
      )
  )

  return contracts.data
}

export async function getLikedContractsCount(userId: string) {
  const { count } = await run(
    db
      .from('user_reactions')
      .select('*', { head: true, count: 'exact' })
      .eq('user_id', userId)
      .eq('content_type', 'contract')
  )
  return count
}
