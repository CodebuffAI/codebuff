import { messagesWithSystem } from '@codebuff/agent-runtime/util/messages'
import { promptFlashWithFallbacks } from '@codebuff/backend/llm-apis/gemini-with-fallbacks'
import { promptAiSdk } from '@codebuff/backend/llm-apis/vercel-ai-sdk/ai-sdk'
import { getTracesWithoutRelabels, insertRelabel } from '@codebuff/bigquery'
import { models, TEST_USER_ID } from '@codebuff/common/old-constants'
import { generateCompactId } from '@codebuff/common/util/string'

import type { System } from '@codebuff/agent-runtime/llm-api/claude'
import type { GetRelevantFilesPayload } from '@codebuff/bigquery'
import type { Message } from '@codebuff/common/types/messages/codebuff-message'

// Models we want to test
const MODELS_TO_TEST = [
  /*models.gemini2_5_pro_exp,*/ models.openrouter_claude_sonnet_4,
] as const

const isProd = process.argv.includes('--prod')
const DATASET = isProd ? 'codebuff_data' : 'codebuff_data_dev'
const MAX_PARALLEL = 5 // Maximum number of traces to process in parallel

async function runTraces() {
  try {
    for (const model of MODELS_TO_TEST) {
      console.log(`\nProcessing traces for model ${model}...`)

      // Get the last 100 traces that don't have relabels for this model
      const traces = await getTracesWithoutRelabels(
        model,
        1000,
        undefined,
        DATASET,
      )

      console.log(
        `Found ${traces.length} get-relevant-files traces without relabels for model ${model}`,
      )

      // Process traces in batches of MAX_PARALLEL
      for (let i = 0; i < traces.length; i += MAX_PARALLEL) {
        const batch = traces.slice(i, i + MAX_PARALLEL)
        console.log(
          `Processing batch of ${batch.length} traces (${i + 1}-${Math.min(i + MAX_PARALLEL, traces.length)})`,
        )

        await Promise.all(
          batch.map(async (trace) => {
            console.log(`Processing trace ${trace.id}`)
            const payload = (
              typeof trace.payload === 'string'
                ? JSON.parse(trace.payload)
                : trace.payload
            ) as GetRelevantFilesPayload

            try {
              let output: string
              const messages = payload.messages
              const system = payload.system

              if (model.startsWith('claude')) {
                output = await promptAiSdk({
                  messages: messagesWithSystem({
                    messages: messages as Message[],
                    system: system as System,
                  }),
                  model: model as typeof models.openrouter_claude_sonnet_4,
                  clientSessionId: 'relabel-trace-run',
                  fingerprintId: 'relabel-trace-run',
                  userInputId: 'relabel-trace-run',
                  userId: TEST_USER_ID,
                  sendAction: () => {},
                  logger: console,
                })
              } else {
                output = await promptFlashWithFallbacks({
                  messages: messagesWithSystem({
                    messages: messages as Message[],
                    system: system as System,
                  }),
                  model:
                    model as typeof models.openrouter_gemini2_5_pro_preview,
                  clientSessionId: 'relabel-trace-run',
                  fingerprintId: 'relabel-trace-run',
                  userInputId: 'relabel-trace-run',
                  userId: 'relabel-trace-run',
                  logger: console,
                  sendAction: () => {},
                  promptAiSdk,
                })
              }

              // Create relabel record
              const relabel = {
                id: generateCompactId(),
                agent_step_id: trace.agent_step_id,
                user_id: trace.user_id,
                created_at: new Date(),
                model: model,
                payload: {
                  user_input_id: payload.user_input_id,
                  client_session_id: payload.client_session_id,
                  fingerprint_id: payload.fingerprint_id,
                  output: output,
                },
              }

              // Store the relabel
              try {
                await insertRelabel({
                  relabel,
                  dataset: DATASET,
                  logger: console,
                })
              } catch (error) {
                console.error(
                  `Error inserting relabel for trace ${trace.id}:`,
                  JSON.stringify(error, null, 2),
                )
              }

              console.log(`Successfully stored relabel for trace ${trace.id}`)
            } catch (error) {
              console.error(`Error processing trace ${trace.id}:`, error)
            }
          }),
        )

        console.log(`Completed batch of ${batch.length} traces`)
      }
    }
  } catch (error) {
    console.error('Error running traces:', error)
  }
}

// Run the script
runTraces()
