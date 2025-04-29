import { getRecentTraces } from '@codebuff/bigquery'

// Parse command line arguments to check for --prod flag
const isProd = process.argv.includes('--prod')
const DATASET = isProd ? 'codebuff_data' : 'codebuff_data_dev'

async function printRecentTraces() {
  try {
    // Use the BigQuery client to get recent traces
    const traces = await getRecentTraces(10, DATASET)

    console.log('\nLast 10 traces by timestamp:')
    console.log('--------------------------------')
    console.log(`Using dataset: ${DATASET}`)
    console.log('--------------------------------')

    traces.forEach((trace) => {
      console.log(`
ID: ${trace.id}
User ID: ${trace.user_id}
Agent Step ID: ${trace.agent_step_id}
Type: ${trace.type}
Created at: ${JSON.stringify(trace.created_at)}
Payload: ${JSON.stringify(trace.payload, null, 2).slice(0, 100)}...
--------------------------------`)
    })
  } catch (error) {
    console.error('Error fetching traces:', error)
  }
}

// Run the function
printRecentTraces()
