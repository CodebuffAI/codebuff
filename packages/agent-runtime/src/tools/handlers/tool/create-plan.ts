import {
  getSessionDirForArtifact,
  isSessionPlanPath,
  normalizePlanPath,
  validatePlanArtifactPath as sharedValidatePlanArtifactPath,
} from '@codebuff/common/util/plan-artifacts'

import { postStreamProcessing } from './write-file'

import type { CodebuffToolHandlerFunction } from '../handler-function-type'
import type { FileProcessingState } from './write-file'
import type {
  ClientToolCall,
  CodebuffToolCall,
  CodebuffToolOutput,
} from '@codebuff/common/tools/list'
import type { Logger } from '@codebuff/common/types/contracts/logger'

const TASK_MARKER_RE = /^\s*[-*]\s*\[[ xX]\]/gm
const NONTRIVIAL_CONTENT_LENGTH = 500

/**
 * Validate a create_plan path. Delegates to the centralized durable plan
 * artifact policy in @codebuff/common.
 */
export function validatePlanArtifactPath(path: string): string | null {
  return sharedValidatePlanArtifactPath(path)
}

/**
 * Decide whether a create_plan write to a durable session PLAN.md is
 * "non-trivial" enough that missing companion artifacts should be flagged.
 *
 * Heuristic: multiple task/status checkbox markers OR long enough content.
 */
export function isNonTrivialSessionPlan(
  path: string,
  content: string,
): boolean {
  if (!isSessionPlanPath(path)) return false
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
  const sessionDir = getSessionDirForArtifact(params.planPath)
  if (!sessionDir) return null
  if (!isNonTrivialSessionPlan(params.planPath, params.planContent)) return null

  const queued = new Set(params.queuedPaths.map((p) => normalizePlanPath(p)))
  const missing: string[] = []
  if (!queued.has(`${sessionDir}/STATUS.md`)) missing.push('STATUS.md')
  if (!queued.has(`${sessionDir}/LESSONS.md`)) missing.push('LESSONS.md')
  if (missing.length === 0) return null

  return `Warning: wrote a non-trivial ${sessionDir}/PLAN.md but did not also create/update ${missing
    .map((m) => `${sessionDir}/${m}`)
    .join(
      ' and ',
    )}. Durable plan sessions are most useful when STATUS.md and LESSONS.md are kept in sync. Update them with create_plan so STATUS.md/LESSONS.md stay in lockstep with PLAN.md.`
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
