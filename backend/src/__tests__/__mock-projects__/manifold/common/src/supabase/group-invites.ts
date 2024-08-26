import { run, SupabaseClient } from 'common/supabase/utils'

export async function getInvite(inviteId: string, db: SupabaseClient) {
  const { data: invite } = await run(
    db.from('group_invites').select('*').eq('id', inviteId).limit(1)
  )

  if (invite && invite.length > 0) {
    return invite[0]
  }
  return null
}
