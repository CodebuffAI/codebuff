import { getRecentRelabels, setupBigQuery } from '@codebuff/bigquery'

// Parse command line arguments to check for --prod flag
const isProd = process.argv.includes('--prod')
const DATASET = isProd ? 'codebuff_data' : 'codebuff_data_dev'

async function printRecentRelabels() {
  try {
    await setupBigQuery(DATASET)
    // Use the BigQuery client to get recent relabels
    const relabels = await getRecentRelabels(10, DATASET)

    console.log('\nLast 10 relabels by timestamp:')
    console.log('--------------------------------')
    console.log(`Using dataset: ${DATASET}`)
    console.log('--------------------------------')

    relabels.forEach((relabel) => {
      console.log(`
ID: ${relabel.id}
User ID: ${relabel.user_id}
Agent Step ID: ${relabel.agent_step_id}
Created at: ${JSON.stringify(relabel.created_at)}
Payload: ${JSON.stringify(relabel.payload).slice(0, 100)}...
--------------------------------`)
    })
  } catch (error) {
    console.error('Error fetching relabels:', error)
  }
}

// Run the function
printRecentRelabels()
