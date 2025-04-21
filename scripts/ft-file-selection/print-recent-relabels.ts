import { BigQueryClient } from 'common/src/bigquery/client'

// Parse command line arguments to check for --prod flag
const isProd = process.argv.includes('--prod')
const DATASET = isProd ? 'codebuff_data' : 'codebuff_data_dev'

async function getRecentRelabels() {
  try {
    // Use the BigQuery client to get recent relabels
    const bigquery = new BigQueryClient(DATASET)
    await bigquery.initialize()
    const relabels = await bigquery.getRecentRelabels(10)

    console.log('\nLast 10 relabels by timestamp:')
    console.log('--------------------------------')
    console.log(`Using dataset: ${DATASET}`)
    console.log('--------------------------------')

    relabels.forEach((relabel) => {
      console.log(`
ID: ${relabel.id}
User ID: ${relabel.userId}
Agent Step ID: ${relabel.agentStepId}
Created at: ${JSON.stringify(relabel.createdAt)}
Payload: ${JSON.stringify(relabel.payload).slice(0, 100)}...
--------------------------------`)
    })
  } catch (error) {
    console.error('Error fetching relabels:', error)
  }
}

// Run the function
getRecentRelabels()
