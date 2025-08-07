import {
  getTracesAndAllDataForUser,
  getTracesWithoutRelabels,
  insertRelabel,
  setupBigQuery,
} from '@codebuff/bigquery'
import {
  finetunedVertexModels,
  models,
  TEST_USER_ID,
} from '@codebuff/common/constants'
import { generateCompactId } from '@codebuff/common/util/string'
import { closeXml } from '@codebuff/common/util/xml'

import { rerank } from '../llm-apis/relace-api'
import {
  promptAiSdk,
  transformMessages,
} from '../llm-apis/vercel-ai-sdk/ai-sdk'
import { logger } from '../util/logger'

import type { System } from '../llm-apis/claude'
import type {
  GetExpandedFileContextForTrainingBlobTrace,
  GetExpandedFileContextForTrainingTrace,
  GetRelevantFilesPayload,
  GetRelevantFilesTrace,
  Relabel,
} from '@codebuff/bigquery'
import type { Message } from '@codebuff/common/types/message'

// --- GET Handler Logic ---

export async function getTracesForUserHandler(
  req: Request,
  ok: (body: any, init?: ResponseInit) => Response,
) {
  try {
    const url = new URL(req.url)
    const userId = url.searchParams.get('userId') || ''
    if (!userId) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameter: userId' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        },
      )
    }

    const tracesAndRelabels = await getTracesAndAllDataForUser(userId)

    const formattedResults = tracesAndRelabels.map(
      ({ trace, relatedTraces, relabels }) => {
        const timestamp = (trace.created_at as unknown as { value: string })
          .value
        const messages = trace.payload.messages || []
        const queryBody =
          Array.isArray(messages) && messages.length > 0
            ? messages[messages.length - 1].content[0].text ??
              messages[messages.length - 1].content ??
              'Unknown query'
            : 'Unknown query'
        const query = queryBody.match(/"(.*?)"/)?.[1] || 'Unknown query'
        const baseOutput = trace.payload.output || ''
        const outputs: Record<string, string> = { base: baseOutput }
        relabels.forEach((relabel) => {
          if (relabel.model && relabel.payload?.output)
            outputs[relabel.model] = relabel.payload.output
        })
        relatedTraces.forEach((trace) => {
          if (trace.type === 'get-expanded-file-context-for-training') {
            outputs['files-uploaded'] = (
              trace.payload as GetRelevantFilesPayload
            ).output
          }
        })
        return { timestamp, query, outputs }
      },
    )

    return ok({ data: formattedResults })
  } catch (error) {
    logger.error(
      {
        error: error,
        stack: error instanceof Error ? error.stack : undefined,
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      'Error fetching traces and relabels',
    )
    return new Response(
      JSON.stringify({ error: 'Failed to fetch traces and relabels' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      },
    )
  }
}

// --- POST Handler Logic ---

const modelsToRelabel = [
  finetunedVertexModels.ft_filepicker_008,
  finetunedVertexModels.ft_filepicker_topk_002,
] as const

export async function relabelForUserHandler(
  req: Request,
  ok: (body: any, init?: ResponseInit) => Response,
) {
  try {
    const url = new URL(req.url)
    const userId = url.searchParams.get('userId') || ''
    if (!userId) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameter: userId' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        },
      )
    }

    const body = (await req.json().catch(() => ({}))) as any
    const limit = body.limit || 10

    const allResults: Array<{
      traceId: string
      status: string
      model: string
      error?: string
    }> = []
    const relaceResults = relabelUsingFullFilesForUser(userId, limit)

    for (const model of modelsToRelabel) {
      logger.info(`Processing traces for model ${model} and user ${userId}...`)
      const traces = await getTracesWithoutRelabels(model, limit, userId)
      logger.info(
        `Found ${traces.length} traces without relabels for model ${model}`,
      )

      const modelResults = await Promise.all(
        traces.map(async (trace) => {
          logger.info(`Processing trace ${trace.id}`)
          const payload = (
            typeof trace.payload === 'string'
              ? JSON.parse(trace.payload)
              : trace.payload
          ) as GetRelevantFilesPayload
          try {
            const messages = payload.messages
            const system = payload.system
            const output = await promptAiSdk({
              messages: transformMessages(
                messages as Message[],
                system as System,
              ),
              model: model,
              clientSessionId: 'relabel-trace-api',
              fingerprintId: 'relabel-trace-api',
              userInputId: 'relabel-trace-api',
              userId: TEST_USER_ID,
            })

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
            await insertRelabel(relabel)
            logger.info(`Successfully stored relabel for trace ${trace.id}`)
            return { traceId: trace.id, status: 'success', model: model }
          } catch (error) {
            logger.error(
              {
                error: error,
                stack: error instanceof Error ? error.stack : undefined,
                message:
                  error instanceof Error ? error.message : 'Unknown error',
              },
              `Error processing trace ${trace.id}:`,
            )
            return {
              traceId: trace.id,
              status: 'error',
              model: model,
              error: error instanceof Error ? error.message : 'Unknown error',
            }
          }
        }),
      )

      allResults.push(...modelResults)
    }

    await relaceResults

    return ok({
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
      'Error relabeling traces',
    )
    return new Response(JSON.stringify({ error: 'Failed to relabel traces' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}

async function relabelUsingFullFilesForUser(userId: string, limit: 10) {
  const tracesBundles = await getTracesAndAllDataForUser(userId)
  let relabeled = 0
  let didRelabel = false
  const relabelPromises: Array<Promise<any>> = []
  for (const traceBundle of tracesBundles) {
    const trace = traceBundle.trace as GetRelevantFilesTrace
    const files = traceBundle.relatedTraces.find(
      (t) =>
        t.type === 'get-expanded-file-context-for-training' &&
        (t.payload as GetRelevantFilesPayload),
    ) as GetExpandedFileContextForTrainingTrace
    const fileBlobs = traceBundle.relatedTraces.find(
      (t) => t.type === 'get-expanded-file-context-for-training-blobs',
    ) as GetExpandedFileContextForTrainingBlobTrace
    if (!files || !fileBlobs) continue

    if (!traceBundle.relabels.some((r) => r.model === 'relace-ranker')) {
      relabelPromises.push(relabelWithRelace(trace, fileBlobs))
      didRelabel = true
    }
    for (const model of [
      models.openrouter_claude_sonnet_4,
      models.openrouter_claude_opus_4,
    ]) {
      if (
        !traceBundle.relabels.some(
          (r) => r.model === `${model}-with-full-file-context`,
        )
      ) {
        relabelPromises.push(
          relabelWithClaudeWithFullFileContext(trace, fileBlobs, model),
        )
        didRelabel = true
      }
    }

    if (didRelabel) {
      relabeled++
      didRelabel = false
    }
    if (relabeled >= limit) break
  }
  await Promise.allSettled(relabelPromises)
  return relabeled
}

async function relabelWithRelace(
  trace: GetRelevantFilesTrace,
  fileBlobs: GetExpandedFileContextForTrainingBlobTrace,
) {
  logger.info(`Relabeling ${trace.id} with Relace`)
  const messages = trace.payload.messages || []
  const queryBody =
    Array.isArray(messages) && messages.length > 0
      ? messages[messages.length - 1].content[0].text || 'Unknown query'
      : 'Unknown query'
  const query = queryBody.match(/"(.*?)"/)?.[1] || 'Unknown query'

  const filesWithPath = Object.entries(fileBlobs.payload.files).map(
    ([path, file]) => ({ path, content: file.content }),
  )

  const relaced = await rerank(filesWithPath, query, {
    clientSessionId: trace.payload.client_session_id,
    fingerprintId: trace.payload.fingerprint_id,
    userInputId: trace.payload.user_input_id,
    userId: 'test-user-id',
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
  model: string,
  dataset?: string,
) {
  if (dataset) await setupBigQuery(dataset)
  logger.info(`Relabeling ${trace.id} with Claude with full file context`)
  const filesWithPath = Object.entries(fileBlobs.payload.files).map(
    ([path, file]): { path: string; content: string } => ({
      path,
      content: file.content,
    }),
  )

  const filesString = filesWithPath
    .map(
      (f) =>
        `<file-contents>\n      <name>${f.path}${closeXml('name')}\n      <contents>${f.content}${closeXml('contents')}\n    ${closeXml('file-contents')}`,
    )
    .join('\n')

  const partialFileContext = `## Partial file context\n In addition to the file-tree, you've also been provided with some full files to make a better decision. Use these to help you decide which files are most relevant to the query. \n<partial-file-context>\n${filesString}\n${closeXml('partial-file-context')}`

  let system = trace.payload.system as System
  if (typeof system === 'string') system = system + partialFileContext
  else
    system[system.length - 1].text =
      system[system.length - 1].text + partialFileContext

  const output = await promptAiSdk({
    messages: transformMessages(trace.payload.messages as Message[], system),
    model: model as any,
    clientSessionId: 'relabel-trace-api',
    fingerprintId: 'relabel-trace-api',
    userInputId: 'relabel-trace-api',
    userId: TEST_USER_ID,
    maxTokens: 1000,
  })

  const relabel = {
    id: generateCompactId(),
    agent_step_id: trace.agent_step_id,
    user_id: trace.user_id,
    created_at: new Date(),
    model: `${model}-with-full-file-context-new`,
    payload: {
      user_input_id: trace.payload.user_input_id,
      client_session_id: trace.payload.client_session_id,
      fingerprint_id: trace.payload.fingerprint_id,
      output: output,
    },
  } as Relabel

  await insertRelabel(relabel, dataset)
  return relabel
}
