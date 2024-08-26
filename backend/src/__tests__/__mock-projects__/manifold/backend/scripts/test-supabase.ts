import { runScript } from 'run-script'
import { updateLeagueCore } from 'functions/scheduled/update-league'

if (require.main === module) {
  runScript(async ({ pg }) => {
    // James prod user id
    // const userId = '5LZ4LgYuySdL1huCWe7bti02ghx2'
    // James dev user id
    // const userId = 'pfKxvtgSEua5DxoIfiPXxR4fAWd2'
    // console.log(await updateCardViewEmbedding(pg, userId))

    // await updateUsersCardViewEmbeddings(pg)
    // console.log('Completed updateUsersCardViewEmbeddings')

    // await addUserToLeague(pg, 'abc', 1, 1)
    await updateLeagueCore()
    // await getLeagueActivity(pg, 1, 'Oracular-Pythias')
    // await updateLeagueRanksCore()
  })
}
