import { runScript } from 'run-script'
import { denormalizeContractAnswers } from 'functions/scheduled/denormalize-answers'
import { chunk } from 'lodash'
import { DAY_MS } from 'common/util/time'

if (require.main === module) {
  runScript(async ({ db, pg }) => {
    // await denormalizeContractAnswers(db, ['ieywZhEmvi6ynaFSywX5'])
    // Fetch answers modified since we broke denormalization
    const timeAgo = new Date(Date.now() - 2 * DAY_MS)
    const contractIds = await pg.map(
      `
        select id from contracts
        where last_updated_time > $1
        and mechanism = 'cpmm-multi-1'
        `,
      [timeAgo.toISOString()],
      (r) => r.id as string
    )
    console.log('Denormalizing answers for contracts: ', contractIds)

    const contractIdChunks = chunk(contractIds, 20)
    for (const contractIdChunk of contractIdChunks) {
      await denormalizeContractAnswers(db, contractIdChunk)
    }

    console.log('Done.')
  })
}
