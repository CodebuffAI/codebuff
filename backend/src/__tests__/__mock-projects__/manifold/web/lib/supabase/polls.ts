import { run } from 'common/supabase/utils'
import { db } from './db'
import { User } from 'common/user'

export async function getUserVote(
  contractId: string,
  userId: string
): Promise<string | null> {
  const { data } = await run(
    db
      .from('votes')
      .select('id')
      .eq('contract_id', contractId)
      .eq('user_id', userId)
  )
  if (data.length > 0) {
    return data[0].id
  } else {
    return null
  }
}

export async function getContractVoters(contractId: string) {
  const { data } = await db.rpc('get_contract_voters', {
    this_contract_id: contractId,
  })
  if (data && data.length > 0) {
    return data.map((d) => d.data as User)
  }
  return []
}

export async function getOptionVoters(contractId: string, optionId: string) {
  const { data } = await db.rpc('get_option_voters', {
    this_contract_id: contractId,
    this_option_id: optionId,
  })
  if (data && data.length > 0) {
    return data.map((d) => d.data as User)
  }
  return []
}
