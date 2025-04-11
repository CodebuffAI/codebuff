import { claudeModels, models } from 'common/constants'
import db from 'common/db'
import { ft_filepicker_capture, ft_filepicker_traces } from 'common/db/schema'
import { and, eq, sql } from 'drizzle-orm'

import { promptClaude } from '../../backend/src/llm-apis/claude'
import { promptGemini } from '../../backend/src/llm-apis/gemini-api'

// Models we want to test
const MODELS_TO_TEST = [
  // models.gemini2_5_pro_exp,
  claudeModels.sonnet,
] as const

async function runTraces() {
  try {
    // Get all captures that don't have traces for our test models
    const captures = await db
      .select()
      .from(ft_filepicker_capture)
      .where(
        sql`NOT EXISTS (
          SELECT 1 FROM ft_filepicker_traces 
          WHERE ft_filepicker_traces.capture_id = ft_filepicker_capture.id 
          AND ft_filepicker_traces.model IN (${MODELS_TO_TEST.join(',')})
        )`
      )

    console.log(`Found ${captures.length} captures without traces`)

    for (const capture of captures) {
      console.log(`\nProcessing capture ${capture.id}`)

      for (const model of MODELS_TO_TEST) {
        // Check if we already have a trace for this model
        const existingTrace = await db
          .select()
          .from(ft_filepicker_traces)
          .where(
            and(
              eq(ft_filepicker_traces.captureId, capture.id),
              eq(ft_filepicker_traces.model, model)
            )
          )
          .limit(1)

        if (existingTrace.length > 0) {
          console.log(`Already have trace for model ${model}, skipping...`)
          continue
        }

        console.log(`Running model ${model}...`)

        try {
          let output: string

          if (model.startsWith('claude')) {
            output = await promptClaude(capture.messages, {
              // TODO: Don't ignore this :(
              // Awkward since its only defined in the backend package
              // @ts-ignore
              system: capture.system,
              model: model as typeof claudeModels.sonnet,
              clientSessionId: 'ft-trace-run',
              fingerprintId: 'ft-trace-run',
              userInputId: capture.id,
            })
          } else {
            // TODO: Don't ignore this :(
            // @ts-ignore
            output = await promptGemini(capture.messages, {
              system: capture.system,
              model: model as typeof models.gemini2_5_pro_exp,
              clientSessionId: 'ft-trace-run',
              fingerprintId: 'ft-trace-run',
              userInputId: capture.id,
            })
          }

          // Store the trace
          await db.insert(ft_filepicker_traces).values({
            captureId: capture.id,
            model,
            output,
          })

          console.log(`Successfully stored trace for model ${model}`)
        } catch (error) {
          console.error('Error running model', error)
        }
      }
    }
  } catch (error) {
    console.error('Error running traces:', error)
  }
}

// Run the script
runTraces()
