import { runScript } from 'run-script'
import { calculateImportanceScore } from 'shared/importance-score'

if (require.main === module) {
  runScript(async ({ db, pg }) => {
    const readOnly = true
    const rescoreAll = true
    await calculateImportanceScore(db, pg, readOnly, rescoreAll)
  })
}
