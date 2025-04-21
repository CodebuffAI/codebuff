import { BigQueryClient } from 'common/src/bigquery/client'

// Parse command line arguments to check for --prod flag
const isProd = process.argv.includes('--prod')
const DATASET = isProd ? 'codebuff_data' : 'codebuff_data_dev'

async function getRecentTraces() {
  try {
    // Use the BigQuery client to get recent traces
    const bigquery = new BigQueryClient(DATASET)
    await bigquery.initialize()
    const traces = await bigquery.getRecentTraces(10)

    console.log('\nLast 10 traces by timestamp:')
    console.log('--------------------------------')
    console.log(`Using dataset: ${DATASET}`)
    console.log('--------------------------------')

    traces.forEach((trace) => {
      console.log(`
ID: ${trace.id}
User ID: ${trace.userId}
Agent Step ID: ${trace.agentStepId}
Type: ${trace.type}
Created at: ${JSON.stringify(trace.createdAt)}
Payload: ${JSON.stringify(trace.payload, null, 2).slice(0, 100)}...
--------------------------------`)
    })
  } catch (error) {
    console.error('Error fetching traces:', error)
  }
}

// Run the function
getRecentTraces()
