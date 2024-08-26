import { runScript } from './run-script'
import { log, revalidateStaticProps } from 'shared/utils'
import { saveCalibrationData } from 'shared/calculate-calibration'
import { updateStatsBetween } from '../scheduler/src/jobs/update-stats'

if (require.main === module)
  runScript(async ({ pg }) => {
    // get dates from cli
    if (process.argv.length < 4) {
      log('Usage: yarn update-stats <start> <end>')
      process.exit(1)
    }

    const start = process.argv[2]
    const end = process.argv[3]

    if (!dateregex.test(start) || !dateregex.test(end)) {
      log.error('Invalid date format, should be YYYY-MM-DD')
      process.exit(1)
    }

    await updateStatsBetween(pg, start, end)
    await saveCalibrationData(pg)
    await revalidateStaticProps('/stats')

    // note does not update mana stats. if you want that please add the call to this script
  })

const dateregex = /^\d{4}-\d{2}-\d{2}$/
