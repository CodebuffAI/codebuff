import { runScript } from './run-script'
import { autoAwardBounty } from 'scheduler/jobs/auto-award-bounty'

if (require.main === module) {
  runScript(async () => {
    await autoAwardBounty()
  })
}
