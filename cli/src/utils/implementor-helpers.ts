import type {
  AgentContentBlock,
  ContentBlock,
  ToolContentBlock,
} from '../types/chat'

export const IMPLEMENTOR_AGENT_IDS = [
  'editor-implementor',
  'editor-implementor-opus',
  'editor-implementor-gemini',
  'editor-implementor-gpt-5',
  'editor-implementor-proposal-',
] as const

/** All edit tool names (both direct and proposed variants) */
const ALL_EDIT_TOOL_NAMES = [
  'str_replace',
  'write_file',
  'propose_str_replace',
  'propose_write_file',
  'edit_transaction',
  'propose_edit_transaction',
] as const

/** Transaction tool names that return a multi-file `{ files: [...] }` result. */
const TRANSACTION_TOOL_NAMES = [
  'edit_transaction',
  'propose_edit_transaction',
] as const

const isTransactionToolName = (
  toolName: ToolContentBlock['toolName'],
): boolean =>
  TRANSACTION_TOOL_NAMES.includes(
    getBaseToolName(toolName) as (typeof TRANSACTION_TOOL_NAMES)[number],
  )

/**
 * Extract per-file { path, diff } entries from a transaction tool block.
 * edit_transaction files carry { path, patch }; propose_edit_transaction files
 * carry { file, unifiedDiff }. A failed transaction result has no files array.
 */
function extractTransactionFiles(
  toolBlock: ToolContentBlock,
): Array<{ path: string; diff: string | null }> {
  const outputRaw = toolBlock.outputRaw as unknown
  const value =
    Array.isArray(outputRaw) && outputRaw[0]?.value
      ? (outputRaw[0].value as Record<string, unknown>)
      : typeof outputRaw === 'object' && outputRaw !== null
        ? (outputRaw as Record<string, unknown>)
        : null
  if (!value || typeof value.errorMessage === 'string') return []
  if (!Array.isArray(value.files)) return []

  return value.files
    .map((file) => {
      const entry = file as Record<string, unknown>
      const path =
        typeof entry.path === 'string'
          ? entry.path
          : typeof entry.file === 'string'
            ? entry.file
            : ''
      if (!path) return null
      const diff =
        typeof entry.patch === 'string'
          ? entry.patch
          : typeof entry.unifiedDiff === 'string'
            ? entry.unifiedDiff
            : null
      return { path, diff }
    })
    .filter((entry): entry is { path: string; diff: string | null } =>
      Boolean(entry),
    )
}

const isProposedToolName = (toolName: ToolContentBlock['toolName']): boolean =>
  typeof toolName === 'string' && toolName.startsWith('propose_')

/** Whether a content block is an edit tool block (direct or proposed). */
export function isEditToolBlock(block: ContentBlock): boolean {
  return (
    block.type === 'tool' &&
    ALL_EDIT_TOOL_NAMES.includes(
      block.toolName as (typeof ALL_EDIT_TOOL_NAMES)[number],
    )
  )
}

/**
 * Unwrap an editor proposal/implementor agent's structured set_output value to
 * the object that actually carries `toolCalls`.
 *
 * The spawn result can arrive wrapped in several layers depending on the
 * agent's output mode and runtime envelope, e.g.
 *   { toolCalls, ... }                                 // direct
 *   { value: { toolCalls, ... } }                      // one level deep
 *   { type: 'structuredOutput', value: { toolCalls } } // structuredOutput mode
 *   { type: 'structuredOutput', value: { value: {...} } }
 *   { data: { toolCalls, ... } }                       // set_output data shape
 * The live run showed proposal cards rendering "no changes" because the result
 * arrived structuredOutput-wrapped and the single-level unwrap missed the
 * nested toolCalls. Walk the common wrapper keys to a bounded depth so any of
 * these shapes resolves to the object holding toolCalls.
 */
function unwrapStructuredProposalOutput(
  resultValue: unknown,
  depth = 0,
): Record<string, unknown> | null {
  if (depth > 4 || !resultValue || typeof resultValue !== 'object') return null
  const obj = resultValue as Record<string, unknown>
  if (Array.isArray(obj.toolCalls)) return obj

  for (const key of ['value', 'data'] as const) {
    if (obj[key] && typeof obj[key] === 'object') {
      const nested = unwrapStructuredProposalOutput(obj[key], depth + 1)
      if (nested) return nested
    }
  }
  return null
}

/**
 * A normalized per-file proposal result extracted from the implementor's
 * structured output. `file` is the changed path; `value` is the json payload
 * that extractDiff/extractFilePath/extractTransactionFiles already understand.
 */
type NormalizedProposalResult = {
  file: string
  value: Record<string, unknown>
}

/** Pull the file path out of a proposal tool call's input. */
function proposalToolCallFile(input: Record<string, unknown>): string | null {
  for (const key of ['path', 'file_path', 'file', '__proposalFile'] as const) {
    const candidate = input[key]
    if (typeof candidate === 'string' && candidate) return candidate
  }
  return null
}

/** Whether a normalized result actually carries a renderable diff. */
function resultHasDiff(value: Record<string, unknown>): boolean {
  return (
    (typeof value.unifiedDiff === 'string' &&
      value.unifiedDiff.trim() !== '') ||
    (typeof value.patch === 'string' && value.patch.trim() !== '') ||
    Array.isArray(value.files)
  )
}

/**
 * Build a file -> diff-bearing-result map from the implementor's `toolResults`.
 *
 * The implementor's `toolCalls` (successful only) and `toolResults` (successful
 * PLUS genuine failures) are compiled from different filters, so pairing them
 * by array index silently mismatches a successful call with a diff-less failed
 * result and the card renders "no changes". Pairing by file path is
 * index-independent and only keeps results that carry a real diff.
 */
function indexProposalResultsByFile(
  toolResults: unknown[],
): Map<string, Record<string, unknown>> {
  const byFile = new Map<string, Record<string, unknown>>()
  for (const rawResult of toolResults) {
    const entry = Array.isArray(rawResult) ? rawResult[0] : rawResult
    if (!entry || typeof entry !== 'object') continue
    const value = entry as Record<string, unknown>
    const file =
      typeof value.file === 'string'
        ? value.file
        : typeof value.path === 'string'
          ? value.path
          : null
    if (!file) continue
    // Prefer a diff-bearing result; never let a later failed-only result for
    // the same file overwrite a captured successful diff.
    if (byFile.has(file) && !resultHasDiff(value)) continue
    byFile.set(file, value)
  }
  return byFile
}

/**
 * Parse the implementor's `unifiedDiffs` string into per-file entries.
 *
 * `summarizeLedger` always concatenates successful proposal diffs as
 * `--- <path> ---\n<diff>` blocks joined by blank lines. This is the
 * authoritative, always-present signal for what changed, so it is the
 * reliable fallback when `toolCalls`/`toolResults` are missing or misaligned.
 */
function parseUnifiedDiffsString(
  unifiedDiffs: unknown,
): NormalizedProposalResult[] {
  if (typeof unifiedDiffs !== 'string' || unifiedDiffs.trim() === '') return []

  const entries: NormalizedProposalResult[] = []
  const headerRegex = /^--- (.+?) ---$/
  let currentFile: string | null = null
  let currentLines: string[] = []

  const flush = () => {
    if (currentFile && currentLines.length > 0) {
      const diff = currentLines.join('\n').trim()
      if (diff) {
        entries.push({
          file: currentFile,
          value: { file: currentFile, unifiedDiff: diff },
        })
      }
    }
    currentLines = []
  }

  for (const line of unifiedDiffs.split('\n')) {
    const headerMatch = line.match(headerRegex)
    if (headerMatch) {
      flush()
      currentFile = headerMatch[1].trim()
      continue
    }
    if (currentFile) currentLines.push(line)
  }
  flush()

  return entries
}

function unwrapStructuredObject(
  resultValue: unknown,
  depth = 0,
): Record<string, unknown> | null {
  if (depth > 4 || !resultValue || typeof resultValue !== 'object') return null
  const obj = resultValue as Record<string, unknown>

  if (obj.type === 'structuredOutput' && obj.value) {
    return unwrapStructuredObject(obj.value, depth + 1)
  }

  if (
    obj.value &&
    typeof obj.value === 'object' &&
    Object.keys(obj).every((key) => key === 'value' || key === 'type')
  ) {
    return unwrapStructuredObject(obj.value, depth + 1)
  }

  return obj
}

/**
 * Synthesize edit tool blocks from a proposal/implementor agent's structured
 * output (`{ toolCalls, toolResults, unifiedDiffs }`).
 *
 * Proposal agents can finish without ever streaming live tool blocks, so the
 * card has nothing to render and falsely shows "no changes" even though the
 * structured output already knows which files changed. This makes the card
 * deterministic: if the structured result lists edits, the card shows them.
 *
 * Results are paired to calls by FILE PATH (not array index) because the
 * implementor compiles `toolCalls` and `toolResults` from different filters.
 * When no call has a diff-bearing result, the always-present `unifiedDiffs`
 * string is parsed as the authoritative fallback.
 */
export function synthesizeProposalToolBlocks(
  resultValue: unknown,
): ToolContentBlock[] {
  const value = unwrapStructuredProposalOutput(resultValue)
  if (!value) return []

  const toolCalls = Array.isArray(value.toolCalls) ? value.toolCalls : []
  const toolResults = Array.isArray(value.toolResults) ? value.toolResults : []
  const resultsByFile = indexProposalResultsByFile(toolResults)

  const blocks: ToolContentBlock[] = []
  const coveredFiles = new Set<string>()
  let anyBlockHasDiff = false

  toolCalls.forEach((toolCall, index) => {
    if (!toolCall || typeof toolCall !== 'object') return
    const toolName = (toolCall as Record<string, unknown>).toolName
    if (typeof toolName !== 'string') return
    const input =
      ((toolCall as Record<string, unknown>).input as Record<
        string,
        unknown
      >) ?? {}

    // Pair by file path so a successful call is never matched to a diff-less
    // failed result. Fall back to index pairing only when the call carries no
    // discoverable file path (e.g. propose_edit_transaction with edits[]).
    const file = proposalToolCallFile(input)
    let matched = file ? resultsByFile.get(file) : undefined
    if (!matched) {
      const rawResult = toolResults[index]
      const firstEntry = Array.isArray(rawResult) ? rawResult[0] : rawResult
      if (firstEntry && typeof firstEntry === 'object') {
        matched = firstEntry as Record<string, unknown>
      }
    }

    const outputValue =
      matched && isTransactionToolName(toolName as ToolContentBlock['toolName'])
        ? normalizeTransactionResultForRendering(matched, file)
        : matched
    const outputRaw = outputValue
      ? [{ type: 'json', value: outputValue }]
      : undefined
    if (file) coveredFiles.add(file)
    if (matched && resultHasDiff(matched)) anyBlockHasDiff = true

    blocks.push({
      type: 'tool',
      toolCallId: `synthetic-proposal-${index}`,
      toolName: toolName as ToolContentBlock['toolName'],
      input,
      ...(outputRaw ? { outputRaw } : {}),
    })
  })

  // Authoritative fallback: if the tool calls produced no diff-bearing blocks
  // (empty/misaligned/diff-less), synthesize from the unifiedDiffs string so
  // the card still shows the real changes instead of "no changes".
  if (!anyBlockHasDiff) {
    for (const entry of parseUnifiedDiffsString(value.unifiedDiffs)) {
      if (coveredFiles.has(entry.file)) continue
      coveredFiles.add(entry.file)
      blocks.push({
        type: 'tool',
        toolCallId: `synthetic-proposal-diff-${blocks.length}`,
        toolName: 'propose_str_replace',
        input: { path: entry.file },
        outputRaw: [{ type: 'json', value: entry.value }],
      })
    }
  }

  return blocks
}

type MultiPromptProposalRenderEntry = {
  id?: string
  label?: string
  strategy?: string
  status?: string
  toolCalls?: unknown[]
  toolResults?: unknown[]
  unifiedDiffs?: string
}

const getProposalRenderEntries = (
  resultValue: unknown,
): MultiPromptProposalRenderEntry[] => {
  const value = unwrapStructuredObject(resultValue)
  if (!value) return []

  const proposalSummary =
    value.proposalSummary &&
    typeof value.proposalSummary === 'object' &&
    !Array.isArray(value.proposalSummary)
      ? (value.proposalSummary as Record<string, unknown>)
      : null
  const rawProposals = Array.isArray(proposalSummary?.proposals)
    ? proposalSummary.proposals
    : Array.isArray(value.proposals)
      ? value.proposals
      : []

  return rawProposals
    .filter(
      (proposal): proposal is MultiPromptProposalRenderEntry =>
        Boolean(proposal) &&
        typeof proposal === 'object' &&
        !Array.isArray(proposal),
    )
    .filter(
      (proposal) =>
        Array.isArray(proposal.toolCalls) ||
        Array.isArray(proposal.toolResults) ||
        (typeof proposal.unifiedDiffs === 'string' &&
          proposal.unifiedDiffs.trim() !== ''),
    )
}

export function synthesizeMultiPromptProposalAgentBlocks(
  resultValue: unknown,
): AgentContentBlock[] {
  return getProposalRenderEntries(resultValue).flatMap((proposal, index) => {
    const toolBlocks = synthesizeProposalToolBlocks({
      toolCalls: Array.isArray(proposal.toolCalls) ? proposal.toolCalls : [],
      toolResults: Array.isArray(proposal.toolResults)
        ? proposal.toolResults
        : [],
      unifiedDiffs: proposal.unifiedDiffs,
    })
    if (toolBlocks.length === 0) return []

    const label =
      typeof proposal.label === 'string' && proposal.label.trim()
        ? proposal.label.trim()
        : `Proposal #${index + 1}`
    const strategy =
      typeof proposal.strategy === 'string' ? proposal.strategy : ''
    const id =
      typeof proposal.id === 'string' && proposal.id.trim()
        ? proposal.id.trim()
        : String(index + 1)

    return [
      {
        type: 'agent',
        agentId: `multi-prompt-proposal-${id}`,
        agentName: label,
        agentType: 'editor-implementor-proposal-direct',
        content: '',
        status: proposal.status === 'unusable' ? 'failed' : 'complete',
        blocks: toolBlocks,
        initialPrompt: strategy,
        params: {
          proposalLabel: label,
          proposalOrdinal: index + 1,
          proposalStrategy: strategy,
          proposalPhase: 'initial',
        },
      },
    ]
  })
}

function normalizeTransactionResultForRendering(
  result: Record<string, unknown>,
  fallbackFile: string | null,
): Record<string, unknown> {
  if (Array.isArray(result.files) || !resultHasDiff(result)) return result

  const file =
    typeof result.file === 'string'
      ? result.file
      : typeof result.path === 'string'
        ? result.path
        : fallbackFile
  if (!file) return result

  return {
    message:
      typeof result.message === 'string'
        ? result.message
        : `Proposed changes to ${file}`,
    files: [
      {
        file,
        ...(typeof result.unifiedDiff === 'string'
          ? { unifiedDiff: result.unifiedDiff }
          : {}),
        ...(typeof result.patch === 'string' ? { patch: result.patch } : {}),
        ...(typeof result.message === 'string'
          ? { messages: [result.message] }
          : {}),
      },
    ],
  }
}

const getBaseToolName = (toolName: ToolContentBlock['toolName']): string =>
  isProposedToolName(toolName) ? toolName.slice('propose_'.length) : toolName

const SUCCESSFUL_EDIT_MESSAGES = [
  'String replace applied successfully',
  'Created file successfully',
  'Created new file',
  'Overwrote file successfully',
  'Wrote file successfully',
  'Updated file',
  'Proposed new file',
  'Proposed changes',
  'Proposed string replacement',
] as const

const hasProposedTools = (blocks?: ContentBlock[]): boolean => {
  if (!blocks || blocks.length === 0) return false

  return blocks.some(
    (block) => block.type === 'tool' && isProposedToolName(block.toolName),
  )
}

/**
 * Check if an agent is an implementor agent.
 * These agents are rendered differently (as simple status lines instead of full agent blocks).
 */
export const isImplementorAgent = (
  agentBlock: Pick<AgentContentBlock, 'agentType' | 'blocks'>,
): boolean => {
  if (hasProposedTools(agentBlock.blocks)) {
    return true
  }

  return IMPLEMENTOR_AGENT_IDS.some((id) => agentBlock.agentType.includes(id))
}

/**
 * Get the display name for an implementor agent.
 */
export const getImplementorDisplayName = (
  agentType: string,
  index?: number,
  params?: Record<string, unknown>,
): string => {
  const proposalLabel = params?.proposalLabel
  if (typeof proposalLabel === 'string' && proposalLabel.trim()) {
    return proposalLabel
  }

  const proposalOrdinal = params?.proposalOrdinal
  const proposalOrdinalNumber =
    typeof proposalOrdinal === 'number'
      ? proposalOrdinal
      : typeof proposalOrdinal === 'string' && proposalOrdinal.trim()
        ? Number(proposalOrdinal.trim())
        : undefined
  if (
    proposalOrdinalNumber !== undefined &&
    Number.isInteger(proposalOrdinalNumber) &&
    proposalOrdinalNumber > 0
  ) {
    return `Proposal #${proposalOrdinalNumber}`
  }

  const proposalMatch = agentType.match(/editor-implementor-proposal-(\d+)/)
  if (proposalMatch?.[1]) {
    return `Proposal #${proposalMatch[1]}`
  }

  let baseName = 'Implementor'
  if (agentType.includes('editor-implementor-opus')) {
    baseName = 'Opus'
  } else if (agentType.includes('editor-implementor-gemini')) {
    baseName = 'Gemini'
  } else if (agentType.includes('editor-implementor-gpt-5')) {
    baseName = 'GPT-5'
  } else if (agentType.includes('editor-implementor')) {
    baseName = 'Sonnet'
  }

  if (index !== undefined) {
    return `${baseName} #${index + 1}`
  }
  return baseName
}

export function getImplementationIdIndex(
  implementationId: string | undefined,
): number | undefined {
  if (!implementationId) return undefined

  const trimmed = implementationId.trim()
  if (/^[A-Z]$/.test(trimmed)) {
    return trimmed.charCodeAt(0) - 65
  }

  const candidateMatch = trimmed.match(/^candidate-(\d+)$/i)
  if (candidateMatch?.[1]) {
    const index = Number(candidateMatch[1]) - 1
    return Number.isInteger(index) && index >= 0 ? index : undefined
  }

  return undefined
}

/**
 * Get a compact prompt/strategy preview for implementor cards.
 * Proposal agents can receive large hidden context in params; never render that
 * raw context in the card subtitle.
 */
export const getImplementorPromptPreview = (
  agentBlock: Pick<AgentContentBlock, 'initialPrompt' | 'params'>,
): string => {
  const proposalStrategy = agentBlock.params?.proposalStrategy
  if (typeof proposalStrategy === 'string' && proposalStrategy.trim()) {
    return truncateWithEllipsis(proposalStrategy.trim(), 180)
  }

  const initialPrompt = agentBlock.initialPrompt?.trim()
  if (!initialPrompt) return ''

  const firstLine =
    initialPrompt
      .split('\n')
      .map((line) => line.trim())
      .find(Boolean) ?? ''

  return truncateWithEllipsis(
    firstLine
      .replace(/^Retry Strategy:\s*/, 'Retry: ')
      .replace(/^Strategy:\s*/, ''),
    180,
  )
}

/**
 * Get the index of an implementor agent among its siblings.
 * Returns the 0-based index among all implementor agents of the same type.
 */
export const getImplementorIndex = (
  currentAgent: AgentContentBlock,
  siblingBlocks: ContentBlock[],
): number | undefined => {
  if (!isImplementorAgent(currentAgent)) return undefined

  // Filter to only implementor agents of the same type
  const implementorSiblings = siblingBlocks.filter(
    (block): block is AgentContentBlock =>
      block.type === 'agent' &&
      isImplementorAgent(block) &&
      block.agentType === currentAgent.agentType,
  )

  // If there's only one, don't show an index
  if (implementorSiblings.length <= 1) {
    return undefined
  }

  // Find the index of the current agent
  return implementorSiblings.findIndex(
    (block) => block.agentId === currentAgent.agentId,
  )
}

/**
 * Group consecutive blocks from a blocks array that match the predicate.
 * Returns the group and the next index to process.
 */
export function groupConsecutiveBlocks<T extends ContentBlock>(
  blocks: ContentBlock[],
  startIndex: number,
  predicate: (block: ContentBlock) => block is T,
): { group: T[]; nextIndex: number } {
  const group: T[] = []
  let i = startIndex

  while (i < blocks.length) {
    const block = blocks[i]
    if (!predicate(block)) {
      break
    }
    group.push(block)
    i++
  }

  return { group, nextIndex: i }
}

/**
 * Group consecutive implementor agents from a blocks array.
 * Returns the group of implementors and the next index to process.
 */
export function groupConsecutiveImplementors(
  blocks: ContentBlock[],
  startIndex: number,
): { group: AgentContentBlock[]; nextIndex: number } {
  return groupConsecutiveBlocks(
    blocks,
    startIndex,
    (block): block is AgentContentBlock =>
      block.type === 'agent' && isImplementorAgent(block),
  )
}

export function groupConsecutiveNonImplementorAgents(
  blocks: ContentBlock[],
  startIndex: number,
): { group: AgentContentBlock[]; nextIndex: number } {
  return groupConsecutiveBlocks(
    blocks,
    startIndex,
    (block): block is AgentContentBlock =>
      block.type === 'agent' && !isImplementorAgent(block),
  )
}

export function groupConsecutiveToolBlocks(
  blocks: ContentBlock[],
  startIndex: number,
): { group: ToolContentBlock[]; nextIndex: number } {
  return groupConsecutiveBlocks(
    blocks,
    startIndex,
    (block): block is ToolContentBlock => block.type === 'tool',
  )
}

/**
 * Extract a value for a key from tool output (key: value format).
 * Supports multi-line values with pipe delimiter.
 */
export function extractValueForKey(output: string, key: string): string | null {
  if (!output) return null
  const lines = output.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const match = line.match(/^\s*([A-Za-z0-9_]+):\s*(.*)$/)
    if (match && match[1] === key) {
      const rest = match[2]
      if (rest.trim().startsWith('|')) {
        const baseIndent = lines[i + 1]?.match(/^\s*/)?.[0].length ?? 0
        const acc: string[] = []
        for (let j = i + 1; j < lines.length; j++) {
          const l = lines[j]
          const indent = l.match(/^\s*/)?.[0].length ?? 0
          if (l.trim().length === 0) {
            acc.push('')
            continue
          }
          if (indent < baseIndent) break
          acc.push(l.slice(baseIndent))
        }
        return acc.join('\n')
      } else {
        let val = rest.trim()
        if (val.startsWith('"') && val.endsWith('"')) {
          val = val.slice(1, -1)
        }
        return val
      }
    }
  }
  return null
}

/**
 * Extract file path from tool block.
 */
function extractFilePathFromOutputRaw(outputRaw: unknown): string | null {
  const value =
    Array.isArray(outputRaw) && outputRaw[0]?.value
      ? (outputRaw[0].value as Record<string, unknown>)
      : typeof outputRaw === 'object' && outputRaw !== null
        ? (outputRaw as Record<string, unknown>)
        : null

  if (!value) return null
  if (typeof value.file === 'string') return value.file
  if (typeof value.path === 'string') return value.path
  return null
}

export function extractFilePath(toolBlock: ToolContentBlock): string | null {
  const outputStr = typeof toolBlock.output === 'string' ? toolBlock.output : ''
  const input = toolBlock.input as Record<string, unknown>

  return (
    extractValueForKey(outputStr, 'file') ||
    extractFilePathFromOutputRaw(toolBlock.outputRaw) ||
    (typeof input?.path === 'string' ? input.path : null) ||
    (typeof input?.file_path === 'string' ? input.file_path : null)
  )
}

/**
 * Extract unified diff from tool output, or construct from input.
 * For executed tools: use outputRaw/output with unifiedDiff.
 * For proposed tools (implementors): construct diff from input replacements.
 */
export function extractDiff(toolBlock: ToolContentBlock): string | null {
  let hasSuccessfulOutput = false

  // First try to get from outputRaw (for executed tool results)
  // outputRaw is typically an array like [{type: "json", value: {unifiedDiff: "..."}}]
  const outputRaw = toolBlock.outputRaw as unknown
  if (Array.isArray(outputRaw) && outputRaw[0]?.value) {
    const value = outputRaw[0].value as Record<string, unknown>
    if (hasErrorMessage(value)) return null
    if (isSuccessfulEditMessage(value.message)) hasSuccessfulOutput = true
    if (value.unifiedDiff) return value.unifiedDiff as string
    if (value.patch) return value.patch as string
  }
  // Also check direct properties (in case format differs)
  if (typeof outputRaw === 'object' && outputRaw !== null) {
    const rawObj = outputRaw as Record<string, unknown>
    if (hasErrorMessage(rawObj)) return null
    if (isSuccessfulEditMessage(rawObj.message)) hasSuccessfulOutput = true
    if (rawObj.unifiedDiff) return rawObj.unifiedDiff as string
    if (rawObj.patch) return rawObj.patch as string
  }

  // Try to get from output string (key: value format)
  const outputStr = typeof toolBlock.output === 'string' ? toolBlock.output : ''
  const message = extractValueForKey(outputStr, 'message')
  const diffFromOutput =
    extractValueForKey(outputStr, 'unifiedDiff') ||
    extractValueForKey(outputStr, 'patch')

  if (hasFailedEditOutput({ outputStr, message, diffFromOutput })) {
    return null
  }
  if (isSuccessfulEditMessage(message)) {
    hasSuccessfulOutput = true
  }

  if (diffFromOutput) {
    return diffFromOutput
  }

  // For proposed/pending edits, or confirmed successful executions, construct
  // the preview from input when the result omits a diff.
  const canUseInputFallback =
    isProposedToolName(toolBlock.toolName) ||
    outputStr === '' ||
    hasSuccessfulOutput
  if (!canUseInputFallback) {
    return null
  }

  const input = toolBlock.input as Record<string, unknown>
  const baseToolName = getBaseToolName(toolBlock.toolName)

  // Handle str_replace: construct diff from replacements
  if (baseToolName === 'str_replace' && Array.isArray(input?.replacements)) {
    const replacements = input.replacements as ReplacementInput[]
    if (replacements.length > 0) {
      return constructDiffFromReplacements(replacements)
    }
  }

  // Handle write_file: show content as addition
  if (baseToolName === 'write_file' && typeof input?.content === 'string') {
    return constructDiffFromWriteFile(input.content)
  }

  // Fallback: get from input.content (for other tools)
  if (input?.content !== undefined && typeof input.content === 'string') {
    return input.content
  }

  return null
}

function hasErrorMessage(value: Record<string, unknown>): boolean {
  return Boolean(value.errorMessage || (value.value as any)?.errorMessage)
}

function hasFailedEditOutput(params: {
  outputStr: string
  message: string | null
  diffFromOutput: string | null
}): boolean {
  const { outputStr, message, diffFromOutput } = params
  const trimmedOutput = outputStr.trim()
  if (!trimmedOutput) {
    return false
  }
  if (
    extractValueForKey(outputStr, 'errorMessage') ||
    isErrorOutput(outputStr)
  ) {
    return true
  }
  if (diffFromOutput || isSuccessfulEditMessage(message)) {
    return false
  }
  return !isSuccessfulEditMessage(trimmedOutput)
}

function isFailedEditToolBlock(toolBlock: ToolContentBlock): boolean {
  const outputRaw = toolBlock.outputRaw as unknown
  if (Array.isArray(outputRaw) && outputRaw[0]?.value) {
    const value = outputRaw[0].value as Record<string, unknown>
    if (hasErrorMessage(value)) return true
    if (
      typeof value.unifiedDiff === 'string' ||
      typeof value.patch === 'string' ||
      isSuccessfulEditMessage(value.message)
    ) {
      return false
    }
  }
  if (typeof outputRaw === 'object' && outputRaw !== null) {
    const rawObj = outputRaw as Record<string, unknown>
    if (hasErrorMessage(rawObj)) return true
    if (
      typeof rawObj.unifiedDiff === 'string' ||
      typeof rawObj.patch === 'string' ||
      isSuccessfulEditMessage(rawObj.message)
    ) {
      return false
    }
  }

  const outputStr = typeof toolBlock.output === 'string' ? toolBlock.output : ''
  const message = extractValueForKey(outputStr, 'message')
  const diffFromOutput =
    extractValueForKey(outputStr, 'unifiedDiff') ||
    extractValueForKey(outputStr, 'patch')
  return hasFailedEditOutput({ outputStr, message, diffFromOutput })
}

function isSuccessfulEditMessage(message: unknown): boolean {
  if (typeof message !== 'string') {
    return false
  }

  return message
    .split('\n')
    .some((line) =>
      SUCCESSFUL_EDIT_MESSAGES.some((successMessage) =>
        line.trim().startsWith(successMessage),
      ),
    )
}

function isErrorOutput(output: string): boolean {
  const trimmedOutput = output.trim()
  return (
    trimmedOutput.startsWith('Error:') || trimmedOutput.startsWith('Failed ')
  )
}

/**
 * Construct a simple diff view from str_replace replacements.
 */
type ReplacementInput = {
  oldString?: string
  newString?: string
  old?: string
  new?: string
}

function constructDiffFromReplacements(
  replacements: ReplacementInput[],
): string {
  const lines: string[] = []

  for (const replacement of replacements) {
    const oldString = replacement.oldString ?? replacement.old ?? ''
    const newString = replacement.newString ?? replacement.new ?? ''

    // Add old lines as removals
    const oldLines = oldString.split('\n')
    for (const line of oldLines) {
      lines.push(`- ${line}`)
    }
    // Add new lines as additions
    const newLines = newString.split('\n')
    for (const line of newLines) {
      lines.push(`+ ${line}`)
    }
    // Add separator between replacements if there are multiple
    if (replacements.length > 1) {
      lines.push('')
    }
  }

  return lines.join('\n')
}

/**
 * Construct a diff view from write_file content.
 */
function constructDiffFromWriteFile(content: string): string {
  const lines = content.split('\n')
  return lines.map((line) => `+ ${line}`).join('\n')
}

/**
 * Check if a tool is a "create new file" operation.
 */
export function isCreateFile(toolBlock: ToolContentBlock): boolean {
  const outputStr = typeof toolBlock.output === 'string' ? toolBlock.output : ''
  const message = extractValueForKey(outputStr, 'message')
  return (
    typeof message === 'string' &&
    (message.startsWith('Created file successfully') ||
      message.startsWith('Created new file') ||
      message.startsWith('Proposed new file'))
  )
}

function hasToolResultOutput(toolBlock: ToolContentBlock): boolean {
  const outputStr = typeof toolBlock.output === 'string' ? toolBlock.output : ''
  return outputStr.length > 0 || toolBlock.outputRaw !== undefined
}

/**
 * Decide whether the direct edit tool renderer should show a diff preview.
 *
 * Real edit tool calls render immediately with input only, then receive output
 * once the edit completes. Wait for that result before showing diffs so create
 * operations never briefly flash an input-derived full-file diff.
 */
export function shouldShowEditDiff(toolBlock: ToolContentBlock): boolean {
  if (!extractDiff(toolBlock) || isCreateFile(toolBlock)) {
    return false
  }

  if (
    !isProposedToolName(toolBlock.toolName) &&
    !hasToolResultOutput(toolBlock)
  ) {
    return false
  }

  return true
}

export interface TimelineItem {
  type: 'commentary' | 'edit'
  content: string // For commentary: the text. For edits: file path
  diff?: string // For edits: the unified diff
  isCreate?: boolean // For edits: whether this is a new file creation
}

/** Git-style change type for files */
export type FileChangeType = 'A' | 'M' | 'D' | 'R'

export interface DiffStats {
  linesAdded: number
  linesRemoved: number
  hunks: number
}

export interface FileStats {
  path: string
  changeType: FileChangeType
  stats: DiffStats
}

/**
 * Parse diff text and extract statistics.
 */
export function parseDiffStats(diff: string | undefined): DiffStats {
  if (!diff) return { linesAdded: 0, linesRemoved: 0, hunks: 0 }

  const lines = diff.split('\n')
  let linesAdded = 0
  let linesRemoved = 0
  let hunks = 0

  for (const line of lines) {
    // Count hunk headers (lines starting with @@)
    if (line.startsWith('@@')) {
      hunks++
    }
    // Count additions (lines starting with + but not +++ header)
    else if (line.startsWith('+') && !line.startsWith('+++')) {
      linesAdded++
    }
    // Count deletions (lines starting with - but not --- header)
    else if (line.startsWith('-') && !line.startsWith('---')) {
      linesRemoved++
    }
  }

  // If no @@ markers found but we have +/- lines, count as 1 hunk
  if (hunks === 0 && (linesAdded > 0 || linesRemoved > 0)) {
    hunks = 1
  }

  return { linesAdded, linesRemoved, hunks }
}

/**
 * Determine file change type based on tool and context.
 */
export function getFileChangeType(toolBlock: ToolContentBlock): FileChangeType {
  const baseToolName = getBaseToolName(toolBlock.toolName)
  // write_file creating new file = Added
  if (baseToolName === 'write_file') {
    const isCreate = isCreateFile(toolBlock)
    return isCreate ? 'A' : 'M'
  }

  // str_replace is always a modification
  if (baseToolName === 'str_replace') {
    return 'M'
  }

  // Default to modified
  return 'M'
}

/**
 * Get aggregated file stats from all edit blocks.
 * Groups by file path and sums up the stats.
 */
export function getFileStatsFromBlocks(
  blocks: ContentBlock[] | undefined,
): FileStats[] {
  if (!blocks || blocks.length === 0) return []

  const fileMap = new Map<string, FileStats>()

  const addFileStats = (
    filePath: string,
    diff: string | null,
    changeType: FileChangeType,
  ) => {
    const stats = parseDiffStats(diff ?? undefined)
    const existing = fileMap.get(filePath)
    if (existing) {
      // Aggregate stats for same file
      existing.stats.linesAdded += stats.linesAdded
      existing.stats.linesRemoved += stats.linesRemoved
      existing.stats.hunks += stats.hunks
    } else {
      fileMap.set(filePath, {
        path: filePath,
        changeType,
        stats,
      })
    }
  }

  for (const block of blocks) {
    if (
      block.type === 'tool' &&
      ALL_EDIT_TOOL_NAMES.includes(
        block.toolName as (typeof ALL_EDIT_TOOL_NAMES)[number],
      )
    ) {
      // Transaction tools change multiple files in one tool call; expand the
      // result's files array into per-file stats so the card shows real diffs
      // instead of "no changes". A failed/no-files transaction yields no
      // entries (extractTransactionFiles excludes errorMessage results), so we
      // check it before the single-file failed-edit heuristics.
      if (isTransactionToolName(block.toolName)) {
        for (const file of extractTransactionFiles(block)) {
          addFileStats(file.path, file.diff, 'M')
        }
        continue
      }

      if (isFailedEditToolBlock(block)) continue

      const filePath = extractFilePath(block)
      if (!filePath) continue

      addFileStats(filePath, extractDiff(block), getFileChangeType(block))
    }
  }

  return Array.from(fileMap.values())
}

/**
 * Build an activity timeline from agent blocks.
 * Interleaves commentary (text blocks) and edits (tool calls).
 * Includes both executed tools (str_replace, write_file) and proposed tools.
 */
export function buildActivityTimeline(
  blocks: ContentBlock[] | undefined,
): TimelineItem[] {
  if (!blocks || blocks.length === 0) return []

  const timeline: TimelineItem[] = []

  for (const block of blocks) {
    if (block.type === 'text' && block.textType !== 'reasoning') {
      const content = block.content.trim()
      if (content) {
        timeline.push({ type: 'commentary', content })
      }
    } else if (
      block.type === 'tool' &&
      ALL_EDIT_TOOL_NAMES.includes(
        block.toolName as (typeof ALL_EDIT_TOOL_NAMES)[number],
      )
    ) {
      // Transaction tools change multiple files in one call; emit one timeline
      // edit per changed file so each file's diff is viewable. Checked before
      // the single-file failed-edit heuristics for the same reason as in
      // getFileStatsFromBlocks.
      if (isTransactionToolName(block.toolName)) {
        for (const file of extractTransactionFiles(block)) {
          timeline.push({
            type: 'edit',
            content: file.path,
            diff: file.diff || undefined,
            isCreate: false,
          })
        }
        continue
      }

      if (isFailedEditToolBlock(block)) continue

      const filePath = extractFilePath(block)
      const diff = extractDiff(block)
      const isCreate = isCreateFile(block)

      timeline.push({
        type: 'edit',
        content: filePath || 'unknown file',
        diff: diff || undefined,
        isCreate,
      })
    }
  }

  return timeline
}

/**
 * Truncate text to fit within maxWidth, adding ellipsis if needed.
 */
export function truncateWithEllipsis(text: string, maxWidth: number): string {
  if (text.length <= maxWidth) return text
  if (maxWidth <= 3) return text.slice(0, maxWidth)
  return text.slice(0, maxWidth - 3) + '...'
}

export interface MultiPromptProgress {
  /** Total number of implementor agents */
  total: number
  /** Number of successfully completed implementors */
  completed: number
  /** Number of failed/errored implementors */
  failed: number
  /** Whether selector is active (all implementors done, selecting best) */
  isSelecting: boolean
  /** Whether selector has completed (used to detect applying phase) */
  isSelectorComplete: boolean
}

/**
 * Analyze progress of a multi-prompt editor agent.
 * Returns counts of implementor agents and current phase.
 */
export function getMultiPromptProgress(
  blocks: ContentBlock[] | undefined,
): MultiPromptProgress | null {
  if (!blocks || blocks.length === 0) return null

  const implementors = blocks.filter(
    (block): block is AgentContentBlock =>
      block.type === 'agent' &&
      isImplementorAgent(block) &&
      isInitialProposalPhase(block),
  )

  if (implementors.length === 0) return null

  const completed = implementors.filter((a) => a.status === 'complete').length
  const failed = implementors.filter(
    (a) => a.status === 'failed' || a.status === 'cancelled',
  ).length

  const selectorAgent = blocks.find(
    (block): block is AgentContentBlock =>
      block.type === 'agent' && block.agentType.includes('best-of-n-selector'),
  )
  const isSelecting = selectorAgent?.status === 'running'

  return {
    total: implementors.length,
    completed,
    failed,
    isSelecting,
    isSelectorComplete: selectorAgent?.status === 'complete',
  }
}

function isInitialProposalPhase(block: AgentContentBlock): boolean {
  const phase = block.params?.proposalPhase
  return phase === undefined || phase === 'initial'
}

/** Expected shape of the set_output data from editor-multi-prompt */
interface MultiPromptSetOutputData {
  implementationId?: string
  chosenStrategy?: string
  selectedProposalId?: string
  selectedProposalLabel?: string
  appliedProposalId?: string
  appliedProposalLabel?: string
  selectionSource?: string
  reason?: string
  suggestedImprovements?: string
  proposalSummary?: unknown
  toolResults?: unknown[]
  error?: string
}

/** Expected shape of the set_output input (data is wrapped in a 'data' property) */
interface SetOutputInput {
  data?: MultiPromptSetOutputData
}

/** Type guard for set_output input with data property */
function hasSetOutputData(input: unknown): input is SetOutputInput {
  return (
    typeof input === 'object' &&
    input !== null &&
    'data' in input &&
    typeof (input as SetOutputInput).data === 'object'
  )
}

/**
 * Extract the selection reason from multi-prompt agent's set_output block.
 * set_output wraps data in a 'data' property, so we need to access input.data.reason
 */
function extractSelectionReason(
  blocks: ContentBlock[] | undefined,
): string | null {
  if (!blocks || blocks.length === 0) return null

  const setOutputBlock = blocks.find(
    (block): block is ToolContentBlock =>
      block.type === 'tool' &&
      block.toolName === 'set_output' &&
      hasSetOutputData(block.input) &&
      typeof block.input.data?.reason === 'string',
  )

  if (!setOutputBlock || !hasSetOutputData(setOutputBlock.input)) {
    return null
  }

  return setOutputBlock.input.data?.reason ?? null
}

/**
 * Generate a progress-focused preview string for multi-prompt editor.
 * @param blocks - The nested content blocks of the agent
 * @param isAgentComplete - Whether the parent agent has finished (status === 'complete')
 */
export function getMultiPromptPreview(
  blocks: ContentBlock[] | undefined,
  isAgentComplete?: boolean,
): string | null {
  const progress = getMultiPromptProgress(blocks)
  if (!progress) return null

  const { total, completed, failed, isSelecting, isSelectorComplete } = progress
  const finished = completed + failed

  // Agent is fully complete - show final state with selection info
  // Use multi-line format: line 1 = count, lines 2-3 = reason (truncated to fit)
  if (isAgentComplete) {
    const reason = extractSelectionReason(blocks)
    if (reason) {
      // Capitalize first letter and truncate to 2 lines (line 1 is the count)
      const formattedReason = reason.charAt(0).toUpperCase() + reason.slice(1)
      const lines = formattedReason.split('\n')
      const truncatedReason =
        lines.length > 2
          ? lines.slice(0, 2).join('\n').trimEnd() + '...'
          : formattedReason
      return `${total} proposals evaluated\n${truncatedReason}`
    }
    return `${total} proposals evaluated`
  }

  // Selector completed but agent still running = applying phase
  if (isSelectorComplete) {
    return 'Applying selected changes...'
  }

  if (isSelecting) {
    return `${total} proposals complete • Selecting best...`
  }

  if (finished === total && total > 0) {
    if (failed > 0) {
      return `${completed}/${total} proposals complete (${failed} failed)`
    }
    return `${total} proposals complete`
  }

  if (finished > 0) {
    if (failed > 0) {
      return `${completed}/${total} complete, ${failed} failed...`
    }
    return `${completed}/${total} proposals complete...`
  }

  return `Generating ${total} proposals...`
}
