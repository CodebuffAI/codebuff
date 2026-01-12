import { messagesWithSystem } from '@codebuff/agent-runtime/util/messages'
import {
  getTracesAndAllDataForUser,
  getTracesWithoutRelabels,
  insertRelabel,
  setupBigQuery,
  type GetExpandedFileContextForTrainingBlobTrace,
  type GetExpandedFileContextForTrainingTrace,
  type GetRelevantFilesPayload,
  type GetRelevantFilesTrace,
  type Relabel,
  type TraceBundle,
} from '@codebuff/bigquery'
import { finetunedVertexModels, models } from '@codebuff/common/old-constants'
import { userMessage } from '@codebuff/common/util/messages'
import { generateCompactId } from '@codebuff/common/util/string'
import { closeXml } from '@codebuff/common/util/xml'
import { promptAiSdk } from '@codebuff/sdk'
import { NextResponse } from 'next/server'

import { checkAdminAuth } from '../../../../lib/admin-auth'
import { logger } from '../../../../util/logger'

import type { Message } from '@codebuff/common/types/messages/codebuff-message'
import type { NextRequest } from 'next/server'
import type { System } from '@codebuff/agent-runtime/llm-api/claude'

// Type for messages stored in BigQuery traces
interface StoredMessage {
  role?: string
  content?: string | Array<{ type?: string; text?: string }>
}

// Type for BigQuery timestamp values
interface BigQueryTimestamp {
  value?: string | number
}


const STATIC_SESSION_ID = 'relabel-trace-api'
// Admin relabeling operations use a placeholder user ID since they're not associated with a real user
const ADMIN_RELABEL_USER_ID = 'admin-relabel-user'
const DEFAULT_RELABEL_LIMIT = 10
const FULL_FILE_CONTEXT_SUFFIX = '-with-full-file-context'
const modelsToRelabel = [
  finetunedVertexModels.ft_filepicker_008,
  finetunedVertexModels.ft_filepicker_topk_002,
] as const

let bigqueryReady: Promise<void> | null = null

type PromptContext = ReturnType<typeof buildPromptContext>
type RelabelResult =
  | { traceId: string; status: 'success'; model: string }
  | { traceId: string; status: 'error'; model: string; error: string }

export async function GET(req: NextRequest) {
  const authResult = await checkAdminAuth()
  if (authResult instanceof NextResponse) {
    return authResult
  }

  const userId = req.nextUrl.searchParams.get('userId')
  if (!userId) {
    return NextResponse.json(
      { error: 'Missing required parameter: userId' },
      { status: 400 },
    )
  }

  try {
    await ensureBigQuery()
    const traceBundles = await getTracesAndAllDataForUser(userId)
    const data = formatTraceResults(traceBundles)

    return NextResponse.json({ data })
  } catch (error) {
    logger.error(
      {
        error,
        userId,
      },
      'Error fetching traces and relabels',
    )
    return NextResponse.json(
      { error: 'Failed to fetch traces and relabels' },
      { status: 500 },
    )
  }
}

export async function POST(req: NextRequest) {
  const authResult = await checkAdminAuth()
  if (authResult instanceof NextResponse) {
    return authResult
  }

  const userId = req.nextUrl.searchParams.get('userId')
  if (!userId) {
    return NextResponse.json(
      { error: 'Missing required parameter: userId' },
      { status: 400 },
    )
  }

  const { limit: requestedLimit } = await req.json().catch(() => ({}))
  const limit =
    typeof requestedLimit === 'number' && requestedLimit > 0
      ? requestedLimit
      : DEFAULT_RELABEL_LIMIT

  // Require API key from Authorization header - user must provide their own key
  const apiKey = getApiKeyFromRequest(req)
  if (!apiKey) {
    return NextResponse.json(
      { 
        error: 'API key required',
        details: 'Provide your API key via Authorization header (Bearer token).',
        hint: 'Visit /usage in the web app to create an API key.',
      },
      { status: 401 },
    )
  }

  try {
    await ensureBigQuery()
    const results = await relabelUserTraces({
      userId,
      limit,
      promptContext: buildPromptContext(apiKey),
    })

    return NextResponse.json({
      success: true,
      message: 'Traces relabeled successfully',
      data: results,
    })
  } catch (error) {
    logger.error(
      { error, userId },
      'Error relabeling traces for admin endpoint',
    )
    return NextResponse.json(
      { error: 'Failed to relabel traces' },
      { status: 500 },
    )
  }
}

async function relabelUserTraces(params: {
  userId: string
  limit: number
  promptContext: PromptContext
}): Promise<RelabelResult[]> {
  const { userId, limit, promptContext } = params
  const allResults: RelabelResult[] = []

  // Run the richer relabeling in parallel
  const fullContextRelabel = relabelUsingFullFilesForUser({
    userId,
    limit,
    promptContext,
  })

  for (const model of modelsToRelabel) {
    logger.info(`Processing traces for model ${model} and user ${userId}...`)

    const traces = await getTracesWithoutRelabels(model, limit, userId)
    logger.info(
      `Found ${traces.length} traces without relabels for model ${model}`,
    )

    const modelResults = await Promise.all(
      traces.map((trace) =>
        relabelTraceWithModel({
          trace,
          model,
          promptContext,
        }),
      ),
    )

    allResults.push(...modelResults)
  }

  await fullContextRelabel

  return allResults
}

async function relabelTraceWithModel(params: {
  trace: GetRelevantFilesTrace
  model: string
  promptContext: PromptContext
}): Promise<RelabelResult> {
  const { trace, model, promptContext } = params
  const payload =
    typeof trace.payload === 'string'
      ? (JSON.parse(trace.payload) as GetRelevantFilesPayload)
      : (trace.payload as GetRelevantFilesPayload)

  try {
    const messages = messagesWithSystem({
      messages: (payload.messages || []) as Message[],
      system: payload.system as System,
    })

    const output = await promptAiSdk({
      ...promptContext,
      model,
      messages,
    })

    const relabel: Relabel = {
      id: generateCompactId(),
      agent_step_id: trace.agent_step_id,
      user_id: trace.user_id,
      created_at: new Date(),
      model,
      payload: {
        user_input_id: payload.user_input_id,
        client_session_id: payload.client_session_id,
        fingerprint_id: payload.fingerprint_id,
        output,
      },
    }

    await insertRelabel({ relabel, logger })

    return {
      traceId: trace.id,
      status: 'success',
      model,
    }
  } catch (error) {
    logger.error(
      {
        error,
        traceId: trace.id,
        model,
      },
      `Error processing trace ${trace.id}`,
    )
    return {
      traceId: trace.id,
      status: 'error',
      model,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

async function relabelUsingFullFilesForUser(params: {
  userId: string
  limit: number
  promptContext: PromptContext
}) {
  const { userId, limit, promptContext } = params
  const tracesBundles = await getTracesAndAllDataForUser(userId, limit)

  let relabeled = 0
  let didRelabel = false
  const relabelPromises: Promise<any>[] = []

  for (const traceBundle of tracesBundles) {
    const trace = traceBundle.trace as GetRelevantFilesTrace
    const fileBlobs = traceBundle.relatedTraces.find(
      (t) => t.type === 'get-expanded-file-context-for-training-blobs',
    ) as GetExpandedFileContextForTrainingBlobTrace | undefined

    if (!fileBlobs) {
      continue
    }

    if (!traceBundle.relabels.some((r) => r.model === 'relace-ranker')) {
      relabelPromises.push(
        relabelWithRelace({
          trace,
          fileBlobs,
          promptContext,
        }),
      )
      didRelabel = true
    }

    for (const model of [
      models.openrouter_claude_sonnet_4,
      models.openrouter_claude_opus_4,
    ]) {
      if (
        !traceBundle.relabels.some(
          (r) => r.model === `${model}${FULL_FILE_CONTEXT_SUFFIX}`,
        )
      ) {
        relabelPromises.push(
          relabelWithClaudeWithFullFileContext({
            trace,
            fileBlobs,
            model,
            promptContext,
          }),
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

  const results = await Promise.allSettled(relabelPromises)
  
  // Log any failures from parallel relabeling
  for (const result of results) {
    if (result.status === 'rejected') {
      logger.error({ error: result.reason }, 'Relabeling task failed')
    }
  }

  return relabeled
}

async function relabelWithRelace(params: {
  trace: GetRelevantFilesTrace
  fileBlobs: GetExpandedFileContextForTrainingBlobTrace
  promptContext: PromptContext
}) {
  const { trace, fileBlobs, promptContext } = params
  logger.info(`Relabeling ${trace.id} with LLM reranker`)

  const filesWithPath = Object.entries(fileBlobs.payload.files).map(
    ([path, file]) => ({
      path,
      content: file.content,
    }),
  )

  const query = extractQueryFromMessages(trace.payload.messages)
  const prompt = [
    `A developer asked: "${query}".`,
    'Rank the following files from most relevant to least relevant for answering the request.',
    'Return only the file paths, one per line, and only include files from the list below.',
    filesWithPath.map((file) => `- ${file.path}`).join('\n'),
  ].join('\n\n')

  const ranked = await promptAiSdk({
    ...promptContext,
    model: models.openrouter_claude_sonnet_4,
    messages: [userMessage(prompt)],
    includeCacheControl: false,
  })

  const rankedFiles =
    ranked
      .split('\n')
      .map((line: string) => line.trim())
      .filter((line: string) => line.length > 0) || []

  const output =
    rankedFiles.length > 0
      ? rankedFiles.join('\n')
      : filesWithPath.map((file) => file.path).join('\n')

  const relabel: Relabel = {
    id: generateCompactId(),
    agent_step_id: trace.agent_step_id,
    user_id: trace.user_id,
    created_at: new Date(),
    model: 'relace-ranker',
    payload: {
      user_input_id: trace.payload.user_input_id,
      client_session_id: trace.payload.client_session_id,
      fingerprint_id: trace.payload.fingerprint_id,
      output,
    },
  }

  await insertRelabel({ relabel, logger })

  return output
}

async function relabelWithClaudeWithFullFileContext(params: {
  trace: GetRelevantFilesTrace
  fileBlobs: GetExpandedFileContextForTrainingBlobTrace
  model: string
  promptContext: PromptContext
}) {
  const { trace, fileBlobs, model, promptContext } = params
  logger.info(`Relabeling ${trace.id} with ${model} (full file context)`)

  const filesWithPath = Object.entries(fileBlobs.payload.files).map(
    ([path, file]): { path: string; content: string } => ({
      path,
      content: file.content,
    }),
  )

  const filesString = filesWithPath
    .map(
      (file) => `<file-contents>
      <name>${file.path}${closeXml('name')}
      <contents>${file.content}${closeXml('contents')}
    ${closeXml('file-contents')}`,
    )
    .join('\n')

  const partialFileContext = `## Partial file context\n In addition to the file-tree, you've also been provided with some full files to make a better decision. Use these to help you decide which files are most relevant to the query. \n<partial-file-context>\n${filesString}\n${closeXml('partial-file-context')}`

  const tracePayload =
    typeof trace.payload === 'string'
      ? (JSON.parse(trace.payload) as GetRelevantFilesPayload)
      : (trace.payload as GetRelevantFilesPayload)

  let system: System = tracePayload.system as System
  if (typeof system === 'string') {
    system = system + partialFileContext
  } else if (Array.isArray(system) && system.length > 0) {
    const systemCopy = [...system]
    const lastBlock = systemCopy[systemCopy.length - 1]
    systemCopy[systemCopy.length - 1] = {
      ...lastBlock,
      text: `${lastBlock.text}${partialFileContext}`,
    }
    system = systemCopy
  }

  const output = await promptAiSdk({
    ...promptContext,
    model,
    messages: messagesWithSystem({
      messages: (tracePayload.messages || []) as Message[],
      system,
    }),
    maxOutputTokens: 1000,
  })

  const relabel: Relabel = {
    id: generateCompactId(),
    agent_step_id: trace.agent_step_id,
    user_id: trace.user_id,
    created_at: new Date(),
    model: `${model}${FULL_FILE_CONTEXT_SUFFIX}`,
    payload: {
      user_input_id: tracePayload.user_input_id,
      client_session_id: tracePayload.client_session_id,
      fingerprint_id: tracePayload.fingerprint_id,
      output,
    },
  }

  await insertRelabel({ relabel, logger })

  return relabel
}

function formatTraceResults(traceBundles: TraceBundle[]) {
  return traceBundles.map(({ trace, relatedTraces, relabels }) => {
    const payload =
      typeof trace.payload === 'string'
        ? (JSON.parse(trace.payload) as GetRelevantFilesPayload)
        : (trace.payload as GetRelevantFilesPayload)

    const timestamp =
      trace.created_at instanceof Date
        ? trace.created_at.toISOString()
        : new Date(
            (trace.created_at as BigQueryTimestamp)?.value ?? trace.created_at,
          ).toISOString()

    const query = extractQueryFromMessages(payload.messages)
    const outputs: Record<string, string> = {
      base: payload.output || '',
    }

    relabels.forEach((relabel) => {
      if (relabel.model && relabel.payload?.output) {
        outputs[relabel.model] = relabel.payload.output
      }
    })

    const expandedFilesTrace = relatedTraces.find(
      (t) => t.type === 'get-expanded-file-context-for-training',
    )
    if (expandedFilesTrace?.payload) {
      outputs['files-uploaded'] = (
        expandedFilesTrace.payload as GetRelevantFilesPayload
      ).output
    }

    return {
      timestamp,
      query,
      outputs,
    }
  })
}

function extractQueryFromMessages(messages: unknown): string {
  const items = Array.isArray(messages) ? messages : []
  const lastMessage = items[items.length - 1] as StoredMessage | undefined
  const content = Array.isArray(lastMessage?.content)
    ? lastMessage.content[0]?.text
    : lastMessage?.content

  if (typeof content !== 'string') {
    return 'Unknown query'
  }

  const match = content.match(/"(.*?)"/)
  return match?.[1] ?? 'Unknown query'
}

function buildPromptContext(apiKey: string) {
  return {
    apiKey,
    runId: `admin-relabel-${Date.now()}`,
    clientSessionId: STATIC_SESSION_ID,
    fingerprintId: STATIC_SESSION_ID,
    userInputId: STATIC_SESSION_ID,
    userId: ADMIN_RELABEL_USER_ID,
    sendAction: async () => {},
    trackEvent: async () => {},
    logger,
    signal: new AbortController().signal,
  }
}

/**
 * Extract API key from Authorization header (Bearer token)
 */
function getApiKeyFromRequest(req: NextRequest): string | null {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return null
  }
  const token = authHeader.slice(7).trim()
  return token || null
}

async function ensureBigQuery() {
  if (!bigqueryReady) {
    bigqueryReady = setupBigQuery({ logger })
  }

  try {
    await bigqueryReady
  } catch (error) {
    bigqueryReady = null
    throw error
  }
}
