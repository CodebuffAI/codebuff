import {
  GetExpandedFileContextForTrainingBlobTrace,
  GetRelevantFilesPayload,
  getTracesAndAllDataForUser,
  setupBigQuery,
} from '@codebuff/bigquery'
import { claudeModels } from 'common/constants'
import { relabelWithClaudeWithFullFileContext } from '../../backend/src/admin/relabelRuns'

// Model we want to test - focusing on Claude 4 Opus
const MODEL_TO_TEST = claudeModels.opus4

const isProd = process.argv.includes('--prod')
const DATASET = isProd ? 'codebuff_data' : 'codebuff_data_dev'
const MAX_PARALLEL = 2 // Maximum number of traces to process in parallel
const LIMIT = 3000
const PAGE_SIZE = 30
const START_CURSOR = '2025-05-27T00:00:00.000Z' // only helpful if you quit midway thru

async function runTraces() {
  await setupBigQuery(DATASET)
  try {
    console.log(
      `\nProcessing traces for model ${MODEL_TO_TEST} with full file context...`
    )
    let cursor: string | undefined = START_CURSOR

    for (let i = 0; i < LIMIT; i += PAGE_SIZE) {
      // Get traces and all related data
      const tracesBundles = await getTracesAndAllDataForUser(
        undefined,
        PAGE_SIZE,
        cursor,
        DATASET
      )

      console.log(
        `Found ${tracesBundles.length} trace bundles in page... (${i + 1}-${Math.min(i + PAGE_SIZE, LIMIT)})`
      )

      // Filter for traces that need relabeling
      const tracesToProcess = tracesBundles.filter((bundle) => {
        const trace = bundle.trace
        const files = bundle.relatedTraces.find(
          (t) =>
            t.type === 'get-expanded-file-context-for-training' &&
            (t.payload as GetRelevantFilesPayload)
        )
        const fileBlobs = bundle.relatedTraces.find(
          (t) => t.type === 'get-expanded-file-context-for-training-blobs'
        ) as GetExpandedFileContextForTrainingBlobTrace

        // Check if we already have a relabel for this model
        const hasRelabel = bundle.relabels.some(
          (r) => r.model === `${MODEL_TO_TEST}-with-full-file-context-new`
        )

        // console.log(
        //   'Trace has relabels:',
        //   hasRelabel,
        //   bundle.relabels.map((r) => r.id + ' ' + r.model),
        //   bundle.relabels,
        //   trace.agent_step_id
        // )

        return files && fileBlobs && !hasRelabel
      })

      // return

      console.log(
        `Found ${tracesToProcess.length} traces that need relabeling with full file context for model ${MODEL_TO_TEST}`
      )

      // Process traces in batches of MAX_PARALLEL
      for (let j = 0; j < tracesToProcess.length; j += MAX_PARALLEL) {
        const batch = tracesToProcess.slice(j, j + MAX_PARALLEL)
        console.log(
          `Processing batch of ${batch.length} traces (${j + 1}-${Math.min(j + MAX_PARALLEL, tracesToProcess.length)})`
        )

        await Promise.all(
          batch.map(async (bundle) => {
            const trace = bundle.trace
            const fileBlobs = bundle.relatedTraces.find(
              (t) => t.type === 'get-expanded-file-context-for-training-blobs'
            ) as GetExpandedFileContextForTrainingBlobTrace

            console.log(`Processing trace ${trace.id}`)

            try {
              await relabelWithClaudeWithFullFileContext(
                trace,
                fileBlobs,
                MODEL_TO_TEST,
                DATASET
              )
              console.log(`Successfully stored relabel for trace ${trace.id}`)
            } catch (error) {
              console.error(`Error processing trace ${trace.id}:`, error)
            }
          })
        )

        console.log(`Completed batch of ${batch.length} traces`)
      }

      const timestamp = (
        tracesBundles[tracesBundles.length - 1].trace.created_at as unknown as {
          value: string
        }
      ).value

      cursor = timestamp
    }
  } catch (error) {
    console.error('Error running traces:', error)
  }
}

// Run the script
runTraces()
