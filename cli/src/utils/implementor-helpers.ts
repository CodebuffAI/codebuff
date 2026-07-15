import type {
  AgentContentBlock,
  ContentBlock,
  ToolContentBlock,
} from '../types/chat'
import { getToolMetadata } from '@codebuff/common/tools/metadata'
import {
  getCanonicalMutationPrimaryAction,
  getCanonicalMutationResult,
} from './tool-result-normalizer'

export const IMPLEMENTOR_AGENT_IDS = ['editor-implementor'] as const

const isTransactionToolName = (
  toolName: ToolContentBlock['toolName'],
): boolean => toolName === 'edit_transaction'

/**
 * Extract per-file { path, diff } entries from a transaction tool block.
 * A failed transaction result has no files array.
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

const isEditToolName = (toolName: ToolContentBlock['toolName']): boolean =>
  getToolMetadata(toolName).kind === 'mutation'

/** Whether a content block is an edit tool block. */
export function isEditToolBlock(block: ContentBlock): boolean {
  return (
    block.type === 'tool' && getToolMetadata(block.toolName).kind === 'mutation'
  )
}

const getBaseToolName = (toolName: ToolContentBlock['toolName']): string =>
  toolName

const SUCCESSFUL_EDIT_MESSAGES = [
  'String replace applied successfully',
  'Created file successfully',
  'Created new file',
  'Overwrote file successfully',
  'Wrote file successfully',
  'Updated file',
  'Replaced lines',
] as const

/**
 * Check if an agent is an implementor agent.
 * These agents are rendered differently (as simple status lines instead of full agent blocks).
 */
export const isImplementorAgent = (
  agentBlock: Pick<AgentContentBlock, 'agentType' | 'blocks'>,
): boolean => {
  return IMPLEMENTOR_AGENT_IDS.some((id) => agentBlock.agentType.includes(id))
}

/**
 * Get the display name for an implementor agent.
 */
export const getImplementorDisplayName = (
  _agentType: string,
  index?: number,
  _params?: Record<string, unknown>,
): string => {
  const baseName = 'Implementor'
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
 * Never render large hidden agent context in the card subtitle.
 */
export const getImplementorPromptPreview = (
  agentBlock: Pick<AgentContentBlock, 'initialPrompt' | 'params'>,
): string => {
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
  const canonicalAction = getCanonicalMutationPrimaryAction(outputRaw)
  if (canonicalAction) {
    if (typeof canonicalAction.destinationPath === 'string') {
      return canonicalAction.destinationPath
    }
    if (typeof canonicalAction.path === 'string') return canonicalAction.path
  }
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
 * For streaming implementor cards, construct a preview from input replacements
 * until an executed mutation result is available.
 */
export function extractDiff(toolBlock: ToolContentBlock): string | null {
  let hasSuccessfulOutput = false
  const canonicalMutation = getCanonicalMutationResult(toolBlock.outputRaw)
  const canonicalAction = getCanonicalMutationPrimaryAction(toolBlock.outputRaw)
  if (canonicalMutation) {
    if (typeof canonicalAction?.patch === 'string') return canonicalAction.patch
    hasSuccessfulOutput = canonicalMutation.outcome === 'applied'
  }

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

  // For pending or confirmed successful executions, construct the preview
  // from input when the result omits a diff.
  const canUseInputFallback = outputStr === '' || hasSuccessfulOutput
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

  // Handle replace_range: use the replacement body as a fallback preview when
  // a successful result omits a patch.
  if (
    baseToolName === 'replace_range' &&
    typeof input?.newContent === 'string'
  ) {
    return constructDiffFromWriteFile(input.newContent)
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
  const canonicalAction = getCanonicalMutationPrimaryAction(toolBlock.outputRaw)
  if (canonicalAction?.action === 'create') return true
  const outputStr = typeof toolBlock.output === 'string' ? toolBlock.output : ''
  const outputRaw = toolBlock.outputRaw as unknown
  const outputRawValue =
    Array.isArray(outputRaw) && outputRaw[0]?.value
      ? (outputRaw[0].value as Record<string, unknown>)
      : typeof outputRaw === 'object' && outputRaw !== null
        ? (outputRaw as Record<string, unknown>)
        : null
  const outputRawMessage =
    typeof outputRawValue?.message === 'string' ? outputRawValue.message : null
  const message = extractValueForKey(outputStr, 'message') ?? outputRawMessage
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
 * once the edit completes. Wait for that result before showing diffs so a
 * pending create never briefly flashes an input-derived full-file diff. Once
 * the result arrives, new-file creations render their addition-only diff body,
 * mirroring edit_transaction.
 */
export function shouldShowEditDiff(toolBlock: ToolContentBlock): boolean {
  if (!extractDiff(toolBlock)) {
    return false
  }

  if (!hasToolResultOutput(toolBlock)) {
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
    if (block.type === 'tool' && isEditToolName(block.toolName)) {
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
 * Includes executed editing tools such as str_replace and write_file.
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
    } else if (block.type === 'tool' && isEditToolName(block.toolName)) {
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
