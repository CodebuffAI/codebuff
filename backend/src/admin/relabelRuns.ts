import { GetRelevantFilesPayload } from 'common/bigquery/schema'
import {
  claudeModels,
  finetunedVertexModels,
  geminiModels,
} from 'common/constants'
import {
  getTracesAndRelabelsForUser,
  getTracesWithoutRelabels,
  insertRelabel,
} from 'common/src/bigquery/client'
import { Message } from 'common/types/message'
import { generateCompactId } from 'common/util/string'
import { Request, Response } from 'express'

import { promptClaude, System } from '../llm-apis/claude'
import { promptFlashWithFallbacks } from '../llm-apis/gemini-with-fallbacks'
import { logger } from '../util/logger'

import { GeminiMessage } from '@/llm-apis/gemini-vertex-api'
import { promptAiSdk_GeminiFormat } from '@/llm-apis/vercel-ai-sdk/ai-sdk'

// --- GET Handler Logic ---

export async function getTracesForUserHandler(req: Request, res: Response) {
  try {
    // Extract userId from the query parameters
    const userId = req.query.userId as string

    if (!userId) {
      return res
        .status(400)
        .json({ error: 'Missing required parameter: userId' })
    }

    // Call the function to get traces and relabels
    const tracesAndRelabels = await getTracesAndRelabelsForUser(userId)

    // Transform data for the frontend
    const formattedResults = tracesAndRelabels.map(({ trace, relabels }) => {
      // Extract timestamp
      const timestamp = (trace.created_at as unknown as { value: string }).value

      // Extract query from the last message in the messages array
      const messages = trace.payload.messages || []
      const queryBody =
        Array.isArray(messages) && messages.length > 0
          ? messages[messages.length - 1].content[0].text || 'Unknown query'
          : 'Unknown query'

      // User prompt: User prompt: \"still not seeing it, can you see it on the page?\"
      // Extract using regex the above specific substring, matching the bit inside quotes
      const query = queryBody.match(/"(.*?)"/)?.[1] || 'Unknown query'

      // Get base model output
      const baseOutput = trace.payload.output || ''

      // Initialize outputs with base model
      const outputs: Record<string, string> = {
        base: baseOutput,
      }

      // Add outputs from relabels
      relabels.forEach((relabel) => {
        if (relabel.model && relabel.payload?.output) {
          outputs[relabel.model] = relabel.payload.output
        }
      })

      return {
        timestamp,
        query,
        outputs,
      }
    })

    // Return the formatted data
    return res.json({ data: formattedResults })
  } catch (error) {
    logger.error('Error fetching traces and relabels:', error)
    return res
      .status(500)
      .json({ error: 'Failed to fetch traces and relabels' })
  }
}

// --- POST Handler Logic ---

const models = [
  geminiModels.gemini2_5_pro_exp,
  claudeModels.sonnet,
  finetunedVertexModels.ft_filepicker_005,
] as const

export async function relabelForUserHandler(req: Request, res: Response) {
  try {
    // Extract userId from the URL query params
    const userId = req.query.userId as string

    if (!userId) {
      return res
        .status(400)
        .json({ error: 'Missing required parameter: userId' })
    }

    // Parse request body to get the relabeling data
    const limit = req.body.limit || 10 // Default to 10 traces per model if not specified

    const allResults = []

    // Process each model
    for (const model of models) {
      logger.info(`Processing traces for model ${model} and user ${userId}...`)

      // Get traces without relabels for this model and user
      const traces = await getTracesWithoutRelabels(model, limit, userId)

      logger.info(
        `Found ${traces.length} traces without relabels for model ${model}`
      )

      // Process traces for this model
      const modelResults = await Promise.all(
        traces.map(async (trace) => {
          logger.info(`Processing trace ${trace.id}`)
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
              output = await promptClaude(messages as Message[], {
                system: system as System,
                model: model as typeof claudeModels.sonnet,
                clientSessionId: 'relabel-trace-api',
                fingerprintId: 'relabel-trace-api',
                userInputId: 'relabel-trace-api',
                ignoreDatabaseAndHelicone: true,
              })
            } else if (model.startsWith('gemini')) {
              output = await promptFlashWithFallbacks(
                messages as Message[],
                system as System,
                {
                  model: model as typeof geminiModels.gemini2_5_pro_exp,
                  clientSessionId: 'relabel-trace-api',
                  fingerprintId: 'relabel-trace-api',
                  userInputId: 'relabel-trace-api',
                  userId: 'relabel-trace-api',
                }
              )
            } else {
              output = await promptAiSdk_GeminiFormat(
                messages as GeminiMessage[],
                system as System,
                {
                  model:
                    model as (typeof finetunedVertexModels)[keyof typeof finetunedVertexModels],
                  clientSessionId: 'relabel-trace-api',
                  fingerprintId: 'relabel-trace-api',
                  userInputId: 'relabel-trace-api',
                  userId: 'relabel-trace-api',
                }
              )
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
            await insertRelabel(relabel)
            logger.info(`Successfully stored relabel for trace ${trace.id}`)

            return {
              traceId: trace.id,
              status: 'success',
              model: model,
            }
          } catch (error) {
            logger.error(`Error processing trace ${trace.id}:`, error)
            return {
              traceId: trace.id,
              status: 'error',
              model: model,
              error: error instanceof Error ? error.message : 'Unknown error',
            }
          }
        })
      )

      allResults.push(...modelResults)
    }

    // Return success response
    return res.json({
      success: true,
      message: 'Traces relabeled successfully',
      data: allResults,
    })
  } catch (error) {
    logger.error('Error relabeling traces:', error)
    return res.status(500).json({ error: 'Failed to relabel traces' })
  }
}
