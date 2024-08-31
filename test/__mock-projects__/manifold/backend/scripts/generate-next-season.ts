import { CURRENT_SEASON } from 'common/leagues'
import { runScript } from 'run-script'
import { generateNextSeason, insertBots } from 'shared/generate-leagues'

if (require.main === module) {
  runScript(async ({ pg }) => {
    const newSeason = 16
    if ((newSeason as any) <= CURRENT_SEASON) {
      console.log('Are you sure you want to generate the current season?')
      return
    }

    await generateNextSeason(pg, newSeason)
    await insertBots(pg, newSeason)
    console.log('Completed generateNextSeason.')
  })
}
