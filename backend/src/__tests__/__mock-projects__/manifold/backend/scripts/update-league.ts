import { runScript } from 'run-script'
import { updateLeague } from 'scheduler/jobs/update-league'

if (require.main === module) {
  runScript(async () => {
    await updateLeague()
  })
}
