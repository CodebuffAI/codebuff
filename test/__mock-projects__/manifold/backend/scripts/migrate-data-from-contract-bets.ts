import { runScript } from 'run-script'
import { log } from 'shared/utils'
import { createSupabaseDirectClient } from 'shared/supabase/init'

if (require.main === module) {
  runScript(async () => {
    const pg = createSupabaseDirectClient()
    const startDate = new Date('2024-05-05')
    const endDate = new Date()
    const diff = 2
    while (startDate < endDate) {
      const periodStart = new Date(startDate)
      periodStart.setDate(periodStart.getDate() + diff)

      log(
        `Processing from ${startDate.toISOString()} to ${periodStart.toISOString()}`
      )

      await pg.task(async (t) => {
        await t.none(
          `update contract_bets
             set bet_id = bet_id
             where created_time >= $1
               and created_time < $2
          `,
          [startDate.toISOString(), periodStart.toISOString()]
        )
        log(
          `Converted from ${startDate.toISOString()} to ${periodStart.toISOString()}`
        )
      })

      startDate.setDate(startDate.getDate() + diff)
    }
  })
}
