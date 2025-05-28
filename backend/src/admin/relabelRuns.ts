import {
  GetExpandedFileContextForTrainingBlobTrace,
  GetExpandedFileContextForTrainingTrace,
  GetRelevantFilesPayload,
  GetRelevantFilesTrace,
  getTracesAndAllDataForUser,
  getTracesWithoutRelabels,
  insertRelabel,
  Relabel,
  setupBigQuery,
} from '@codebuff/bigquery'
import {
  AnthropicModel,
  claudeModels,
  finetunedVertexModels,
  geminiModels,
} from 'common/constants'
import { Message } from 'common/types/message'
import { generateCompactId } from 'common/util/string'
import { Request, Response } from 'express'

import { rerank } from '@/llm-apis/relace-api'
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
    const tracesAndRelabels = await getTracesAndAllDataForUser(userId)

    // Transform data for the frontend
    const formattedResults = tracesAndRelabels.map(
      ({ trace, relatedTraces, relabels }) => {
        // Extract timestamp
        const timestamp = (trace.created_at as unknown as { value: string })
          .value

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

        relatedTraces.forEach((trace) => {
          if (trace.type === 'get-expanded-file-context-for-training') {
            outputs['files-uploaded'] = (
              trace.payload as GetRelevantFilesPayload
            ).output
          }
        })

        return {
          timestamp,
          query,
          outputs,
        }
      }
    )

    // Return the formatted data
    return res.json({ data: formattedResults })
  } catch (error) {
    logger.error(
      {
        error: error,
        stack: error instanceof Error ? error.stack : undefined,
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      'Error fetching traces and relabels'
    )
    return res
      .status(500)
      .json({ error: 'Failed to fetch traces and relabels' })
  }
}

// --- POST Handler Logic ---

const models = [
  geminiModels.gemini2_5_pro_preview,
  claudeModels.sonnet,
  claudeModels.opus4,
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

    const relaceResults = relabelUsingFullFilesForUser(userId, limit)

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
            logger.error(
              {
                error: error,
                stack: error instanceof Error ? error.stack : undefined,
                message:
                  error instanceof Error ? error.message : 'Unknown error',
              },
              `Error processing trace ${trace.id}:`
            )
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

    await relaceResults

    // TODO: Add the judging step right here?

    // Return success response
    return res.json({
      success: true,
      message: 'Traces relabeled successfully',
      data: allResults,
    })
  } catch (error) {
    logger.error(
      {
        error: error,
        stack: error instanceof Error ? error.stack : undefined,
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      'Error relabeling traces'
    )
    return res.status(500).json({ error: 'Failed to relabel traces' })
  }
}

async function relabelUsingFullFilesForUser(userId: string, limit: 10) {
  // TODO: We need to figure out changing _everything_ to use `getTracesAndAllDataForUser`
  const tracesBundles = await getTracesAndAllDataForUser(userId)

  let relabeled = 0
  let didRelabel = false
  const relabelPromises = []
  for (const traceBundle of tracesBundles) {
    const trace = traceBundle.trace as GetRelevantFilesTrace
    const files = traceBundle.relatedTraces.find(
      (t) =>
        t.type === 'get-expanded-file-context-for-training' &&
        (t.payload as GetRelevantFilesPayload)
    ) as GetExpandedFileContextForTrainingTrace
    // TODO: We might be messing this up by not storing if 'Key' or 'Non-obvious', now that we collect both (?)
    const fileBlobs = traceBundle.relatedTraces.find(
      (t) => t.type === 'get-expanded-file-context-for-training-blobs'
    ) as GetExpandedFileContextForTrainingBlobTrace

    if (!files || !fileBlobs) {
      continue
    }

    if (!traceBundle.relabels.some((r) => r.model === 'relace-ranker')) {
      relabelPromises.push(relabelWithRelace(trace, fileBlobs))
      didRelabel = true
    }
    for (const model of [claudeModels.sonnet, claudeModels.opus4]) {
      if (
        !traceBundle.relabels.some(
          (r) => r.model === `${model}-with-full-file-context`
        )
      ) {
        relabelPromises.push(
          relabelWithClaudeWithFullFileContext(trace, fileBlobs, model)
        )
        didRelabel = true
      }
    }

    if (didRelabel) {
      relabeled++
      didRelabel = false
    }

    if (relabeled >= limit) {
      break
    }
  }

  await Promise.all(relabelPromises)

  return relabeled
}

async function relabelWithRelace(
  trace: GetRelevantFilesTrace,
  fileBlobs: GetExpandedFileContextForTrainingBlobTrace
) {
  logger.info(`Relabeling ${trace.id} with Relace`)
  const messages = trace.payload.messages || []
  const queryBody =
    Array.isArray(messages) && messages.length > 0
      ? messages[messages.length - 1].content[0].text || 'Unknown query'
      : 'Unknown query'

  // User prompt: User prompt: \"still not seeing it, can you see it on the page?\"
  // Extract using regex the above specific substring, matching the bit inside quotes
  const query = queryBody.match(/"(.*?)"/)?.[1] || 'Unknown query'

  const filesWithPath = Object.entries(fileBlobs.payload.files).map(
    ([path, file]) => ({
      path,
      content: file.content,
    })
  )

  const relaced = await rerank(filesWithPath, query, {
    clientSessionId: trace.payload.client_session_id,
    fingerprintId: trace.payload.fingerprint_id,
    userInputId: trace.payload.user_input_id,
    userId: 'test-user-id', // Make sure we don't bill em for it!!
    messageId: trace.id,
  })

  const relabel = {
    id: generateCompactId(),
    agent_step_id: trace.agent_step_id,
    user_id: trace.user_id,
    created_at: new Date(),
    model: 'relace-ranker',
    payload: {
      user_input_id: trace.payload.user_input_id,
      client_session_id: trace.payload.client_session_id,
      fingerprint_id: trace.payload.fingerprint_id,
      output: relaced.join('\n'),
    },
  }

  await insertRelabel(relabel)

  return relaced
}

export async function relabelWithClaudeWithFullFileContext(
  trace: GetRelevantFilesTrace,
  fileBlobs: GetExpandedFileContextForTrainingBlobTrace,
  model: AnthropicModel,
  dataset?: string
) {
  if (dataset) {
    await setupBigQuery(dataset)
  }
  logger.info(`Relabeling ${trace.id} with Claude with full file context`)
  const filesWithPath = Object.entries(fileBlobs.payload.files).map(
    ([path, file]) => ({
      path,
      content: file.content,
    })
  )

  const filesString = filesWithPath
    .map(
      (f) => `<file-contents>
      <name>${f.path}</name>
      <contents>${f.content}</contents>
    </file-contents>`
    )
    .join('\n')

  const partialFileContext = `## Partial file context\n In addition to the file-tree, you've also been provided with some full files to make a better decision. Use these to help you decide which files are most relevant to the query. \n<partial-file-context>\n${filesString}\n</partial-file-context>`

  let system = trace.payload.system as System
  if (typeof system === 'string') {
    system = system + partialFileContext
  } else {
    // append partialFileContext to the last element of the system array
    system[system.length - 1].text =
      system[system.length - 1].text + partialFileContext
  }

  const output = await promptClaude(trace.payload.messages as Message[], {
    system: system,
    model: claudeModels.sonnet,
    clientSessionId: 'relabel-trace-api',
    fingerprintId: 'relabel-trace-api',
    userInputId: 'relabel-trace-api',
    ignoreDatabaseAndHelicone: true,
  })

  const relabel = {
    id: generateCompactId(),
    agent_step_id: trace.agent_step_id,
    user_id: trace.user_id,
    created_at: new Date(),
    model: `${model}-with-full-file-context`,
    payload: {
      user_input_id: trace.payload.user_input_id,
      client_session_id: trace.payload.client_session_id,
      fingerprint_id: trace.payload.fingerprint_id,
      output: output,
    },
  } as Relabel

  await insertRelabel(relabel, dataset)

  console.log({ relabel })

  return relabel
}
