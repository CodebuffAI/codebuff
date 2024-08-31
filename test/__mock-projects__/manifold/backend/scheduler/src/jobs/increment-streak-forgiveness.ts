import { createSupabaseDirectClient } from 'shared/supabase/init'
import { DAY_MS } from 'common/util/time'
import { log } from 'shared/utils'

const bulkUpdateUsersByChunk = async (
  pg: ReturnType<typeof createSupabaseDirectClient>,
  daysInterval: number
) => {
  const earliestUserResult = await pg.one(`
    select min(created_time) as earliest_time
    from users
  `)
  const earliestTime = earliestUserResult.earliest_time

  const now = new Date()
  let chunkStart = new Date(earliestTime)
  let chunkEnd = new Date(chunkStart.getTime() + daysInterval * DAY_MS)

  while (chunkStart < now) {
    await pg.none(
      `
      update users
      set data = data || jsonb_build_object('streakForgiveness', coalesce((data->>'streakForgiveness')::numeric, 0) + 1)
      where created_time >= $1 and created_time < $2
    `,
      [chunkStart.toISOString(), chunkEnd.toISOString()]
    )
    log(
      'Updated streak forgiveness for users created between',
      chunkStart,
      'and',
      chunkEnd
    )

    chunkStart = chunkEnd
    chunkEnd = new Date(chunkStart.getTime() + daysInterval * DAY_MS)
  }
}

export const incrementStreakForgiveness = async () => {
  const pg = createSupabaseDirectClient()
  await bulkUpdateUsersByChunk(pg, 15)
}
