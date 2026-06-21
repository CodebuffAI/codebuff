import { postStreamProcessing } from './write-file'

import type { CodebuffToolHandlerFunction } from '../handler-function-type'
import type { FileProcessingState } from './write-file'
import type {
  ClientToolCall,
  CodebuffToolCall,
  CodebuffToolOutput,
} from '@codebuff/common/tools/list'
import type { Logger } from '@codebuff/common/types/contracts/logger'

const SESSION_PLAN_RE =
  /(?:^|\/)\.agents\/sessions\/([^/]+)\/PLAN\.md$/i
const TASK_MARKER_RE = /^\s*[-*]\s*\[[ xX]\]/gm
const NONTRIVIAL_CONTENT_LENGTH = 500

/** Artifact basenames allowed under .agents/sessions/<slug>/ */
const ALLOWED_ARTIFACT_NAMES = ['SPEC.md', 'PLAN.md', 'STATUS.md', 'LESSONS.md'] as const

/** Strict shape: optional leading "./" then ".agents/sessions/<slug>/<ARTIFACT>" */
const ALLOWED_SESSION_ARTIFACT_RE =
  /^(?:\.\/)?\.agents\/sessions\/([A-Za-z0-9._-]+)\/(SPEC|PLAN|STATUS|LESSONS)\.md$/

/**
 * Normalize a path for validation: convert backslashes to forward slashes
 * and strip a single leading "./". Does not collapse ".." segments — those
 * are rejected by validatePlanArtifactPath as traversal attempts.
 */
function normalizePlanPath(p: string): string {
  return p.replace(/\\/g, '/')
}

/**
 * Validate a create_plan path. Returns an error string when invalid,
 * or null when the path is an allowed durable session artifact.
 */
export function validatePlanArtifactPath(path: string): string | null {
  if (typeof path !== 'string' || !path.trim()) {
    return 'create_plan: path must be a non-empty string.'
  }
  const normalized = normalizePlanPath(path.trim())
  if (normalized.startsWith('/') || /^[A-Za-z]:\//.test(normalized)) {
    return `create_plan: absolute paths are not allowed (got "${path}"). Use .agents/sessions/<slug>/(SPEC|PLAN|STATUS|LESSONS).md.`
  }
  if (normalized.split('/').includes('..')) {
    return `create_plan: path traversal ("..") is not allowed (got "${path}").`
  }
  if (!ALLOWED_SESSION_ARTIFACT_RE.test(normalized)) {
    return `create_plan: only .agents/sessions/<slug>/(${ALLOWED_ARTIFACT_NAMES.join('|')}) paths are allowed (got "${path}").`
  }
  return null
}

/**
 * Decide whether a create_plan write to a durable session PLAN.md is
 * "non-trivial" enough that missing companion artifacts should be flagged.
 *
 * Heuristic: multiple task/status checkbox markers OR long enough content.
 */
export function isNonTrivialSessionPlan(path: string, content: string): boolean {
  if (!SESSION_PLAN_RE.test(normalizePlanPath(path))) return false
  const matches = content.match(TASK_MARKER_RE)
  if (matches && matches.length >= 2) return true
  return content.length >= NONTRIVIAL_CONTENT_LENGTH
}

/**
 * Build a warning string when a non-trivial session PLAN.md is being written
 * without companion STATUS.md / LESSONS.md changes queued in the same batch.
 * Returns null when no warning is needed.
 */
export function buildMissingCompanionWarning(params: {
  planPath: string
  planContent: string
  queuedPaths: string[]
}): string | null {
  const normalized = normalizePlanPath(params.planPath)
  const match = normalized.match(SESSION_PLAN_RE)
  if (!match) return null
  if (!isNonTrivialSessionPlan(params.planPath, params.planContent)) return null

  const sessionDir = `.agents/sessions/${match[1]}`
  const queued = new Set(params.queuedPaths.map((p) => normalizePlanPath(p)))
  const missing: string[] = []
  if (!queued.has(`${sessionDir}/STATUS.md`)) missing.push('STATUS.md')
  if (!queued.has(`${sessionDir}/LESSONS.md`)) missing.push('LESSONS.md')
  if (missing.length === 0) return null

  return `Warning: wrote a non-trivial ${sessionDir}/PLAN.md but did not also create/update ${missing
    .map((m) => `${sessionDir}/${m}`)
    .join(' and ')}. Durable plan sessions are most useful when STATUS.md and LESSONS.md are kept in sync. Update them with create_plan so STATUS.md/LESSONS.md stay in lockstep with PLAN.md.`
}

export const handleCreatePlan = (async (params: {
  previousToolCallFinished: Promise<void>
  toolCall: CodebuffToolCall<'create_plan'>

  fileProcessingState: FileProcessingState
  logger: Logger

  requestClientToolCall: (
    toolCall: ClientToolCall<'create_plan'>,
  ) => Promise<CodebuffToolOutput<'create_plan'>>
  writeToClient: (chunk: string) => void
}): Promise<{
  output: CodebuffToolOutput<'create_plan'>
}> => {
  const {
    fileProcessingState,
    logger,
    previousToolCallFinished,
    toolCall,
    requestClientToolCall,
    writeToClient,
  } = params
  const { path, plan } = toolCall.input

  logger.debug(
    {
      path,
      plan,
    },
    'Create plan',
  )

  const pathError = validatePlanArtifactPath(path)
  if (pathError) {
    logger.warn({ path }, 'Rejected create_plan path')
    await previousToolCallFinished
    return {
      output: [
        {
          type: 'json',
          value: {
            file: path,
            errorMessage: pathError,
          },
        },
      ] as CodebuffToolOutput<'create_plan'>,
    }
  }

  const warning = buildMissingCompanionWarning({
    planPath: path,
    planContent: plan,
    queuedPaths: Object.keys(fileProcessingState.promisesByPath),
  })

  // Add the plan file to the processing queue
  const change = {
    tool: 'create_plan' as const,
    path,
    content: plan,
    messages: warning ? [warning] : [],
    toolCallId: toolCall.toolCallId,
  }
  const changePromise = Promise.resolve(change)
  if (!fileProcessingState.promisesByPath[path]) {
    fileProcessingState.promisesByPath[path] = []
  }
  fileProcessingState.promisesByPath[path].push(changePromise)
  fileProcessingState.allPromises.push(changePromise)

  await previousToolCallFinished
  return {
    output: await postStreamProcessing<'create_plan'>(
      change,
      fileProcessingState,
      writeToClient,
      requestClientToolCall,
    ),
  }
}) satisfies CodebuffToolHandlerFunction<'create_plan'>
