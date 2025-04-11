import db from 'common/db'
import { ft_filepicker_traces } from 'common/db/schema'
import { desc } from 'drizzle-orm'

async function getRecentTraces() {
  try {
    const traces = await db
      .select({
        id: ft_filepicker_traces.id,
        capture_id: ft_filepicker_traces.captureId,
        model: ft_filepicker_traces.model,
        output: ft_filepicker_traces.output,
        timestamp: ft_filepicker_traces.timestamp,
      })
      .from(ft_filepicker_traces)
      .orderBy(desc(ft_filepicker_traces.timestamp))
      .limit(10)

    console.log('\nLast 10 traces by timestamp:')
    console.log('--------------------------------')

    traces.forEach((trace) => {
      console.log(`
ID: ${trace.id}
Capture ID: ${trace.capture_id}
Model: ${trace.model}
Created at: ${trace.timestamp}
Output: ${trace.output}
--------------------------------`)
    })
  } catch (error) {
    console.error('Error fetching traces:', error)
  }
}

// Run the function
getRecentTraces()
