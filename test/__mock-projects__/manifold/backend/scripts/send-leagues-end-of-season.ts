import { CURRENT_SEASON } from 'common/leagues'
import { runScript } from 'run-script'
import { sendEndOfSeasonNotificationsAndBonuses } from 'shared/payout-leagues'

if (require.main === module) {
  runScript(async ({ pg }) => {
    const prevSeason = 15
    if (prevSeason !== CURRENT_SEASON - 1) {
      console.log(
        'Are you sure you want to send notifications & bonuses for this season?'
      )
      return
    }

    await sendEndOfSeasonNotificationsAndBonuses(pg, prevSeason)
    console.log('Completed send end of season notification and bonuses')
  })
}
