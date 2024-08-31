import { createSupabaseDirectClient } from 'shared/supabase/init'

export async function resetWeeklyEmailsFlags() {
  const pg = createSupabaseDirectClient()
  await pg.none(
    'update private_users set weekly_portfolio_email_sent = false, weekly_trending_email_sent = false'
  )
}
