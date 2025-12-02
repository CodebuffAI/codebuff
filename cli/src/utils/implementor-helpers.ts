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

/**
 * Check if an agent is an implementor that should render as a simple tool call
 */
export const isImplementorAgent = (agentType: string): boolean => {
  return IMPLEMENTOR_AGENT_IDS.some((implementorId) =>
    agentType.includes(implementorId),
  )
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

  // Only add numbering if index is provided
  if (index !== undefined) {
    return `${baseName} #${index + 1}`
  }

  return baseName
}

/**
 * Calculate implementor numbering for siblings by comparing agent types directly
 * Returns the index if there are multiple of the same type, undefined otherwise
 */
export const getImplementorIndex = (
  currentAgentId: string,
  currentAgentType: string,
  siblingBlocks: ContentBlock[],
): number | undefined => {
  if (!isImplementorAgent(currentAgentType)) return undefined

  // Find all siblings with the same agent type
  const sameTypeImplementors = siblingBlocks.filter(
    (block): block is AgentContentBlock =>
      block.type === 'agent' && block.agentType === currentAgentType,
  )

  if (sameTypeImplementors.length <= 1) return undefined

  return sameTypeImplementors.findIndex(
    (block) => block.agentId === currentAgentId,
  )
}

// Edit tool names that count as edits
const EDIT_TOOL_NAMES = ['str_replace', 'write_file'] as const

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
  const input = toolBlock.input as any

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
  const outputRaw = toolBlock.outputRaw as any
  if (Array.isArray(outputRaw) && outputRaw[0]?.value) {
    const value = outputRaw[0].value
    if (value.unifiedDiff) return value.unifiedDiff
    if (value.patch) return value.patch
  }
  // Also check direct properties (in case format differs)
  if (outputRaw?.unifiedDiff) return outputRaw.unifiedDiff
  if (outputRaw?.patch) return outputRaw.patch

  // Try to get from output string (key: value format)
  const outputStr = typeof toolBlock.output === 'string' ? toolBlock.output : ''
  const diffFromOutput =
    extractValueForKey(outputStr, 'unifiedDiff') ||
    extractValueForKey(outputStr, 'patch')

  if (diffFromOutput) {
    return diffFromOutput
  }

  // For proposed edits (no output yet): construct diff from input
  const input = toolBlock.input as any

  // Handle str_replace: construct diff from replacements
  if (toolBlock.toolName === 'str_replace' && Array.isArray(input?.replacements)) {
    const replacements = input.replacements as { old: string; new: string }[]
    if (replacements.length > 0) {
      return constructDiffFromReplacements(replacements)
    }
  }

  // Handle write_file: show content as addition
  if (toolBlock.toolName === 'write_file' && typeof input?.content === 'string') {
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
  return message === 'Created new file'
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
  // write_file creating new file = Added
  if (toolBlock.toolName === 'write_file') {
    const isCreate = isCreateFile(toolBlock)
    return isCreate ? 'A' : 'M'
  }

  // str_replace is always a modification
  if (toolBlock.toolName === 'str_replace') {
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
      EDIT_TOOL_NAMES.includes(block.toolName as (typeof EDIT_TOOL_NAMES)[number])
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
      EDIT_TOOL_NAMES.includes(block.toolName as (typeof EDIT_TOOL_NAMES)[number])
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
