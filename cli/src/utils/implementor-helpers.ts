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
] as const

// Edit tool names that count as edits (proposed versions too)
const PROPOSED_EDIT_TOOL_NAMES = ['propose_str_replace', 'propose_write_file'] as const

const isProposedToolName = (toolName: ToolContentBlock['toolName']): boolean =>
  typeof toolName === 'string' && toolName.startsWith('propose_')

const getBaseToolName = (toolName: ToolContentBlock['toolName']): string =>
  isProposedToolName(toolName) ? toolName.slice('propose_'.length) : toolName

const hasProposedTools = (blocks?: ContentBlock[]): boolean => {
  if (!blocks || blocks.length === 0) return false

  return blocks.some(
    (block) => block.type === 'tool' && isProposedToolName(block.toolName),
  )
}

/**
 * Check if an agent is an implementor agent
 * These agents are rendered differently (as simple status lines instead of full agent blocks)
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
 * Get the display name for an implementor agent
 */
export const getImplementorDisplayName = (
  agentType: string,
  index?: number,
): string => {
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

/**
 * Get the index of an implementor agent among its siblings
 * Returns the 0-based index among all implementor agents of the same type
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
 * Group consecutive implementor agents from a blocks array
 * Returns the group of implementors and the next index to process
 */
export function groupConsecutiveImplementors(
  blocks: ContentBlock[],
  startIndex: number,
): { group: AgentContentBlock[]; nextIndex: number } {
  const group: AgentContentBlock[] = []
  let i = startIndex

  while (i < blocks.length) {
    const block = blocks[i]
    if (block.type !== 'agent' || !isImplementorAgent(block)) {
      break
    }
    group.push(block)
    i++
  }

  return { group, nextIndex: i }
}

// Edit tool names that count as edits
const EDIT_TOOL_NAMES = ['str_replace', 'write_file'] as const

// All edit tool names (executed and proposed)
const ALL_EDIT_TOOL_NAMES = [...EDIT_TOOL_NAMES, ...PROPOSED_EDIT_TOOL_NAMES] as const

/**
 * Extract a value for a key from tool output (key: value format)
 * Supports multi-line values with pipe delimiter
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
 * Extract file path from tool block
 */
export function extractFilePath(toolBlock: ToolContentBlock): string | null {
  const outputStr = typeof toolBlock.output === 'string' ? toolBlock.output : ''
  const input = toolBlock.input as Record<string, unknown>

  return (
    extractValueForKey(outputStr, 'file') ||
    (typeof input?.path === 'string' ? input.path : null) ||
    (typeof input?.file_path === 'string' ? input.file_path : null)
  )
}

/**
 * Extract unified diff from tool output, or construct from input
 * For executed tools: use outputRaw/output with unifiedDiff
 * For proposed tools (implementors): construct diff from input replacements
 */
export function extractDiff(toolBlock: ToolContentBlock): string | null {
  // First try to get from outputRaw (for executed tool results)
  // outputRaw is typically an array like [{type: "json", value: {unifiedDiff: "..."}}]
  const outputRaw = toolBlock.outputRaw as unknown
  if (Array.isArray(outputRaw) && outputRaw[0]?.value) {
    const value = outputRaw[0].value as Record<string, unknown>
    if (value.unifiedDiff) return value.unifiedDiff as string
    if (value.patch) return value.patch as string
  }
  // Also check direct properties (in case format differs)
  if (typeof outputRaw === 'object' && outputRaw !== null) {
    const rawObj = outputRaw as Record<string, unknown>
    if (rawObj.unifiedDiff) return rawObj.unifiedDiff as string
    if (rawObj.patch) return rawObj.patch as string
  }

  // Try to get from output string (key: value format)
  const outputStr = typeof toolBlock.output === 'string' ? toolBlock.output : ''
  const diffFromOutput =
    extractValueForKey(outputStr, 'unifiedDiff') ||
    extractValueForKey(outputStr, 'patch')

  if (diffFromOutput) {
    return diffFromOutput
  }

  // For proposed edits (no output yet): construct diff from input
  const input = toolBlock.input as Record<string, unknown>
  const baseToolName = getBaseToolName(toolBlock.toolName)

  // Handle str_replace: construct diff from replacements
  if (baseToolName === 'str_replace' && Array.isArray(input?.replacements)) {
    const replacements = input.replacements as { old: string; new: string }[]
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

/**
 * Construct a simple diff view from str_replace replacements
 */
function constructDiffFromReplacements(
  replacements: { old: string; new: string }[],
): string {
  const lines: string[] = []

  for (const replacement of replacements) {
    // Add old lines as removals
    const oldLines = replacement.old.split('\n')
    for (const line of oldLines) {
      lines.push(`- ${line}`)
    }
    // Add new lines as additions
    const newLines = replacement.new.split('\n')
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
 * Construct a diff view from write_file content
 */
function constructDiffFromWriteFile(content: string): string {
  const lines = content.split('\n')
  return lines.map((line) => `+ ${line}`).join('\n')
}

/**
 * Check if a tool is a "create new file" operation
 */
export function isCreateFile(toolBlock: ToolContentBlock): boolean {
  const outputStr = typeof toolBlock.output === 'string' ? toolBlock.output : ''
  const message = extractValueForKey(outputStr, 'message')
  return (
    typeof message === 'string' &&
    (message.startsWith('Created new file') ||
      message.startsWith('Proposed new file'))
  )
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
 * Parse diff text and extract statistics
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
 * Determine file change type based on tool and context
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
 * Get aggregated file stats from all edit blocks
 * Groups by file path and sums up the stats
 */
export function getFileStatsFromBlocks(blocks: ContentBlock[] | undefined): FileStats[] {
  if (!blocks || blocks.length === 0) return []

  const fileMap = new Map<string, FileStats>()

  for (const block of blocks) {
    if (
      block.type === 'tool' &&
      ALL_EDIT_TOOL_NAMES.includes(block.toolName as (typeof ALL_EDIT_TOOL_NAMES)[number])
    ) {
      const filePath = extractFilePath(block)
      if (!filePath) continue

      const diff = extractDiff(block)
      const stats = parseDiffStats(diff ?? undefined)
      const changeType = getFileChangeType(block)

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
  }

  return Array.from(fileMap.values())
}

/**
 * Build an activity timeline from agent blocks
 * Interleaves commentary (text blocks) and edits (tool calls)
 * Includes both executed tools (str_replace, write_file) and proposed tools
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
      ALL_EDIT_TOOL_NAMES.includes(block.toolName as (typeof ALL_EDIT_TOOL_NAMES)[number])
    ) {
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
 * Truncate text to fit within maxWidth, adding ellipsis if needed
 */
export function truncateWithEllipsis(text: string, maxWidth: number): string {
  if (text.length <= maxWidth) return text
  if (maxWidth <= 3) return text.slice(0, maxWidth)
  return text.slice(0, maxWidth - 3) + '...'
}
