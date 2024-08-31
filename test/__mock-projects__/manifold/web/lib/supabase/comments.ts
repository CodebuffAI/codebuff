import { run } from 'common/supabase/utils'
import { db } from './db'
import { chunk } from 'lodash'
import { convertContractComment } from 'common/supabase/comments'

export async function getComment(commentId: string) {
  const res = await db
    .from('contract_comments')
    .select()
    .eq('comment_id', commentId)
    .single()

  if (res.error) {
    return null
  }

  return convertContractComment(res.data)
}

export async function getAllCommentRows(limit: number) {
  const { data } = await run(
    db
      .from('contract_comments')
      .select('*')
      .order('created_time', {
        ascending: false,
      })
      .limit(limit)
  )
  return data
}

export async function getCommentRows(contractId: string) {
  const { data } = await run(
    db
      .from('contract_comments')
      .select()
      .eq('contract_id', contractId)
      .order('created_time', { ascending: false })
  )
  return data
}
export async function getNewCommentRows(
  contractId: string,
  afterTime: string,
  userId?: string
) {
  let q = db
    .from('contract_comments')
    .select()
    .eq('contract_id', contractId)
    .gt('created_time', afterTime)
    .order('created_time', { ascending: false })

  if (userId) q = q.eq('user_id', userId)

  const { data } = await run(q)
  return data
}

export async function getRecentCommentsOnContracts(
  contractIds: string[],
  limit: number
) {
  const chunks = chunk(contractIds, 100)
  const rows = await Promise.all(
    chunks.map(async (ids: string[]) => {
      const { data } = await run(
        db
          .from('contract_comments')
          .select()
          .in('contract_id', ids)
          .limit(limit)
          .order('created_time', { ascending: false })
      )
      return data
    })
  )
  return rows.flat().map((r) => convertContractComment(r))
}

export async function getNumContractComments(contractId: string) {
  const { count } = await run(
    db
      .from('contract_comments')
      .select('*', { head: true, count: 'exact' })
      .eq('contract_id', contractId)
  )
  return count ?? 0
}
