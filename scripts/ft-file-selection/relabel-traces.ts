import { promptGeminiWithFallbacks } from 'backend/llm-apis/gemini-with-fallbacks'
import { GetRelevantFilesPayload } from 'common/bigquery/schema'
import { claudeModels, models } from 'common/constants'
import { BigQueryClient } from 'common/src/bigquery/client'
import { Message } from 'common/types/message'
import { generateCompactId } from 'common/util/string'

import { promptClaude, System } from '../../backend/src/llm-apis/claude'

// Models we want to test
const MODELS_TO_TEST = [models.gemini2_5_pro_exp, claudeModels.sonnet] as const

const isProd = process.argv.includes('--prod')
const DATASET = isProd ? 'codebuff_data' : 'codebuff_data_dev'

async function runTraces() {
  try {
    for (const model of MODELS_TO_TEST) {
      console.log(`\nProcessing traces for model ${model}...`)
      const bigquery = new BigQueryClient(DATASET)
      await bigquery.initialize()

      // Get the last 100 traces that don't have relabels for this model
      const traces = await bigquery.getTracesWithoutRelabels(model, 100)

      console.log(
        `Found ${traces.length} get-relevant-files traces without relabels for model ${model}`
      )

      for (const trace of traces) {
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

          console.log('messages', messages)
          console.log('system', system)
          if (model.startsWith('claude')) {
            output = await promptClaude(messages as Message[], {
              system: system as System,
              model: model as typeof claudeModels.sonnet,
              clientSessionId: 'relabel-trace-run',
              fingerprintId: 'relabel-trace-run',
              userInputId: 'relabel-trace-run',
              ignoreDatabaseAndHelicone: true,
            })
          } else {
            output = await promptGeminiWithFallbacks(
              messages as Message[],
              system as System,
              {
                model: model as typeof models.gemini2_5_pro_exp,
                clientSessionId: 'relabel-trace-run',
                fingerprintId: 'relabel-trace-run',
                userInputId: 'relabel-trace-run',
                userId: 'relabel-trace-run',
              }
            )
          }

          // Create relabel record
          const relabel = {
            id: generateCompactId(),
            agentStepId: trace.agentStepId,
            userId: trace.userId,
            createdAt: new Date(),
            model: model,
            payload: {
              userInputId: payload.userInputId,
              clientSessionId: payload.clientSessionId,
              fingerprintId: payload.fingerprintId,
              output: output,
            },
          }

          // Store the relabel
          try {
            const res = await bigquery.insertRelabel(relabel)
            console.log('res', JSON.stringify(res, null, 2))
          } catch (error) {
            console.error(
              `Error inserting relabel for trace ${trace.id}:`,
              JSON.stringify(error, null, 2)
            )
          }

          console.log(`Successfully stored relabel for trace ${trace.id}`)
        } catch (error) {
          console.error(`Error processing trace ${trace.id}:`, error)
        }
      }
    }
  } catch (error) {
    console.error('Error running traces:', error)
  }
}

// Run the script
runTraces()
