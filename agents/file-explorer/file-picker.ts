import { publisher } from '../constants'
import {
  PLACEHOLDER,
  type SecretAgentDefinition,
} from '../types/secret-agent-definition'

import type { StepText, ToolCall } from '../types/agent-definition'

export const createFilePicker = (): Omit<SecretAgentDefinition, 'id'> => {
  return {
    displayName: 'Fletcher the File Fetcher',
    publisher,
    reasoningOptions: {
      enabled: false,
      effort: 'low',
      exclude: false,
    },
    spawnerPrompt:
      'Spawn to find relevant files in a codebase related to the prompt. Outputs up to 12 file paths with short summaries for each file. Cannot do string searches on the codebase, but does a fuzzy search. Unless you know which directories are relevant, omit the directories parameter. This agent is extremely effective at finding files in the codebase that could be relevant to the prompt.',
    inputSchema: {
      prompt: {
        type: 'string',
        description:
          'A description of the files you need to find. Be more broad for better results: instead of "Find x file" say "Find x file and related files". This agent is designed to help you find several files that could be relevant to the prompt.',
      },
      params: {
        type: 'object' as const,
        properties: {
          directories: {
            type: 'array' as const,
            items: { type: 'string' as const },
            description:
              'Optional list of paths to directories to look within. If omitted, the entire project tree is used.',
          },
        },
        required: [],
      },
    },
    outputMode: 'last_message',
    includeMessageHistory: false,
    toolNames: ['spawn_agents'],
    spawnableAgents: ['file-lister'],

    systemPrompt: `You are an expert at finding relevant files in a codebase. ${PLACEHOLDER.FILE_TREE_PROMPT}`,
    instructionsPrompt: `Instructions:
Provide an extremely short report of the locations in the codebase that could be helpful. Focus on the files that are most relevant to the user prompt.
In your report, please give a very concise analysis that includes the full paths of files that are relevant and (extremely briefly) how they could be useful.

Do not use any further tools or spawn any further agents.
  `.trim(),

    handleSteps,
  }
}

/**
 * Extract the raw spawn_agents results from the toolResult wrapper.
 * The spawn_agents tool returns results as [{type: 'json', value: [...]}].
 * This extracts the inner value from each spawned agent result.
 */
function extractSpawnResults(results: any[] | undefined): any[] {
  if (!results || results.length === 0) return []
  const jsonResult = results.find((r) => r.type === 'json')
  if (!jsonResult?.value) return []
  const spawnedResults = Array.isArray(jsonResult.value)
    ? jsonResult.value
    : [jsonResult.value]
  return spawnedResults.map((result: any) => result?.value).filter(Boolean)
}

/**
 * Extract text content from a spawned agent's output, handling multiple
 * output formats that the agent runtime may produce:
 * - lastMessage / allMessages: traverses message array for assistant text
 * - structuredOutput: extracts string value or text-containing fields
 * - Direct strings: raw string output
 */
function extractAgentText(agentOutput: any): string | null {
  if (!agentOutput) return null

  // Direct string value
  if (typeof agentOutput === 'string') return agentOutput

  // lastMessage / allMessages format — traverse messages for assistant text
  if (
    (agentOutput.type === 'lastMessage' || agentOutput.type === 'allMessages') &&
    Array.isArray(agentOutput.value)
  ) {
    for (let i = agentOutput.value.length - 1; i >= 0; i--) {
      const message = agentOutput.value[i]
      if (message.role === 'assistant' && Array.isArray(message.content)) {
        for (const part of message.content) {
          if (part.type === 'text' && typeof part.text === 'string') {
            return part.text
          }
        }
      }
    }
  }

  // structuredOutput format — value may be a string or object with text fields
  if (agentOutput.type === 'structuredOutput') {
    if (typeof agentOutput.value === 'string') return agentOutput.value
    if (isObject(agentOutput.value)) {
      for (const key of ['message', 'text', 'content', 'output', 'response']) {
        const val = agentOutput.value[key]
        if (typeof val === 'string' && val) return val
      }
    }
  }

  return null
}

function extractErrorMessage(agentOutput: any): string | null {
  if (!agentOutput) return null
  if (agentOutput.type === 'error') {
    return agentOutput.message ?? agentOutput.value ?? null
  }
  return null
}

function isObject(value: any): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/**
 * Process spawn_agents results from a file-lister agent into file paths.
 * Pure function — does not yield, so it survives .toString() serialization.
 */
function processSpawnResults(
  spawnResults: any[],
): { paths: string[]; hasResults: boolean; errorText: string | null; debugMessage: string | null } {
  const allPaths = new Set<string>()
  let hasResults = false
  let debugMessage: string | null = null

  for (const result of spawnResults) {
    const fileListText = extractAgentText(result)
    if (fileListText) {
      hasResults = true
      const paths = fileListText.split('\n').filter(Boolean)
      for (const path of paths) {
        allPaths.add(path)
      }
    }
  }

  if (hasResults) {
    return {
      paths: Array.from(allPaths),
      hasResults: true,
      errorText: null,
      debugMessage: null,
    }
  }

  const errorText = spawnResults
    .map(extractErrorMessage)
    .filter(Boolean)
    .join('; ') || null

  if (spawnResults.length > 0) {
    debugMessage = `failed to extract text from spawned results (types: ${spawnResults.map((r: any) => r?.type).filter(Boolean).join(', ')})`
  }

  return { paths: [], hasResults: false, errorText, debugMessage }
}

const handleSteps: SecretAgentDefinition['handleSteps'] = function* ({
  prompt,
  params,
  logger,
}) {
  const extractSpawnResults = (results: any[] | undefined): any[] => {
    if (!results || results.length === 0) return []
    const jsonResult = results.find((r) => r.type === 'json')
    if (!jsonResult?.value) return []
    const spawnedResults = Array.isArray(jsonResult.value)
      ? jsonResult.value
      : [jsonResult.value]
    return spawnedResults.map((result: any) => result?.value).filter(Boolean)
  }
  const isObject = (value: any): value is Record<string, unknown> =>
    value !== null && typeof value === 'object' && !Array.isArray(value)
  const extractAgentText = (agentOutput: any): string | null => {
    if (!agentOutput) return null
    if (typeof agentOutput === 'string') return agentOutput
    if (
      (agentOutput.type === 'lastMessage' || agentOutput.type === 'allMessages') &&
      Array.isArray(agentOutput.value)
    ) {
      for (let i = agentOutput.value.length - 1; i >= 0; i--) {
        const message = agentOutput.value[i]
        if (message.role === 'assistant' && Array.isArray(message.content)) {
          for (const part of message.content) {
            if (part.type === 'text' && typeof part.text === 'string') {
              return part.text
            }
          }
        }
      }
    }
    if (agentOutput.type === 'structuredOutput') {
      if (typeof agentOutput.value === 'string') return agentOutput.value
      if (isObject(agentOutput.value)) {
        for (const key of ['message', 'text', 'content', 'output', 'response']) {
          const val = agentOutput.value[key]
          if (typeof val === 'string' && val) return val
        }
      }
    }
    return null
  }
  const extractErrorMessage = (agentOutput: any): string | null => {
    if (!agentOutput) return null
    if (agentOutput.type === 'error') {
      return agentOutput.message ?? agentOutput.value ?? null
    }
    return null
  }
  const processSpawnResults = (
    spawnResults: any[],
  ): { paths: string[]; hasResults: boolean; errorText: string | null; debugMessage: string | null } => {
    const allPaths = new Set<string>()
    let hasResults = false
    let debugMessage: string | null = null
    for (const result of spawnResults) {
      const fileListText = extractAgentText(result)
      if (fileListText) {
        hasResults = true
        const paths = fileListText.split('\n').filter(Boolean)
        for (const path of paths) {
          allPaths.add(path)
        }
      }
    }
    if (hasResults) {
      return { paths: Array.from(allPaths), hasResults: true, errorText: null, debugMessage: null }
    }
    const errorText = spawnResults.map(extractErrorMessage).filter(Boolean).join('; ') || null
    if (spawnResults.length > 0) {
      debugMessage = `failed to extract text from spawned results (types: ${spawnResults.map((r: any) => r?.type).filter(Boolean).join(', ')})`
    }
    return { paths: [], hasResults: false, errorText, debugMessage }
  }
  // C1.9: Lexical project-root containment for paths returned by spawned
  // file-lister agents. Rejects path traversal (..) and absolute paths outside
  // the project root before handing paths to read_files. Defense in depth on
  // top of the SDK's read_files backend validation. Uses process.cwd() since
  // handleSteps is serialized and cannot import helpers.
  const isSafeProjectPath = (rawPath: string): boolean => {
    if (typeof rawPath !== 'string' || rawPath.length === 0) return false
    const trimmed = rawPath.trim()
    if (trimmed.length === 0) return false
    // Reject any path containing parent-directory traversal.
    if (trimmed.includes('..')) return false
    // Reject Windows-style traversal too.
    if (trimmed.includes('\\..') || trimmed.includes('..\\')) return false
    // Absolute paths are only allowed if they're inside the project root.
    if (trimmed.startsWith('/') || /^[A-Za-z]:[\\/]/.test(trimmed)) {
      const cwd =
        typeof process.cwd === 'function' ? process.cwd() : ''
      if (!cwd) return false
      const normalized = trimmed.replace(/\\/g, '/')
      const projectRoot = cwd.replace(/\\/g, '/').replace(/\/+$/, '')
      return normalized === projectRoot || normalized.startsWith(projectRoot + '/')
    }
    return true
  }
  const { toolResult: fileListerResults } = yield {
    toolName: 'spawn_agents',
    input: {
      agents: [
        {
          agent_type: 'file-lister',
          prompt: prompt ?? '',
          params: params ?? {},
        },
      ],
    },
  } satisfies ToolCall

  const spawnResults = extractSpawnResults(fileListerResults)
  const { paths: rawPaths, hasResults, errorText, debugMessage } =
    processSpawnResults(spawnResults)
  // Filter out unsafe paths before read_files (C1.9).
  const paths = rawPaths.filter(isSafeProjectPath)
  const droppedCount = rawPaths.length - paths.length
  if (droppedCount > 0) {
    logger?.debug?.(`file-picker: dropped ${droppedCount} path(s) outside project root or containing traversal`)
  }

  if (!hasResults) {
    if (debugMessage) {
      logger?.debug?.(`file-picker: ${debugMessage}`)
    }
    yield {
      type: 'STEP_TEXT',
      text: errorText
        ? `Error from file-lister(s): ${errorText}`
        : 'Error: Could not extract file list from spawned agent(s)',
    } satisfies StepText
    return
  }

  // M2.2: relevance scoring + ordered top-N. Score each candidate path by how
  // many prompt keywords appear in it (path-relative relevance), then cap at
  // MAX_PICKER_FILES (12, matching the spawner prompt's advertised limit).
  // Deterministic and serialization-safe (no module-level closure deps).
  const MAX_PICKER_FILES = 12
  const scorePathsByPromptRelevance = (
    candidatePaths: string[],
    query: string | undefined,
  ): { path: string; score: number }[] => {
    const keywords =
      (query ?? '').toLowerCase().match(/[a-z0-9]{3,}/g) ?? []
    const uniqueKeywords = Array.from(new Set(keywords))
    const scored = candidatePaths.map((p) => {
      const lower = p.toLowerCase()
      let score = 0
      for (const kw of uniqueKeywords) {
        if (lower.includes(kw)) score += 1
      }
      return { path: p, score }
    })
    scored.sort(
      (a, b) =>
        b.score - a.score || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0),
    )
    return scored
  }
  const scoredPaths = scorePathsByPromptRelevance(paths, prompt)
  const orderedPaths = scoredPaths.slice(0, MAX_PICKER_FILES).map((s) => s.path)
  if (paths.length > MAX_PICKER_FILES) {
    logger?.debug?.(
      `file-picker: capped ${paths.length} candidate(s) to top ${MAX_PICKER_FILES} by prompt relevance`,
    )
  }

  yield {
    toolName: 'read_files',
    input: { paths: orderedPaths },
  }

  yield 'STEP'
}

const definition: SecretAgentDefinition = {
  id: 'file-picker',
  ...createFilePicker(),
}

export { extractSpawnResults, extractAgentText, extractErrorMessage, isObject }
export default definition
