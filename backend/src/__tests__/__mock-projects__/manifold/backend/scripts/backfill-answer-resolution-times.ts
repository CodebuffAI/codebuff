import { runScript } from 'run-script'
import { tsToMillis } from 'common/supabase/utils'
import { removeUndefinedProps } from 'common/util/object'
import { SafeBulkWriter } from 'shared/safe-bulk-writer'
import { log } from 'shared/monitoring/log'

if (require.main === module) {
  runScript(async ({ firestore, pg }) => {
    const resolvedAnswers = await pg.map(
      `select answers.id, answers.contract_id, contracts.resolution_time, contracts.data->>'resolverId' as resolver_id from answers
             join contracts on answers.contract_id = contracts.id
         where resolution_time is not null
         and answers.data->>'resolutionTime' is null
         and mechanism = 'cpmm-multi-1'
      `,
      [],
      (row) => ({
        id: row.id as string,
        resolutionTime: tsToMillis(row.resolution_time),
        contractId: row.contract_id as string,
        resolverId: row.resolver_id ? (row.resolver_id as string) : undefined,
      })
    )
    const toUpdate = resolvedAnswers.length
    let total = 0
    const writer = new SafeBulkWriter(undefined, firestore)
    for (const answer of resolvedAnswers) {
      writer.update(
        firestore.doc(
          `contracts/${answer.contractId}/answersCpmm/${answer.id}`
        ),
        removeUndefinedProps({
          resolutionTime: answer.resolutionTime,
          resolverId: answer.resolverId,
        })
      )
      total++
      console.log(`Updated ${total}/${toUpdate} answers`)
    }
    await writer
      .close()
      .catch((e) => log.error('Error bulk writing answer updates', e))
      .then(() => log('Committed Firestore writes.'))
  })
}
