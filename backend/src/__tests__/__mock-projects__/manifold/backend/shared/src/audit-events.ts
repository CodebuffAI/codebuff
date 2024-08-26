import { createSupabaseDirectClient } from 'shared/supabase/init'
import { tryOrLogError } from 'shared/helpers/try-or-log-error'

export const trackAuditEvent = async (
  userId: string,
  name: string,
  contractId?: string,
  commentId?: string,
  otherProps?: Record<string, any>
) => {
  const pg = createSupabaseDirectClient()
  return await tryOrLogError(
    pg.none(
      `insert into audit_events (name,user_id, contract_id, comment_id, data) 
                values ($1, $2, $3, $4, $5) on conflict do nothing`,
      [name, userId, contractId, commentId, otherProps]
    )
  )
}
