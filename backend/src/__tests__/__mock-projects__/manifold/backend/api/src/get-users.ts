import { toUserAPIResponse } from 'common/api/user-types'
import { run } from 'common/supabase/utils'
import { User } from 'common/user'
import { createSupabaseClient } from 'shared/supabase/init'
import { APIError, type APIHandler } from './helpers/endpoint'

export const getUsers: APIHandler<'users'> = async ({ limit, before }) => {
  const db = createSupabaseClient()

  const q = db
    .from('users')
    .select('data')
    .limit(limit)
    .order('created_time', { ascending: false })

  if (before) {
    const { data, error } = await db
      .from('users')
      .select('created_time')
      .eq('id', before)
      .single()
    if (error) throw new APIError(404, `Could not find user with id: ${before}`)
    q.lt('created_time', data.created_time)
  }

  const { data } = await run(q)
  return data.map((data) => toUserAPIResponse(data.data as unknown as User))
}
