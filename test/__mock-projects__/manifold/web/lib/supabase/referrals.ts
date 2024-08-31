import { run, selectFrom } from 'common/supabase/utils'
import { db } from 'web/lib/supabase/db'
import { User } from 'common/user'
export async function getReferrals(userId: string) {
  const fields: (keyof User)[] = ['id', 'name', 'username', 'avatarUrl']

  const query = selectFrom(db, 'users', ...fields).contains('data', {
    referredByUserId: userId,
  })

  return (await run(query)).data
}
