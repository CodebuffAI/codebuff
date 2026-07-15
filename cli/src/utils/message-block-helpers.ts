import { isDeepStrictEqual } from 'node:util'

import { shouldCollapseByDefault, shouldCollapseForParent } from './constants'
import { sanitizeMediaForUiState } from './payload-sanitizer'

import type {
  ContentBlock,
  AgentContentBlock,
  AskUserContentBlock,
  GateStateContentBlock,
  GateStateStatus,
  ToolContentBlock,
  PlanArtifactMetadata,
} from '../types/chat'

/**
 * Extracts the base agent name from a potentially scoped/versioned agent type string.
 *
 * @example
 * getAgentBaseName('openbuff/file-picker@0.0.2') // 'file-picker'
 * getAgentBaseName('file-picker@1.0.0') // 'file-picker'
 * getAgentBaseName('file-picker') // 'file-picker'
 * getAgentBaseName('file_picker') // 'file-picker'
 */
export const getAgentBaseName = (type: string): string => {
  const segment = type.split('/').pop() ?? type
  return segment.split('@')[0].replace(/_/g, '-')
}

const GATE_STATE_BLOCK_RE = /<gate-state>\s*([\s\S]*?)\s*<\/gate-state>/i

const GATE_STATE_STATUSES: ReadonlySet<GateStateStatus> =
  new Set<GateStateStatus>(['pending', 'passed', 'failed', 'skipped'])

/**
 * Parse the pinned Base2 gate-state shape from a message buffer.
 *
 * Recognized shape (case-insensitive on keys/status, narrow on purpose):
 *
 *   <gate-state>
 *   gate: <name>
 *   status: pending | passed | failed | skipped
 *   details: <optional free text>
 *   origin: <optional label, default "Base2">
 *   </gate-state>
 *
 * Returns null if the buffer does not contain a well-formed gate-state
 * block. If multiple gate-state blocks are present, only the first is parsed.
 * The parser is intentionally strict so ordinary prose mentioning "gate" or
 * "status" never produces a false positive.
 */
export const parseGateStateBlock = (
  buffer: string,
): GateStateContentBlock | null => {
  const match = buffer.match(GATE_STATE_BLOCK_RE)
  if (!match) return null

  const fields: Record<string, string> = {}
  for (const rawLine of match[1].split('\n')) {
    const line = rawLine.trim()
    if (!line) continue
    const sep = line.indexOf(':')
    if (sep <= 0) continue
    const key = line.slice(0, sep).trim().toLowerCase()
    const value = line.slice(sep + 1).trim()
    if (!value) continue
    fields[key] = value
  }

  const gate = fields.gate
  const statusRaw = fields.status?.toLowerCase() as GateStateStatus | undefined
  if (!gate || !statusRaw || !GATE_STATE_STATUSES.has(statusRaw)) {
    return null
  }

  return {
    type: 'gate-state',
    gate,
    gateStatus: statusRaw,
    ...(fields.details ? { details: fields.details } : {}),
    origin: fields.origin || 'Base2',
  }
}

/**
 * Strip any <gate-state>...</gate-state> blocks from a buffer. Used when
 * promoting a parsed gate-state into a dedicated UI block so the raw block
 * does not also render as prose.
 */
export const scrubGateStateTags = (s: string): string =>
  s
    .replace(new RegExp(GATE_STATE_BLOCK_RE.source, 'gi'), '')
    .replace(/\n{3,}/g, '\n\n')

/**
 * Extracts plan content from a buffer containing <PLAN>...</PLAN> tags.
 * Returns the trimmed content between tags, or null if not found.
 */
export const extractPlanFromBuffer = (buffer: string): string | null => {
  const openIdx = buffer.indexOf('<PLAN>')
  const closeIdx = buffer.indexOf('</PLAN>')
  if (openIdx !== -1 && closeIdx !== -1 && closeIdx > openIdx) {
    return buffer.slice(openIdx + '<PLAN>'.length, closeIdx).trim()
  }
  return null
}

export const scrubPlanTags = (s: string): string => {
  // Support both the canonical </PLAN> tag and the legacy </cb_plan> tag.
  const closingTagPattern = '(?:<\\/PLAN>|<\\/cb_plan>)'
  return s
    .replace(new RegExp(`<PLAN>[\\s\\S]*?${closingTagPattern}`, 'g'), '')
    .replace(/<PLAN>[\s\S]*$/g, '')
}

export const scrubPlanTagsInBlocks = (
  blocks: ContentBlock[],
): ContentBlock[] => {
  return blocks
    .map((block) => {
      if (block.type !== 'text') {
        return block
      }
      const newContent = scrubPlanTags(block.content)
      return { ...block, content: newContent }
    })
    .filter((block) => block.type !== 'text' || block.content.trim() !== '')
}

type StringArtifactKey =
  | 'sessionPath'
  | 'specPath'
  | 'planPath'
  | 'statusPath'
  | 'lessonsPath'

const PLAN_METADATA_LABELS: Record<string, StringArtifactKey> = {
  session: 'sessionPath',
  'session path': 'sessionPath',
  'session directory': 'sessionPath',
  'session dir': 'sessionPath',
  'spec.md': 'specPath',
  spec: 'specPath',
  'plan.md': 'planPath',
  plan: 'planPath',
  'status.md': 'statusPath',
  status: 'statusPath',
  'lessons.md': 'lessonsPath',
  lessons: 'lessonsPath',
}

const PLAN_ARTIFACT_FILENAMES: Array<{
  suffix: string
  key: StringArtifactKey
}> = [
  { suffix: '/SPEC.md', key: 'specPath' },
  { suffix: '/PLAN.md', key: 'planPath' },
  { suffix: '/STATUS.md', key: 'statusPath' },
  { suffix: '/LESSONS.md', key: 'lessonsPath' },
]

const normalizePlanMetadataLabel = (label: string): string =>
  label
    .replace(/[*_`]/g, '')
    .replace(/^#+\s*/, '')
    .trim()
    .toLowerCase()

/**
 * Strip markdown formatting marks (`*_`) and leading `#`/whitespace from a
 * label while preserving its original casing. Used for custom artifact
 * display labels, which may be arbitrary user-authored strings.
 */
const stripPlanMetadataLabelFormatting = (label: string): string =>
  label
    .replace(/[*_`]/g, '')
    .replace(/^#+\s*/, '')
    .trim()

/**
 * Returns true when a metadata value looks like a path worth capturing as a
 * custom artifact — it contains at least one path separator or ends with
 * `.md`. Values that read as prose (spaces but no separators) are rejected.
 */
const isCustomArtifactPathValue = (value: string): boolean =>
  value.includes('/') || value.endsWith('.md')

const normalizePlanMetadataPath = (value: string): string => {
  const withoutMarkdownLink = value.match(/\(([^)]+)\)/)?.[1] ?? value
  return withoutMarkdownLink
    .replace(/[`*_]/g, '')
    .replace(/[.,;]+$/g, '')
    .trim()
}

const isNonEmptyPlanMetadata = (
  metadata: PlanArtifactMetadata,
): metadata is PlanArtifactMetadata =>
  Object.values(metadata).some((value) =>
    Array.isArray(value) ? value.length > 0 : Boolean(value),
  )

const getPlanSessionCommandTarget = (
  metadata: PlanArtifactMetadata,
): string | undefined => {
  const explicitSession = metadata.sessionPath
  if (explicitSession) return explicitSession

  const artifactPath =
    metadata.planPath ??
    metadata.statusPath ??
    metadata.specPath ??
    metadata.lessonsPath
  return (
    artifactPath?.match(/^(\.agents\/sessions\/[^/]+)/)?.[1] ?? artifactPath
  )
}

const getCustomArtifactCommand = (path: string): string =>
  path.endsWith('.md') ? `Read ${path}` : `Open ${path}`

const withPlanCommands = (
  metadata: PlanArtifactMetadata,
): PlanArtifactMetadata => {
  const commandTarget = getPlanSessionCommandTarget(metadata)
  const customArtifactCommands = metadata.customArtifacts?.length
    ? metadata.customArtifacts.map(({ path }) => getCustomArtifactCommand(path))
    : undefined

  if (!commandTarget) {
    if (!customArtifactCommands) {
      return metadata
    }
    return { ...metadata, customArtifactCommands }
  }

  return {
    ...metadata,
    executeCommand: '/mode:execute_plan Build it!',
    resumeCommand: `/resume-plan ${commandTarget}`,
    updateCommand: `/update-plan ${commandTarget}`,
    statusCommand: `/plan-status ${commandTarget}`,
    lessonsCommand: `/lessons ${commandTarget}`,
    ...(customArtifactCommands ? { customArtifactCommands } : {}),
  }
}

export const extractPlanMetadata = (
  planContent: string,
): PlanArtifactMetadata | undefined => {
  const metadata: PlanArtifactMetadata = {}

  for (const rawLine of planContent.split('\n')) {
    const line = rawLine.trim()
    if (!line) continue

    const bulletMatch = line.match(/^(?:[-*+]\s+|\d+[.)]\s+)?([^:]+):\s*(.+)$/)
    if (bulletMatch) {
      const label = normalizePlanMetadataLabel(bulletMatch[1])
      const key = PLAN_METADATA_LABELS[label]
      if (key) {
        metadata[key] = normalizePlanMetadataPath(bulletMatch[2])
        continue
      }

      // Unrecognized `Label: value` bullet. Capture it as a custom artifact
      // only when the value looks path-like (contains `/` or ends with
      // `.md`). Prose like `Note: this is important` is skipped because it
      // has spaces but no path separators.
      const rawValue = bulletMatch[2]
      const normalizedValue = normalizePlanMetadataPath(rawValue)
      if (isCustomArtifactPathValue(normalizedValue)) {
        const customLabel = stripPlanMetadataLabelFormatting(bulletMatch[1])
        if (customLabel) {
          metadata.customArtifacts = [
            ...(metadata.customArtifacts ?? []),
            { label: customLabel, path: normalizedValue },
          ]
        }
      }
      continue
    }

    const pathMatch = line.match(/(`?\.agents\/sessions\/[^`\s)]+`?)/)
    if (!pathMatch) continue

    const path = normalizePlanMetadataPath(pathMatch[1])
    if (!metadata.sessionPath) {
      const sessionMatch = path.match(/^(\.agents\/sessions\/[^/]+)/)
      metadata.sessionPath = sessionMatch?.[1] ?? path
    }

    for (const artifact of PLAN_ARTIFACT_FILENAMES) {
      if (path.endsWith(artifact.suffix)) {
        metadata[artifact.key] = path
      }
    }
  }

  return isNonEmptyPlanMetadata(metadata)
    ? withPlanCommands(metadata)
    : undefined
}

export const insertPlanBlock = (
  blocks: ContentBlock[],
  planContent: string,
): ContentBlock[] => {
  const cleanedBlocks = scrubPlanTagsInBlocks(blocks)
  const metadata = extractPlanMetadata(planContent)
  return [
    ...cleanedBlocks,
    {
      type: 'plan',
      content: planContent,
      ...(metadata ? { metadata } : {}),
    },
  ]
}

/**
 * Recursively collapses blocks that weren't manually opened by the user.
 * Preserves user intent by keeping blocks open if userOpened is true.
 */
export const autoCollapseBlocks = (blocks: ContentBlock[]): ContentBlock[] => {
  return blocks.map((block) => {
    // Handle thinking blocks (grouped text blocks)
    if (block.type === 'text' && block.thinkingId) {
      return block.userOpened
        ? block
        : { ...block, thinkingCollapseState: 'hidden' as const }
    }

    // Handle agent blocks
    if (block.type === 'agent') {
      const updatedBlock = block.userOpened
        ? block
        : { ...block, isCollapsed: true }

      // Recursively update nested blocks
      if (updatedBlock.blocks) {
        return {
          ...updatedBlock,
          blocks: autoCollapseBlocks(updatedBlock.blocks),
        }
      }
      return updatedBlock
    }

    // Handle tool blocks
    if (block.type === 'tool') {
      return block.userOpened ? block : { ...block, isCollapsed: true }
    }

    // Handle agent-list blocks
    if (block.type === 'agent-list') {
      return block.userOpened ? block : { ...block, isCollapsed: true }
    }

    return block
  })
}

/**
 * Result of extracting content from a spawn_agents result value.
 */
export interface SpawnAgentResultContent {
  content: string
  hasError: boolean
}

type UnknownRecord = Record<string, unknown>

const isRecordValue = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const getStringField = (
  obj: UnknownRecord,
  field: string,
): string | undefined =>
  typeof obj[field] === 'string' ? obj[field] : undefined

const formatBrowserUseStructuredOutput = (
  value: UnknownRecord,
): string | undefined => {
  if (value.outputKind !== 'browser-use') {
    return undefined
  }

  const status = getStringField(value, 'overallStatus')
  const summary = getStringField(value, 'summary')
  const results = Array.isArray(value.results) ? value.results : undefined

  if (!status || !summary || !results) {
    return undefined
  }

  const lines = [`Browser test ${status}: ${summary}`]

  const finalUrl = getStringField(value, 'finalUrl')
  const finalPageTitle = getStringField(value, 'finalPageTitle')
  if (finalUrl || finalPageTitle) {
    const finalState = [finalPageTitle, finalUrl].filter(Boolean).join(' — ')
    lines.push('', `Final: ${finalState}`)
  }

  if (results.length > 0) {
    lines.push('', 'Results:')
    for (const item of results) {
      if (!isRecordValue(item)) continue
      const name = getStringField(item, 'name') ?? 'Unnamed step'
      const passed = item.passed === false ? '✗' : '✓'
      const details = getStringField(item, 'details')
      const url = getStringField(item, 'url')
      const mediaFlags = [
        item.screenshotAttached === true ? 'screenshot attached' : undefined,
        item.pdfAttached === true ? 'PDF generated' : undefined,
        item.recordingAttached === true ? 'recording attached' : undefined,
      ].filter(Boolean)
      const suffixParts = [url, ...mediaFlags]
      const suffix =
        suffixParts.length > 0 ? ` (${suffixParts.join('; ')})` : ''
      lines.push(
        `- ${passed} ${name}${suffix}${details ? ` — ${details}` : ''}`,
      )
    }
  }

  const consoleErrors = Array.isArray(value.consoleErrors)
    ? value.consoleErrors
    : []
  if (consoleErrors.length > 0) {
    lines.push('', 'Console/runtime issues:')
    for (const item of consoleErrors) {
      if (!isRecordValue(item)) continue
      const message = getStringField(item, 'message')
      const url = getStringField(item, 'url')
      if (message) lines.push(`- ${message}${url ? ` (${url})` : ''}`)
    }
  }

  const lessons = Array.isArray(value.lessons) ? value.lessons : []
  if (lessons.length > 0) {
    lines.push('', 'Notes:')
    for (const lesson of lessons) {
      if (typeof lesson === 'string' && lesson.trim()) {
        lines.push(`- ${lesson}`)
      }
    }
  }

  return lines.join('\n')
}

const formatExternalCliStructuredOutput = (
  value: UnknownRecord,
): string | undefined => {
  if (value.outputKind !== 'external-cli') return undefined
  const status = getStringField(value, 'overallStatus')
  const summary = getStringField(value, 'summary')
  const permissionProfile = getStringField(value, 'permissionProfile')
  if (!status || !summary || !permissionProfile) return undefined

  const lines = [
    `External CLI ${status}: ${summary}`,
    `Permission profile: ${permissionProfile}`,
  ]
  const results = Array.isArray(value.results) ? value.results : []
  if (results.length > 0) {
    lines.push('', 'Results:')
    for (const item of results) {
      if (!isRecordValue(item)) continue
      const name = getStringField(item, 'name') ?? 'Unnamed step'
      const details = getStringField(item, 'details')
      lines.push(
        `- ${item.passed === false ? '✗' : '✓'} ${name}${details ? ` — ${details}` : ''}`,
      )
    }
  }
  return lines.join('\n')
}

const formatResearcherWebStructuredOutput = (
  value: UnknownRecord,
): string | undefined => {
  const data = isRecordValue(value.data) ? value.data : value
  const questions = Array.isArray(data.questions) ? data.questions : undefined
  const sources = Array.isArray(data.sources) ? data.sources : []
  if (!questions) return undefined
  const lines = ['Web research:']
  for (const item of questions) {
    if (!isRecordValue(item)) continue
    const question = getStringField(item, 'question') ?? 'Question'
    const status = getStringField(item, 'status') ?? 'unknown'
    const answer = getStringField(item, 'answer') ?? ''
    lines.push(`- ${question} [${status}]${answer ? ` — ${answer}` : ''}`)
    const citations = Array.isArray(item.citations) ? item.citations : []
    for (const citation of citations) {
      if (typeof citation === 'string') lines.push(`  Source: ${citation}`)
    }
  }
  if (sources.length > 0) {
    lines.push('', 'Sources:')
    for (const source of sources) {
      if (!isRecordValue(source)) continue
      const url = getStringField(source, 'url')
      const title = getStringField(source, 'title')
      if (url) lines.push(`- ${title || url}: ${url}`)
    }
  }
  return lines.join('\n')
}

const formatResearcherDocsStructuredOutput = (
  value: UnknownRecord,
): string | undefined => {
  const status = getStringField(value, 'status')
  const answer = getStringField(value, 'answer')
  const source = getStringField(value, 'source')
  const version = getStringField(value, 'version')
  if (!status || answer === undefined || !source || !version) return undefined
  const lines = [
    `Documentation research ${status}: ${source} (${version})`,
    answer,
  ]
  const failure = getStringField(value, 'failure')
  if (failure) lines.push('', `Limitation: ${failure}`)
  return lines.join('\n')
}

/**
 * Extracts text content from a Message object's content array.
 * Handles assistant messages with TextPart content.
 */
const extractTextFromMessageContent = (content: unknown): string => {
  if (!Array.isArray(content)) {
    return ''
  }
  return content
    .filter(
      (part): part is { text: string } =>
        isRecordValue(part) &&
        part.type === 'text' &&
        typeof part.text === 'string',
    )
    .map((part) => part.text)
    .join('')
}

/**
 * Extracts displayable content from a spawn_agents result value.
 * Handles various nested structures that can come back from agent spawns.
 */
export const extractSpawnAgentResultContent = (
  resultValue: unknown,
): SpawnAgentResultContent => {
  // Handle null/undefined
  if (!resultValue) {
    return { content: '', hasError: false }
  }

  // Handle direct string
  if (typeof resultValue === 'string') {
    return { content: resultValue, hasError: false }
  }

  if (!isRecordValue(resultValue)) {
    return { content: '', hasError: false }
  }

  const obj = resultValue

  // Handle empty object
  if (Object.keys(obj).length === 0) {
    return { content: '', hasError: false }
  }

  // Handle error messages (check both top-level and nested)
  if (obj.errorMessage) {
    return { content: String(obj.errorMessage), hasError: true }
  }
  if (obj.error) {
    return { content: String(obj.error), hasError: true }
  }
  if (obj.type === 'error') {
    const message =
      typeof obj.message === 'string'
        ? obj.message
        : JSON.stringify(obj, null, 2)
    return { content: message, hasError: true }
  }

  const nestedValue = isRecordValue(obj.value) ? obj.value : undefined
  if (nestedValue?.errorMessage) {
    return { content: String(nestedValue.errorMessage), hasError: true }
  }
  if (nestedValue?.error) {
    return { content: String(nestedValue.error), hasError: true }
  }
  if (nestedValue?.type === 'error') {
    const message =
      typeof nestedValue.message === 'string'
        ? nestedValue.message
        : JSON.stringify(nestedValue, null, 2)
    return { content: message, hasError: true }
  }

  // Handle lastMessage and allMessages output modes: { type: "lastMessage"|"allMessages", value: [Message array] }
  // This is common for agents like researcher-web
  if (
    (obj.type === 'lastMessage' || obj.type === 'allMessages') &&
    Array.isArray(obj.value)
  ) {
    const messages = obj.value as Array<{ role?: string; content?: unknown }>
    const textContent = messages
      .filter((msg) => msg?.role === 'assistant')
      .map((msg) => extractTextFromMessageContent(msg?.content))
      .filter(Boolean)
      .join('\n')
    return { content: textContent, hasError: false }
  }

  // Handle structuredOutput mode: { type: "structuredOutput", value: any }
  if (obj.type === 'structuredOutput') {
    const value = obj.value
    // Check for message field in structured output
    if (isRecordValue(value)) {
      const externalCliSummary = formatExternalCliStructuredOutput(value)
      if (externalCliSummary) {
        return { content: externalCliSummary, hasError: false }
      }
      const browserUseSummary = formatBrowserUseStructuredOutput(value)
      if (browserUseSummary) {
        return { content: browserUseSummary, hasError: false }
      }
      const webResearchSummary = formatResearcherWebStructuredOutput(value)
      if (webResearchSummary) {
        return { content: webResearchSummary, hasError: false }
      }
      const docsResearchSummary = formatResearcherDocsStructuredOutput(value)
      if (docsResearchSummary) {
        return { content: docsResearchSummary, hasError: false }
      }
      if (typeof value.message === 'string') {
        return { content: value.message, hasError: false }
      }
      if (typeof value.errorMessage === 'string') {
        return { content: value.errorMessage, hasError: true }
      }
      if (typeof value.error === 'string') {
        return { content: value.error, hasError: true }
      }
      // Check for data.message pattern
      if (isRecordValue(value.data) && typeof value.data.message === 'string') {
        return { content: value.data.message, hasError: false }
      }
    }
    // Fall through to format as JSON
    return {
      content: JSON.stringify(obj.value, null, 2),
      hasError: false,
    }
  }

  // Handle nested string value: { value: "..." }
  if (typeof obj.value === 'string') {
    return { content: obj.value, hasError: false }
  }

  // Handle message field (top-level or nested)
  if (obj.message) {
    return { content: String(obj.message), hasError: false }
  }
  if (nestedValue?.message) {
    return { content: String(nestedValue.message), hasError: false }
  }

  // Fallback to formatted output
  return {
    content: JSON.stringify(resultValue, null, 2),
    hasError: false,
  }
}

/**
 * Appends an interruption notice to blocks, either by modifying the last
 * text block or adding a new one.
 */
export const appendInterruptionNotice = (
  blocks: ContentBlock[],
): ContentBlock[] => {
  const lastBlock = blocks[blocks.length - 1]

  if (lastBlock && lastBlock.type === 'text') {
    const interruptedBlock: ContentBlock = {
      ...lastBlock,
      content: `${lastBlock.content}\n\n[response interrupted]`,
    }
    return [...blocks.slice(0, -1), interruptedBlock]
  }

  const interruptionNotice: ContentBlock = {
    type: 'text',
    content: '[response interrupted]',
  }
  return [...blocks, interruptionNotice]
}

/**
 * Recursively finds an agent block by ID and returns its agent type.
 * Returns undefined if not found.
 */
export const findAgentTypeById = (
  blocks: ContentBlock[],
  agentId: string,
): string | undefined => {
  for (const block of blocks) {
    if (block.type === 'agent') {
      if (block.agentId === agentId) {
        return block.agentType
      }
      if (block.blocks) {
        const found = findAgentTypeById(block.blocks, agentId)
        if (found) {
          return found
        }
      }
    }
  }
  return undefined
}

/**
 * Options for creating an agent content block.
 */
export interface CreateAgentBlockOptions {
  agentId: string
  agentType: string
  prompt?: string
  params?: Record<string, unknown>
  /** The spawn_agents tool call ID that created this block */
  spawnToolCallId?: string
  /** The index within the spawn_agents call */
  spawnIndex?: number
  /** The agent type of the parent agent that spawned this one */
  parentAgentType?: string
}

/**
 * Creates a new agent content block with standard defaults.
 */
export const createAgentBlock = (
  options: CreateAgentBlockOptions,
): AgentContentBlock => {
  const {
    agentId,
    agentType,
    prompt,
    params,
    spawnToolCallId,
    spawnIndex,
    parentAgentType,
  } = options
  const shouldCollapse =
    shouldCollapseByDefault(agentType || '') ||
    shouldCollapseForParent(agentType || '', parentAgentType)
  return {
    type: 'agent',
    agentId,
    agentName: agentType || 'Agent',
    agentType: agentType || 'unknown',
    content: '',
    status: 'running' as const,
    blocks: [] as ContentBlock[],
    initialPrompt: prompt || '',
    ...(params && { params }),
    ...(spawnToolCallId && { spawnToolCallId }),
    ...(spawnIndex !== undefined && { spawnIndex }),
    ...(shouldCollapse && { isCollapsed: true }),
  }
}

/**
 * Helper function to recursively update blocks by target agent ID.
 */
export const updateBlocksRecursively = (
  blocks: ContentBlock[],
  targetAgentId: string,
  updateFn: (block: ContentBlock) => ContentBlock,
): ContentBlock[] => {
  let foundTarget = false
  const result = blocks.map((block) => {
    if (block.type === 'agent' && block.agentId === targetAgentId) {
      foundTarget = true
      return updateFn(block)
    }
    if (block.type === 'agent' && block.blocks) {
      const updatedBlocks = updateBlocksRecursively(
        block.blocks,
        targetAgentId,
        updateFn,
      )
      if (updatedBlocks !== block.blocks) {
        foundTarget = true
        return {
          ...block,
          blocks: updatedBlocks,
        }
      }
    }
    return block
  })

  return foundTarget ? result : blocks
}

/**
 * Result from nestBlockUnderParent indicating whether the parent was found.
 */
export interface NestBlockResult {
  blocks: ContentBlock[]
  parentFound: boolean
}

/**
 * Nests a block under a parent agent, or returns it at top level if parent not found.
 */
export const nestBlockUnderParent = (
  blocks: ContentBlock[],
  parentAgentId: string,
  blockToNest: ContentBlock,
): NestBlockResult => {
  let parentFound = false
  const updatedBlocks = updateBlocksRecursively(
    blocks,
    parentAgentId,
    (parentBlock) => {
      if (parentBlock.type !== 'agent') {
        return parentBlock
      }
      parentFound = true
      return {
        ...parentBlock,
        blocks: [...(parentBlock.blocks || []), blockToNest],
      }
    },
  )

  return { blocks: updatedBlocks, parentFound }
}

/**
 * Checks if a block with the given targetId exists anywhere in the children of the blocks.
 */
const findBlockInChildren = (
  blocks: ContentBlock[],
  targetId: string,
): boolean => {
  for (const block of blocks) {
    if (block.type === 'agent' && block.agentId === targetId) {
      return true
    }
    if (block.type === 'agent' && block.blocks) {
      if (findBlockInChildren(block.blocks, targetId)) {
        return true
      }
    }
  }
  return false
}

/**
 * Checks if a block with the given agentId is already nested under the specified parent.
 */
const checkBlockIsUnderParent = (
  blocks: ContentBlock[],
  targetAgentId: string,
  parentAgentId: string,
): boolean => {
  for (const block of blocks) {
    if (block.type === 'agent' && block.agentId === parentAgentId) {
      // Found the parent, check if target is anywhere in its children
      return findBlockInChildren(block.blocks || [], targetAgentId)
    } else if (block.type === 'agent' && block.blocks) {
      // Recurse into other agent blocks to find the parent
      if (checkBlockIsUnderParent(block.blocks, targetAgentId, parentAgentId)) {
        return true
      }
    }
  }
  return false
}

/**
 * Extracts a block with given agentId from nested blocks structure.
 * Returns the remaining blocks and the extracted block (if found).
 */
export const extractBlockById = (
  blocks: ContentBlock[],
  targetAgentId: string,
): { remainingBlocks: ContentBlock[]; extractedBlock: ContentBlock | null } => {
  let extractedBlock: ContentBlock | null = null

  const extractRecursively = (blocks: ContentBlock[]): ContentBlock[] => {
    const result: ContentBlock[] = []
    for (const block of blocks) {
      if (block.type === 'agent' && block.agentId === targetAgentId) {
        extractedBlock = block
        // Don't add to result - we're extracting it
      } else if (block.type === 'agent' && block.blocks) {
        result.push({
          ...block,
          blocks: extractRecursively(block.blocks),
        })
      } else {
        result.push(block)
      }
    }
    return result
  }

  const remainingBlocks = extractRecursively(blocks)
  return { remainingBlocks, extractedBlock }
}

export const moveSpawnAgentBlock = (
  blocks: ContentBlock[],
  tempId: string,
  realId: string,
  parentId?: string,
  params?: Record<string, unknown>,
  prompt?: string,
  realAgentType?: string,
): ContentBlock[] => {
  const updateAgentBlock = (block: ContentBlock): ContentBlock => {
    if (block.type !== 'agent') {
      return block
    }
    const updatedBlock: ContentBlock = {
      ...block,
      agentId: realId,
    }

    if (params) {
      updatedBlock.params = params
    }

    if (prompt && block.initialPrompt === '') {
      updatedBlock.initialPrompt = prompt
    }

    if (realAgentType) {
      updatedBlock.agentType = realAgentType
      updatedBlock.agentName = realAgentType
    }

    return updatedBlock
  }

  // If there's a parentId, we need to move the block under the parent.
  // First check if the block is already under the correct parent.
  if (parentId) {
    const isAlreadyUnderParent = checkBlockIsUnderParent(
      blocks,
      tempId,
      parentId,
    )
    if (isAlreadyUnderParent) {
      // Block is already under the correct parent, just update it in place
      return updateBlocksRecursively(blocks, tempId, updateAgentBlock)
    }

    // Block needs to be moved under the parent - extract and nest
    const { remainingBlocks, extractedBlock } = extractBlockById(blocks, tempId)
    if (extractedBlock && extractedBlock.type === 'agent') {
      const blockToMove = updateAgentBlock(extractedBlock)
      const { blocks: nestedBlocks, parentFound } = nestBlockUnderParent(
        remainingBlocks,
        parentId,
        blockToMove,
      )
      if (parentFound) {
        return nestedBlocks
      }
      // Parent not found, update in place instead of appending to end
      return updateBlocksRecursively(blocks, tempId, updateAgentBlock)
    }
  }

  // No parentId or block not found - just update in place to preserve order
  return updateBlocksRecursively(blocks, tempId, updateAgentBlock)
}

/**
 * Options for transforming ask_user tool blocks to ask-user content blocks.
 */
export interface TransformAskUserOptions {
  toolCallId: string
  resultValue: unknown
}

/**
 * Transforms ask_user tool blocks into ask-user content blocks when tool results arrive.
 * Recursively processes nested agent blocks.
 */
export const transformAskUserBlocks = (
  blocks: ContentBlock[],
  options: TransformAskUserOptions,
): ContentBlock[] => {
  const { toolCallId, resultValue } = options

  return blocks.map((block) => {
    if (
      block.type === 'tool' &&
      block.toolCallId === toolCallId &&
      block.toolName === 'ask_user'
    ) {
      const skipped = (resultValue as any)?.skipped
      const answers = (resultValue as any)?.answers
      const questions = block.input.questions

      if (!answers && !skipped) {
        // If no result data, keep as tool block (fallback)
        return block
      }

      return {
        type: 'ask-user',
        toolCallId,
        questions,
        answers,
        skipped,
      } as AskUserContentBlock
    }

    if (block.type === 'agent' && block.blocks) {
      const updatedBlocks = transformAskUserBlocks(block.blocks, options)
      if (updatedBlocks !== block.blocks) {
        return { ...block, blocks: updatedBlocks }
      }
    }
    return block
  })
}

/**
 * Options for updating tool blocks with output.
 */
export interface UpdateToolBlockOptions {
  toolCallId: string
  toolOutput: unknown[]
}

const getFirstToolOutputValue = (toolOutput: unknown[]): unknown => {
  const firstOutput = toolOutput?.[0]
  return firstOutput &&
    typeof firstOutput === 'object' &&
    'value' in firstOutput
    ? (firstOutput as { value: unknown }).value
    : undefined
}

const formatTransactionToolOutput = (toolOutput: unknown[]): string => {
  const value = getFirstToolOutputValue(toolOutput)
  if (!value || typeof value !== 'object') {
    return JSON.stringify(toolOutput, null, 2)
  }

  const result = value as Record<string, unknown>
  if (typeof result.errorMessage === 'string') return result.errorMessage
  if (typeof result.error === 'string') return result.error

  if (typeof result.message === 'string') {
    const files = Array.isArray(result.files) ? result.files : []
    if (files.length === 0) return result.message

    const fileList = files
      .map((file) => {
        const entry = file as Record<string, unknown>
        return typeof entry.path === 'string'
          ? entry.path
          : typeof entry.file === 'string'
            ? entry.file
            : null
      })
      .filter((path): path is string => typeof path === 'string')
      .map((path) => `- ${path}`)
      .join('\n')

    return fileList ? `${result.message}\n${fileList}` : result.message
  }

  return JSON.stringify(toolOutput, null, 2)
}

const formatToolOutput = (
  toolName: ToolContentBlock['toolName'],
  toolOutput: unknown[],
): string => {
  if (toolName === 'run_terminal_command') {
    const parsed = getFirstToolOutputValue(toolOutput) as
      | { stdout?: string; stderr?: string }
      | undefined
    if (parsed?.stdout || parsed?.stderr) {
      return (parsed.stdout || '') + (parsed.stderr || '')
    }
    return JSON.stringify(toolOutput, null, 2)
  }

  if (
    toolName === 'edit_transaction' ||
    toolName === 'propose_edit_transaction'
  ) {
    return formatTransactionToolOutput(toolOutput)
  }

  return JSON.stringify(toolOutput, null, 2)
}

const hasMediaPayload = (
  value: unknown,
  seen = new WeakSet<object>(),
): boolean => {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  if (seen.has(value)) {
    return false
  }
  seen.add(value)

  if (!Array.isArray(value)) {
    const record = value as Record<string, unknown>
    if (record.type === 'media' && typeof record.data === 'string') {
      return true
    }
    if (record.type === 'file' && typeof record.data === 'string') {
      return true
    }
    if (record.type === 'image' && typeof record.image === 'string') {
      return true
    }
  }

  return Object.values(value).some((child) => hasMediaPayload(child, seen))
}

/**
 * Updates tool blocks with their output when tool results arrive.
 * Handles special formatting for terminal command and transaction output.
 * Recursively processes nested agent blocks.
 */
export const updateToolBlockWithOutput = (
  blocks: ContentBlock[],
  options: UpdateToolBlockOptions,
): ContentBlock[] => {
  const { toolCallId, toolOutput } = options

  return blocks.map((block) => {
    if (block.type === 'tool' && block.toolCallId === toolCallId) {
      const displayToolOutput = hasMediaPayload(toolOutput)
        ? sanitizeMediaForUiState(toolOutput)
        : toolOutput
      return {
        ...block,
        output: formatToolOutput(block.toolName, displayToolOutput),
        outputRaw: displayToolOutput,
      }
    } else if (block.type === 'agent' && block.blocks) {
      const updatedBlocks = updateToolBlockWithOutput(block.blocks, options)
      // Avoid creating new block if nested blocks didn't change
      if (isDeepStrictEqual(block.blocks, updatedBlocks)) {
        return block
      }
      return { ...block, blocks: updatedBlocks }
    }
    return block
  })
}
