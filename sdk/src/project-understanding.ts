/**
 * The client half of project understanding (docs/freebuff-project-understanding.md):
 * ask the backend whether a run is due and for its template, count the
 * project's files, run the project-understanding agent, and report the result.
 *
 * Surface-agnostic: the caller hands in how to run an agent and how to count
 * files. Desktop runs it with its own client on the user's machine; a host
 * whose files live elsewhere (a Cloud sandbox) would pass its own tools. Everything here fails soft — a
 * run is background work and never surfaces an error to anyone.
 */
import { FREEBUFF_ACTING_USER_HEADER } from '@codebuff/common/constants/freebuff-models'
import {
  PROJECT_UNDERSTANDING_MAX_AGENT_STEPS,
  buildProjectUnderstandingAgent,
  buildProjectUnderstandingPrompt,
} from '@codebuff/common/project-understanding/agent'
import {
  PROJECT_STATS_READ_LIMITS,
  computeProjectStats,
  countLines,
  shouldCountLines,
} from '@codebuff/common/project-understanding/stats'
import {
  normalizeProjectUnderstanding,
  projectUnderstandingTemplateSchema,
} from '@codebuff/common/project-understanding/template'
import { getErrorObject } from '@codebuff/common/util/error'
import z from 'zod/v4'

import { getWebsiteUrl } from './constants'

import type { AgentDefinition } from '@codebuff/common/templates/initial-agents-dir/types/agent-definition'
import type { Logger } from '@codebuff/common/types/contracts/logger'
import type {
  ProjectStats,
  ProjectStatsFile,
} from '@codebuff/common/project-understanding/stats'
import type {
  ProjectUnderstanding,
  ProjectUnderstandingTemplate,
} from '@codebuff/common/project-understanding/template'

export const PROJECT_UNDERSTANDING_PATH = '/api/v1/project-understanding'

/** A whole run, from the due check to the report. */
export const PROJECT_UNDERSTANDING_TIMEOUT_MS = 180_000

const dueResponseSchema = z.object({
  due: z.boolean(),
  template: z.unknown().nullable(),
})

/** What the due check found. `check_failed` (a non-OK answer, a network
 *  error, a body or template that does not parse) is not `not_due`: the
 *  backend never said the project was up to date. */
export type ProjectUnderstandingDueCheck =
  | { status: 'due'; template: ProjectUnderstandingTemplate }
  | { status: 'not_due' }
  | { status: 'check_failed' }

export type ProjectUnderstandingApi = {
  /** Whether a run is due, with the template to fill when it is. May throw;
   *  a throw counts as `check_failed`. */
  checkDue: (params: {
    signal: AbortSignal
    logger: Logger
  }) => Promise<ProjectUnderstandingDueCheck>
  report: (params: {
    templateVersion: number
    profile: ProjectUnderstanding
    stats: ProjectStats
    signal: AbortSignal
    logger: Logger
  }) => Promise<boolean>
}

export function createProjectUnderstandingClient(params: {
  apiKey: string
  /** The acting user, when the caller is the Freebuff Web service account. */
  userId?: string
  projectKey: string
  surface: string
  baseUrl?: string
}): ProjectUnderstandingApi {
  const baseUrl = params.baseUrl ?? getWebsiteUrl()
  const headers = {
    Authorization: `Bearer ${params.apiKey}`,
    'Content-Type': 'application/json',
    ...(params.userId ? { [FREEBUFF_ACTING_USER_HEADER]: params.userId } : {}),
  }
  return {
    checkDue: async ({ signal, logger }) => {
      const url = new URL(PROJECT_UNDERSTANDING_PATH, baseUrl)
      url.searchParams.set('project_key', params.projectKey)
      url.searchParams.set('surface', params.surface)
      const response = await fetch(url, { headers, signal })
      if (!response.ok) {
        logger.warn(
          { status: response.status, metric: 'project_understanding_due_failed' },
          'Project understanding due check failed',
        )
        return { status: 'check_failed' }
      }
      const body = dueResponseSchema.safeParse(
        await response.json().catch(() => undefined),
      )
      if (!body.success) {
        logger.warn(
          { metric: 'project_understanding_due_invalid' },
          'Project understanding due answer did not parse',
        )
        return { status: 'check_failed' }
      }
      if (!body.data.due) return { status: 'not_due' }
      const template = projectUnderstandingTemplateSchema.safeParse(
        body.data.template,
      )
      if (!template.success) {
        logger.warn(
          { metric: 'project_understanding_template_invalid' },
          'Project understanding template did not parse',
        )
        return { status: 'check_failed' }
      }
      return { status: 'due', template: template.data }
    },
    report: async ({ templateVersion, profile, stats, signal, logger }) => {
      const response = await fetch(new URL(PROJECT_UNDERSTANDING_PATH, baseUrl), {
        method: 'POST',
        headers,
        signal,
        body: JSON.stringify({
          projectKey: params.projectKey,
          surface: params.surface,
          templateVersion,
          profile,
          stats,
        }),
      })
      if (!response.ok) {
        logger.warn(
          { status: response.status, metric: 'project_understanding_report_failed' },
          'Project understanding report failed',
        )
      }
      return response.ok
    },
  }
}

export type RunProjectUnderstandingAgent = (params: {
  agent: AgentDefinition
  prompt: string
  maxAgentSteps: number
  signal: AbortSignal
}) => Promise<{ output?: { type: string; value?: unknown } } | undefined>

export type ProjectUnderstandingOutcome =
  /** The backend answered `due: false`. */
  | 'not_due'
  /** The due check itself failed, so nothing ran (ProjectUnderstandingDueCheck). */
  | 'check_failed'
  | 'reported'
  | 'no_output'
  | 'report_failed'
  | 'failed'

/**
 * One run, start to finish. Asks first, so a project that is not due costs
 * one GET and nothing else: no file counting, no model call.
 */
export async function understandProject(params: {
  api: ProjectUnderstandingApi
  countFiles: (signal: AbortSignal) => Promise<ProjectStats>
  runAgent: RunProjectUnderstandingAgent
  logger: Logger
  signal?: AbortSignal
}): Promise<ProjectUnderstandingOutcome> {
  const { api, logger } = params
  const signal = params.signal
    ? AbortSignal.any([
        params.signal,
        AbortSignal.timeout(PROJECT_UNDERSTANDING_TIMEOUT_MS),
      ])
    : AbortSignal.timeout(PROJECT_UNDERSTANDING_TIMEOUT_MS)
  try {
    let due: ProjectUnderstandingDueCheck
    try {
      due = await api.checkDue({ signal, logger })
    } catch (error) {
      logger.warn(
        {
          error: getErrorObject(error),
          metric: 'project_understanding_due_failed',
        },
        'Project understanding due check failed',
      )
      return 'check_failed'
    }
    if (due.status !== 'due') return due.status
    const { template } = due

    const stats = await params.countFiles(signal)
    const run = await params.runAgent({
      agent: buildProjectUnderstandingAgent(template),
      prompt: buildProjectUnderstandingPrompt({ template, stats }),
      maxAgentSteps: PROJECT_UNDERSTANDING_MAX_AGENT_STEPS,
      signal,
    })
    const output = run?.output
    if (output?.type !== 'structuredOutput' || output.value == null) {
      logger.warn(
        { metric: 'project_understanding_no_output', outputType: output?.type },
        'Project-understanding agent returned no answer',
      )
      return 'no_output'
    }
    // Reported even when every field is unknown: that is the answer for an
    // empty or unrecognisable project, and it stops the project being due.
    const profile = normalizeProjectUnderstanding(template, output.value)
    const ok = await api.report({
      templateVersion: template.version,
      profile,
      stats,
      signal,
      logger,
    })
    return ok ? 'reported' : 'report_failed'
  } catch (error) {
    logger.warn(
      { error: getErrorObject(error), metric: 'project_understanding_failed' },
      'Project understanding failed',
    )
    return 'failed'
  }
}

/**
 * Count a project's files from a listing, reading the ones worth counting
 * lines in under PROJECT_STATS_READ_LIMITS. `readFile` returns `null` for a
 * file it could not read (or that is too large, when it can tell from size).
 */
export async function countProjectFiles(params: {
  paths: readonly string[]
  fileCountIsLowerBound: boolean
  readFile: (path: string) => Promise<string | null>
  signal?: AbortSignal
}): Promise<ProjectStats> {
  const limits = PROJECT_STATS_READ_LIMITS
  const files: ProjectStatsFile[] = []
  let reads = 0
  let bytes = 0
  for (const path of params.paths) {
    if (params.signal?.aborted) break
    if (
      !shouldCountLines(path) ||
      reads >= limits.maxFiles ||
      bytes >= limits.maxTotalBytes
    ) {
      files.push({ path })
      continue
    }
    reads++
    const content = await params.readFile(path).catch(() => null)
    if (content === null || content.length > limits.maxFileBytes) {
      files.push({ path })
      continue
    }
    bytes += content.length
    files.push({ path, lines: countLines(content) })
  }
  return computeProjectStats({
    files,
    fileCountIsLowerBound: params.fileCountIsLowerBound,
  })
}
