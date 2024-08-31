import { runScript } from './run-script'
import { log } from 'shared/monitoring/log'

runScript(async ({ pg }) => {
  try {
    // Step 1: Fetch the relevant transactions and sum amounts by contract
    const result = await pg.manyOrNone(`
      SELECT txns.to_id as contract_id, SUM(txns.amount) as total_amount
      FROM txns
      JOIN contracts ON contracts.id = txns.to_id
      WHERE txns.category = 'ADD_SUBSIDY'
      AND txns.created_time > '2024-07-31 17:16-07:00'
      AND contracts.outcome_type = 'MULTIPLE_CHOICE'
      GROUP BY txns.to_id
    `)

    log(`Found ${result.length} contracts with subsidies.`)

    // Step 2: Update the contracts table
    for (const row of result) {
      const { contract_id, total_amount } = row
      console.log('updating contract', contract_id, 'with amount', total_amount)
      await pg.none(
        `
        UPDATE contracts
        SET data = jsonb_set(data, '{subsidyPool}', $1::jsonb)
        WHERE id = $2
      `,
        [total_amount.toString(), contract_id]
      )

      log(
        `Updated contract ${contract_id} with subsidy pool amount ${total_amount}`
      )
    }

    log('Subsidy sum calculation completed successfully.')
  } catch (error) {
    console.error('Error during subsidy sum calculation:', error)
  }
})
