import { getTracesAndRelabelsForUser, setupBigQuery } from '@codebuff/internal/bigquery'
import { logger } from 'common/src/util/logger'
import { gradeRun } from '../../backend/src/admin/grade-runs'

// Parse command line arguments to check for --prod flag
const isProd = process.argv.includes('--prod')
const DATASET = isProd ? 'codebuff_data' : 'codebuff_data_dev'
const MAX_PARALLEL = 1 // Maximum number of traces to process in parallel

async function gradeTraces() {
  try {
    // Initialize BigQuery
    await setupBigQuery(DATASET)

    console.log(`\nGrading traces from dataset: ${DATASET}`)

    // Get traces with their relabels
    const unfilteredTracesAndRelabels = await getTracesAndRelabelsForUser(
      undefined,
      1000,
      undefined,
      DATASET,
      'INNER'
    )

    const tracesAndRelabels = unfilteredTracesAndRelabels
      .filter((traceAndRelabels) => traceAndRelabels.relabels.length > 0)
      .slice(0, 1)

    console.log(`Found ${tracesAndRelabels.length} traces to grade`)

    // Process traces in batches of MAX_PARALLEL
    for (let i = 0; i < tracesAndRelabels.length; i += MAX_PARALLEL) {
      const batch = tracesAndRelabels.slice(i, i + MAX_PARALLEL)
      console.log(
        `Processing batch of ${batch.length} traces (${i + 1}-${Math.min(
          i + MAX_PARALLEL,
          tracesAndRelabels.length
        )})`
      )

      // Process each trace in the batch in parallel
      const results = await Promise.all(
        batch.map(async (traceAndRelabels) => {
          try {
            console.log(`Grading trace ${traceAndRelabels.trace.id}`)
            const result = await gradeRun(traceAndRelabels)
            return {
              traceId: traceAndRelabels.trace.id,
              status: 'success',
              result,
            }
          } catch (error) {
            logger.error(
              `Error grading trace ${traceAndRelabels.trace.id}:`,
              error
            )
            return {
              traceId: traceAndRelabels.trace.id,
              status: 'error',
              error: error instanceof Error ? error.message : 'Unknown error',
            }
          }
        })
      )

      // Log results for this batch
      results.forEach((result) => {
        if (result.status === 'success') {
          console.log(`Successfully graded trace ${result.traceId}:`)
          console.log(result.result)
        } else {
          console.error(
            `Failed to grade trace ${result.traceId}:`,
            result.error
          )
        }
      })

      console.log(`Completed batch of ${batch.length} traces`)
    }
  } catch (error) {
    console.error('Error running trace grading:', error)
    process.exit(1)
  }
}

// Run the script
gradeTraces()
