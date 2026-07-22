import path from 'path'

import { applyPatchParams } from '@codebuff/common/tools/params/tool/apply-patch'
import {
  decodeReadCapabilityToken,
  getContentHash as computeContentHash,
  normalizeLineEndings,
  readCapabilityMatchesScope,
  type ReadCapabilityIssuer,
} from '@codebuff/common/util/content-hash'
import {
  composeFilesystemPolicies,
  FilesystemAuthority,
  type FilesystemAuthorityPolicy,
  hashFileContent,
} from './filesystem-authority'
import {
  fileMutationResultV1Schema,
  type CommitReceiptV1,
} from '@codebuff/common/tools/results/filesystem'
import { isMandatorySensitiveReadPath } from '@codebuff/common/util/sensitive-paths'
import type { FileFilter } from './read-files'

import type { ApplyPatchOperation } from '@codebuff/common/tools/params/tool/apply-patch'
import type { CodebuffToolOutput } from '@codebuff/common/tools/list'
import type { CodebuffFileSystem } from '@codebuff/common/types/filesystem'
import { buildFreshWholeFileCapability } from './mutation-capabilities'

type ApplyPatchResult = CodebuffToolOutput<'apply_patch'>
type ApplyPatchJson = ApplyPatchResult[number] & { type: 'json' }

const defaultAuthorities = new WeakMap<
  CodebuffFileSystem,
  Map<
    string,
    Array<{
      fileFilter?: FileFilter
      filesystemPolicy?: FilesystemAuthorityPolicy
      authority: FilesystemAuthority
    }>
  >
>()

export function getDefaultFilesystemAuthority(
  cwd: string,
  fs: CodebuffFileSystem,
  fileFilter?: FileFilter,
  filesystemPolicy?: FilesystemAuthorityPolicy,
): FilesystemAuthority {
  let byRoot = defaultAuthorities.get(fs)
  if (!byRoot) {
    byRoot = new Map()
    defaultAuthorities.set(fs, byRoot)
  }
  const normalizedRoot = path.resolve(cwd)
  const entries = byRoot.get(normalizedRoot) ?? []
  const existing = entries.find(
    (entry) =>
      entry.fileFilter === fileFilter &&
      entry.filesystemPolicy === filesystemPolicy,
  )
  if (existing) return existing.authority

  const authorityFileSystem = Object.assign(Object.create(fs), {
    createFileExclusive:
      fs.createFileExclusive ??
      ((
        filePath: Parameters<CodebuffFileSystem['writeFile']>[0],
        data: Parameters<CodebuffFileSystem['writeFile']>[1],
      ) => fs.writeFile(filePath, data, { flag: 'wx' })),
  }) as CodebuffFileSystem
  const mandatoryMutationPolicy: FilesystemAuthorityPolicy = {
    name: 'mandatory-mutation-policy',
    async evaluate(context) {
      const canonicalRelative = path.relative(
        normalizedRoot,
        context.canonicalPath,
      )
      const aliases = [
        context.portablePath,
        canonicalRelative.split(path.sep).join('/'),
      ].flatMap((alias) => [alias, alias.toLowerCase()])
      if (aliases.some(isMandatorySensitiveReadPath)) {
        return { allowed: false, code: 'sensitive_path', redactPath: true }
      }
      if (
        fileFilter &&
        aliases.some((alias) => fileFilter(alias).status === 'blocked')
      ) {
        return { allowed: false, code: 'custom_filter' }
      }
      return { allowed: true }
    },
  }
  const authority = new FilesystemAuthority(
    normalizedRoot,
    authorityFileSystem,
    filesystemPolicy
      ? composeFilesystemPolicies(mandatoryMutationPolicy, filesystemPolicy)
      : mandatoryMutationPolicy,
  )
  entries.push({ fileFilter, filesystemPolicy, authority })
  byRoot.set(normalizedRoot, entries)
  return authority
}
type PatchAction = 'add' | 'delete' | 'update'
type DiffMode = 'default' | 'create'

type Chunk = {
  origIndex: number
  delLines: string[]
  insLines: string[]
}

type ParserState = {
  lines: string[]
  index: number
  fuzz: number
}

type PatchAttempt = {
  name: string
  source: string
  diff: string
}

type ReadCapability = {
  startLine: number
  endLine: number
  hash: string
}

type ValidatedReadRange = {
  startLine: number
  endLine: number
  content: string
}

const END_PATCH = '*** End Patch'
const END_FILE = '*** End of File'
const END_SECTION_MARKERS = [
  END_PATCH,
  '*** Update File:',
  '*** Delete File:',
  '*** Add File:',
  END_FILE,
]

const SECTION_TERMINATORS = [
  END_PATCH,
  '*** Update File:',
  '*** Delete File:',
  '*** Add File:',
]

// normalizeLineEndings + content-hash now imported from @codebuff/common/util/content-hash.
// Thin re-export preserves the public name expected by callers/tests.
export function getPatchRangeContentHash(content: string): string {
  return computeContentHash(content)
}

const LARGE_FILE_LINE_THRESHOLD = 1_000
const LARGE_FILE_CHAR_THRESHOLD = 100_000

function ensureTrailingNewline(input: string): string {
  return input.endsWith('\n') ? input : `${input}\n`
}

function stripTrailingNewline(input: string): string {
  return input.endsWith('\n') ? input.slice(0, -1) : input
}

function sanitizeUnifiedDiff(rawDiff: string): string {
  const diffFenceMatch = rawDiff.match(/```diff\r?\n([\s\S]*?)\r?\n```/i)
  if (diffFenceMatch) {
    return diffFenceMatch[1]!
  }

  const trimmed = rawDiff.trim()
  const fencedMatch = trimmed.match(
    /^```(?:[a-zA-Z0-9_-]+)?\r?\n([\s\S]*?)\r?\n```$/,
  )
  if (fencedMatch) {
    return fencedMatch[1]!
  }

  return rawDiff
}

function patchHasIntendedChanges(diff: string): boolean {
  return normalizeLineEndings(diff)
    .split('\n')
    .some((line) => {
      if (line.startsWith('+++') || line.startsWith('---')) {
        return false
      }

      return line.startsWith('+') || line.startsWith('-')
    })
}

function normalizeDiffLines(diff: string): string[] {
  return diff
    .split(/\r?\n/)
    .map((line) => line.replace(/\r$/, ''))
    .filter((line, idx, arr) => !(idx === arr.length - 1 && line === ''))
}

function isDone(state: ParserState, prefixes: string[]): boolean {
  if (state.index >= state.lines.length) {
    return true
  }

  return prefixes.some((prefix) => state.lines[state.index]?.startsWith(prefix))
}

function isWrappedAtHeader(line: string): boolean {
  return /^@@.*@@(?: .*)?$/.test(line)
}

function getUnifiedOldStartIndex(line: string): number | undefined {
  const match = line.match(
    /^@@\s+-(\d+)(?:,(\d+))?\s+\+\d+(?:,\d+)?\s+@@(?: .*)?$/,
  )
  if (!match) return undefined

  const oldStart = Number(match[1])
  const oldCount = match[2] === undefined ? 1 : Number(match[2])
  if (!Number.isSafeInteger(oldStart) || !Number.isSafeInteger(oldCount)) {
    return undefined
  }
  return oldCount === 0 ? oldStart : Math.max(0, oldStart - 1)
}

function parseCreateDiff(lines: string[]): string {
  // Keep compatibility with unified create payloads by ignoring common diff headers.
  const filteredLines = lines.filter(
    (line) =>
      !line.startsWith('---') &&
      !line.startsWith('+++') &&
      !line.startsWith('@@') &&
      !line.startsWith('***'),
  )

  const parser: ParserState = {
    lines: [...filteredLines, END_PATCH],
    index: 0,
    fuzz: 0,
  }

  const output: string[] = []

  while (!isDone(parser, SECTION_TERMINATORS)) {
    const line = parser.lines[parser.index]!
    parser.index += 1

    if (!line.startsWith('+')) {
      throw new Error(`Invalid Add File Line: ${line}`)
    }

    output.push(line.slice(1))
  }

  return output.join('\n')
}

function advanceCursorToAnchor(
  anchor: string,
  inputLines: string[],
  cursor: number,
  parser: ParserState,
): number {
  let found = false

  if (!inputLines.slice(0, cursor).some((line) => line === anchor)) {
    for (let i = cursor; i < inputLines.length; i += 1) {
      if (inputLines[i] === anchor) {
        cursor = i + 1
        found = true
        break
      }
    }
  }

  if (
    !found &&
    !inputLines.slice(0, cursor).some((line) => line.trim() === anchor.trim())
  ) {
    for (let i = cursor; i < inputLines.length; i += 1) {
      if (inputLines[i]?.trim() === anchor.trim()) {
        cursor = i + 1
        parser.fuzz += 1
        found = true
        break
      }
    }
  }

  return cursor
}

function readSection(
  lines: string[],
  startIndex: number,
): {
  nextContext: string[]
  sectionChunks: Chunk[]
  endIndex: number
  eof: boolean
} {
  const context: string[] = []
  let delLines: string[] = []
  let insLines: string[] = []
  const sectionChunks: Chunk[] = []

  let mode: 'keep' | 'add' | 'delete' = 'keep'
  let index = startIndex
  const origIndex = index

  while (index < lines.length) {
    const raw = lines[index]!

    if (
      raw.startsWith('@@') ||
      raw.startsWith(END_PATCH) ||
      raw.startsWith('*** Update File:') ||
      raw.startsWith('*** Delete File:') ||
      raw.startsWith('*** Add File:') ||
      raw.startsWith(END_FILE)
    ) {
      break
    }

    if (raw === '***') {
      break
    }

    if (raw.startsWith('***')) {
      throw new Error(`Invalid Line: ${raw}`)
    }

    index += 1
    const lastMode = mode

    let line = raw
    if (line === '') {
      line = ' '
    }

    if (line[0] === '+') {
      mode = 'add'
    } else if (line[0] === '-') {
      mode = 'delete'
    } else if (line[0] === ' ') {
      mode = 'keep'
    } else {
      throw new Error(`Invalid Line: ${line}`)
    }

    line = line.slice(1)

    const switchingToContext = mode === 'keep' && lastMode !== mode
    if (switchingToContext && (insLines.length > 0 || delLines.length > 0)) {
      sectionChunks.push({
        origIndex: context.length - delLines.length,
        delLines,
        insLines,
      })
      delLines = []
      insLines = []
    }

    if (mode === 'delete') {
      delLines.push(line)
      context.push(line)
    } else if (mode === 'add') {
      insLines.push(line)
    } else {
      context.push(line)
    }
  }

  if (insLines.length > 0 || delLines.length > 0) {
    sectionChunks.push({
      origIndex: context.length - delLines.length,
      delLines,
      insLines,
    })
  }

  if (index < lines.length && lines[index] === END_FILE) {
    index += 1
    return { nextContext: context, sectionChunks, endIndex: index, eof: true }
  }

  if (index === origIndex) {
    throw new Error(`Nothing in this section - index=${index} ${lines[index]}`)
  }

  return { nextContext: context, sectionChunks, endIndex: index, eof: false }
}

function equalsSlice(
  source: string[],
  target: string[],
  start: number,
  mapFn: (value: string) => string,
): boolean {
  if (start + target.length > source.length) {
    return false
  }

  for (let i = 0; i < target.length; i += 1) {
    if (mapFn(source[start + i]!) !== mapFn(target[i]!)) {
      return false
    }
  }

  return true
}

function findContextCore(
  lines: string[],
  context: string[],
  start: number,
  expectedIndex?: number,
): { newIndex: number; fuzz: number } {
  if (context.length === 0) {
    return {
      newIndex:
        expectedIndex === undefined
          ? start
          : Math.min(lines.length, Math.max(0, expectedIndex)),
      fuzz: 0,
    }
  }

  for (const { mapFn, fuzz } of [
    { mapFn: (value: string) => value, fuzz: 0 },
    { mapFn: (value: string) => value.trimEnd(), fuzz: 1 },
    { mapFn: (value: string) => value.trim(), fuzz: 100 },
  ]) {
    const matches: number[] = []
    for (let i = start; i < lines.length; i += 1) {
      if (equalsSlice(lines, context, i, mapFn)) {
        matches.push(i)
      }
    }

    if (matches.length === 0) continue
    if (matches.length === 1) {
      return { newIndex: matches[0]!, fuzz }
    }
    if (expectedIndex !== undefined && matches.includes(expectedIndex)) {
      return { newIndex: expectedIndex, fuzz }
    }

    const lineNumbers = matches.map((index) => index + 1).join(', ')
    throw new Error(
      `Ambiguous Context: matched ${matches.length} locations starting at lines ${lineNumbers}. Use a correct unified hunk header with the target old-file line number, or include more unique context lines.`,
    )
  }

  return { newIndex: -1, fuzz: 0 }
}

function findContext(
  lines: string[],
  context: string[],
  start: number,
  eof: boolean,
  expectedIndex?: number,
): { newIndex: number; fuzz: number } {
  if (eof) {
    const endStart = Math.max(0, lines.length - context.length)
    const endMatch = findContextCore(lines, context, endStart, expectedIndex)
    if (endMatch.newIndex !== -1) {
      return endMatch
    }

    const fallback = findContextCore(lines, context, start, expectedIndex)
    return { newIndex: fallback.newIndex, fuzz: fallback.fuzz + 10000 }
  }

  return findContextCore(lines, context, start, expectedIndex)
}

function parseUpdateDiff(
  lines: string[],
  input: string,
): { chunks: Chunk[]; fuzz: number } {
  const parser: ParserState = {
    lines: [...lines, END_PATCH],
    index: 0,
    fuzz: 0,
  }

  const inputLines = input.split('\n')
  const chunks: Chunk[] = []
  let cursor = 0

  while (!isDone(parser, END_SECTION_MARKERS)) {
    const current = parser.lines[parser.index]
    const line = typeof current === 'string' ? current : ''

    let anchor = ''
    let expectedOldIndex: number | undefined
    const hasBareHeader = line === '@@'
    const hasWrappedHeader = isWrappedAtHeader(line)
    const hasAnchorHeader = line.startsWith('@@ ') && !hasWrappedHeader
    const hasAnyHeader = hasBareHeader || hasWrappedHeader || hasAnchorHeader

    if (hasAnchorHeader) {
      anchor = line.slice(3)
      parser.index += 1
    } else if (hasBareHeader || hasWrappedHeader) {
      if (hasWrappedHeader) {
        expectedOldIndex = getUnifiedOldStartIndex(line)
      }
      parser.index += 1
    }

    if (!(hasAnyHeader || cursor === 0)) {
      throw new Error(`Invalid Line:\n${parser.lines[parser.index]}`)
    }

    if (anchor.trim()) {
      cursor = advanceCursorToAnchor(anchor, inputLines, cursor, parser)
    }

    const { nextContext, sectionChunks, endIndex, eof } = readSection(
      parser.lines,
      parser.index,
    )

    const { newIndex, fuzz } = findContext(
      inputLines,
      nextContext,
      cursor,
      eof,
      expectedOldIndex,
    )

    if (newIndex === -1) {
      const nextContextText = nextContext.join('\n')
      if (eof) {
        throw new Error(`Invalid EOF Context ${cursor}:\n${nextContextText}`)
      }

      throw new Error(`Invalid Context ${cursor}:\n${nextContextText}`)
    }

    parser.fuzz += fuzz
    for (const chunk of sectionChunks) {
      chunks.push({ ...chunk, origIndex: chunk.origIndex + newIndex })
    }

    cursor = newIndex + nextContext.length
    parser.index = endIndex
  }

  return { chunks, fuzz: parser.fuzz }
}

function applyChunks(input: string, chunks: Chunk[]): string {
  const originalLines = input.split('\n')
  const destinationLines: string[] = []
  let originalIndex = 0

  for (const chunk of chunks) {
    if (chunk.origIndex > originalLines.length) {
      throw new Error(
        `applyDiff: chunk.origIndex ${chunk.origIndex} > input length ${originalLines.length}`,
      )
    }

    if (originalIndex > chunk.origIndex) {
      throw new Error(
        `applyDiff: overlapping chunk at ${chunk.origIndex} (cursor ${originalIndex})`,
      )
    }

    destinationLines.push(
      ...originalLines.slice(originalIndex, chunk.origIndex),
    )
    originalIndex = chunk.origIndex

    if (chunk.insLines.length > 0) {
      destinationLines.push(...chunk.insLines)
    }

    originalIndex += chunk.delLines.length
  }

  destinationLines.push(...originalLines.slice(originalIndex))
  return destinationLines.join('\n')
}

function applyDiff(
  input: string,
  diff: string,
  mode: DiffMode = 'default',
): { result: string; fuzz: number; chunks: Chunk[] } {
  const diffLines = normalizeDiffLines(diff)

  if (mode === 'create') {
    return { result: parseCreateDiff(diffLines), fuzz: 0, chunks: [] }
  }

  const { chunks, fuzz } = parseUpdateDiff(diffLines, input)
  return { result: applyChunks(input, chunks), fuzz, chunks }
}

function isConsistentlyCrlf(input: string): boolean {
  const hasCrlf = /\r\n/.test(input)
  const hasBareLf = /(^|[^\r])\n/.test(input)
  return hasCrlf && !hasBareLf
}

function preserveOriginalLineEndings(params: {
  original: string
  patched: string
}): string {
  const { original, patched } = params

  if (!isConsistentlyCrlf(original)) {
    return patched
  }

  return normalizeLineEndings(patched).replace(/\n/g, '\r\n')
}

function buildPatchAttempts(oldContent: string, diff: string): PatchAttempt[] {
  const normalizedOld = normalizeLineEndings(oldContent)
  const normalizedDiff = normalizeLineEndings(diff)

  return [
    { name: 'codex_like', source: normalizedOld, diff: normalizedDiff },
    {
      name: 'with_trailing_newline',
      source: ensureTrailingNewline(normalizedOld),
      diff: normalizedDiff,
    },
    {
      name: 'without_trailing_newline',
      source: stripTrailingNewline(normalizedOld),
      diff: normalizedDiff,
    },
  ]
}

function tryApplyPatchWithFallbacks(params: {
  oldContent: string
  diff: string
  requiredRanges: ValidatedReadRange[]
}): {
  patched: string | null
  attemptedStrategies: string[]
  lastError?: string
} {
  const attempts = buildPatchAttempts(params.oldContent, params.diff)
  const attemptedStrategies: string[] = []
  let lastError: string | undefined

  const seen = new Set<string>()

  for (const attempt of attempts) {
    const key = JSON.stringify({
      source: attempt.source,
      diff: attempt.diff,
    })

    if (seen.has(key)) {
      continue
    }

    seen.add(key)
    attemptedStrategies.push(attempt.name)

    try {
      const { result: patched, chunks } = applyDiff(
        attempt.source,
        attempt.diff,
        'default',
      )
      const rangeError = validatePatchChunksWithinRanges({
        chunks,
        ranges: params.requiredRanges,
      })
      if (rangeError) {
        lastError = rangeError
        continue
      }

      if (patchHasIntendedChanges(attempt.diff) && patched === attempt.source) {
        lastError = 'Patch produced no content changes'
        continue
      }

      return {
        patched,
        attemptedStrategies,
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
    }
  }

  return {
    patched: null,
    attemptedStrategies,
    ...(lastError ? { lastError } : {}),
  }
}

function formatPatchFailureMessage(params: {
  path: string
  attemptedStrategies: string[]
  lastError?: string
}): string {
  const { path, attemptedStrategies, lastError } = params

  return [
    `Failed to apply patch to ${path}.`,
    attemptedStrategies.length > 0
      ? `Tried strategies: ${attemptedStrategies.join(', ')}.`
      : undefined,
    lastError ? `Last error: ${lastError}.` : undefined,
    'Please re-read the file and generate a patch with exact context lines.',
  ]
    .filter(Boolean)
    .join(' ')
}

function getLineCount(content: string): number {
  return normalizeLineEndings(content).split('\n').length
}

function validateReadCapabilities(params: {
  path: string
  content: string
  capabilities: ReadCapability[]
}): ValidatedReadRange[] | string {
  const { path, content, capabilities } = params
  const lines = normalizeLineEndings(content).split('\n')
  const errors: string[] = []
  const validated: ValidatedReadRange[] = []

  for (const capability of capabilities) {
    const { startLine, endLine, hash } = capability
    if (startLine > endLine) {
      errors.push(
        `apply_patch rejected for ${path}: basedOnRead.startLine must be <= basedOnRead.endLine.`,
      )
      continue
    }
    if (startLine > lines.length) {
      errors.push(
        `apply_patch rejected for ${path}: basedOnRead starts at line ${startLine}, but the file currently has only ${lines.length} lines. Re-read the target range before editing.`,
      )
      continue
    }

    const end = Math.min(endLine, lines.length)
    const currentRange = lines.slice(startLine - 1, end).join('\n')
    const currentHash = getPatchRangeContentHash(currentRange)
    if (currentHash !== hash) {
      errors.push(
        [
          `apply_patch rejected for ${path}: the basedOnRead range is stale.`,
          `Expected ${hash} for lines ${startLine}-${endLine}, but current hash is ${currentHash}.`,
          `Re-read with read_files ranges: [{ path: "${path}", startLine: ${startLine}, endLine: ${endLine} }] and retry with the new rangeHash.`,
        ].join('\n'),
      )
      continue
    }

    validated.push({ startLine, endLine: end, content: currentRange })
  }

  if (errors.length > 0) {
    return errors.join('\n\n')
  }

  return validated
}

function validatePatchChunksWithinRanges(params: {
  chunks: Chunk[]
  ranges: ValidatedReadRange[]
}): string | null {
  const { chunks, ranges } = params
  if (ranges.length === 0) return null

  for (const chunk of chunks) {
    const chunkStartLine = chunk.origIndex + 1
    const chunkEndLine = chunk.origIndex + Math.max(1, chunk.delLines.length)
    const matchingRange = ranges.find(
      (range) =>
        chunkStartLine >= range.startLine && chunkEndLine <= range.endLine,
    )

    if (!matchingRange) {
      return `Patch hunk touches lines ${chunkStartLine}-${chunkEndLine}, which are outside the provided basedOnRead ranges. Re-read every target hunk with read_files.ranges and include one basedOnRead capability per hunk.`
    }
  }

  return null
}

function successResult(params: {
  file: string
  action: PatchAction
  operationId: string
  receipt: CommitReceiptV1
  beforeHash: string | null
  afterHash: string | null
  finalContent?: string
  canonicalPath?: string
  capabilityIssuer?: ReadCapabilityIssuer
}): ApplyPatchJson {
  const action =
    params.action === 'add'
      ? ('create' as const)
      : params.action === 'delete'
        ? ('delete' as const)
        : ('update' as const)
  return {
    type: 'json',
    value: fileMutationResultV1Schema.parse({
      kind: 'file_mutation_result',
      version: 1,
      operationId: params.operationId,
      outcome: 'applied',
      actions: [
        {
          actionId: `${params.operationId}:0`,
          index: 0,
          action,
          path: params.file,
          outcome: 'applied',
          beforeHash: params.beforeHash,
          afterHash: params.receipt.actions[0]?.afterHash ?? params.afterHash,
        },
      ],
      authorityTier: params.receipt.authorityTier,
      receiptId: params.receipt.receiptId,
      authorityReceipt: params.receipt,
      errors: [],
      freshCapabilities:
        action === 'delete' ||
        params.finalContent === undefined ||
        !params.capabilityIssuer
          ? []
          : [
              buildFreshWholeFileCapability({
                canonicalPath: params.canonicalPath ?? params.file,
                path: params.file,
                content: params.finalContent,
                capabilityIssuer: params.capabilityIssuer,
              }),
            ],
    }),
  }
}

async function errorResult(
  errorMessage: string,
  authority: FilesystemAuthority,
  callId: string,
  operation?: ApplyPatchOperation,
  operationId = crypto.randomUUID(),
): Promise<ApplyPatchJson> {
  const code = /changed after it was read|stale/i.test(errorMessage)
    ? 'stale_state'
    : /exists|collision/i.test(errorMessage)
      ? 'already_exists'
      : /invalid input|invalid path/i.test(errorMessage)
        ? 'invalid_request'
        : 'application_rejected'
  const provenNotApplied =
    !operation ||
    /invalid input|invalid path|denied|changed after it was read|stale|exists|collision|large-file apply_patch blocked|failed to apply patch/i.test(
      errorMessage,
    )
  const action = operation
    ? {
        actionId: `${operationId}:0`,
        index: 0,
        action:
          operation.type === 'create_file'
            ? ('create' as const)
            : operation.type === 'delete_file'
              ? ('delete' as const)
              : ('update' as const),
        path: operation.path,
        beforeHash: null,
      }
    : undefined
  const receipt = provenNotApplied
    ? authority.issueNotStartedReceipt({
        operationId,
        callId,
        authorityTier: 'portable_path',
        actions: action ? [action] : [],
      })
    : undefined
  return {
    type: 'json',
    value: fileMutationResultV1Schema.parse({
      kind: 'file_mutation_result',
      version: 1,
      operationId,
      outcome: provenNotApplied ? 'not_applied' : 'unconfirmed',
      actions: operation
        ? [
            {
              ...action!,
              outcome: provenNotApplied ? 'not_applied' : 'unconfirmed',
              beforeHash: null,
              afterHash: null,
              error: { code, message: errorMessage, retryable: false },
            },
          ]
        : [],
      authorityTier: provenNotApplied ? 'portable_path' : null,
      ...(receipt
        ? { receiptId: receipt.receiptId, authorityReceipt: receipt }
        : {}),
      errors: [{ code, message: errorMessage, retryable: false }],
      freshCapabilities: [],
    }),
  }
}

function parseOperation(
  parameters: unknown,
): { operation: ApplyPatchOperation } | { errorMessage: string } {
  const parsed = applyPatchParams.inputSchema.safeParse(parameters)
  if (!parsed.success) {
    return {
      errorMessage: `Invalid apply_patch input: ${parsed.error.issues
        .map((issue) => issue.message)
        .join('; ')}`,
    }
  }

  return { operation: parsed.data.operation }
}

export async function applyPatchTool(params: {
  parameters: unknown
  cwd: string
  fs: CodebuffFileSystem
  authority?: FilesystemAuthority
  fileFilter?: FileFilter
  callId?: string
  signal?: AbortSignal
  filesystemPolicy?: FilesystemAuthorityPolicy
  capabilityIssuer?: ReadCapabilityIssuer
}): Promise<ApplyPatchResult> {
  const { parameters, cwd, fs } = params
  const authority =
    params.authority ??
    getDefaultFilesystemAuthority(
      cwd,
      fs,
      params.fileFilter,
      params.filesystemPolicy,
    )
  const parsedOperation = parseOperation(parameters)

  if ('errorMessage' in parsedOperation) {
    return [
      await errorResult(
        parsedOperation.errorMessage,
        authority,
        params.callId ?? 'apply_patch-invalid-input',
      ),
    ]
  }
  const { operation } = parsedOperation
  const operationId = crypto.randomUUID()

  try {
    const operationKind =
      operation.type === 'create_file'
        ? 'create'
        : operation.type === 'delete_file'
          ? 'delete'
          : 'overwrite'
    const authorization = await authority.authorizePath(
      operation.path,
      operationKind,
    )
    if (!authorization.allowed) {
      throw new Error(`Invalid path: ${operation.path}`)
    }
    const authorizedPath = authorization.path
    const fullPath = authorizedPath.operationPath
    authority.registerOperation({
      id: operationId,
      kind: operationKind,
      paths: [authorizedPath],
    })

    if (operation.type === 'create_file') {
      const sanitizedDiff = sanitizeUnifiedDiff(operation.diff)
      const { result: content } = applyDiff('', sanitizedDiff, 'create')

      await fs.mkdir(path.dirname(fullPath), { recursive: true })
      let receipt: CommitReceiptV1 | undefined
      await authority.withAuthorizedPathLocks([authorizedPath], async () => {
        const commitAuthorization = await authority.authorizeCommit(
          authorizedPath,
          'create',
        )
        if (!commitAuthorization.allowed) {
          throw new Error(`Create denied: ${commitAuthorization.code}`)
        }
        throwIfAborted(params.signal)
        const begun = authority.beginCommit(operationId)
        if (!begun.begun) throw new Error('Create commit could not begin.')
        try {
          const created = await authority.createExclusive(
            commitAuthorization.path,
            content,
          )
          if (!created.supported) {
            throw new Error(
              'Exclusive create is unsupported by this filesystem adapter.',
            )
          }
          receipt = await authority.issueCommittedReceipt({
            operationId,
            callId: params.callId ?? operationId,
            authorityTier: 'portable_path',
            actions: [
              {
                actionId: `${operationId}:0`,
                index: 0,
                action: 'create',
                path: operation.path,
                beforeHash: null,
              },
            ],
            expectedFinalHashes: {
              [operation.path]: hashFileContent(content),
            },
          })
          authority.finishCommit(begun.lease, { succeeded: true })
        } catch (error) {
          authority.finishCommit(begun.lease, {
            succeeded: false,
            errorCode: 'CREATE_FAILED',
          })
          throw error
        }
      })

      return [
        successResult({
          file: operation.path,
          action: 'add',
          operationId,
          receipt: receipt!,
          beforeHash: null,
          afterHash: computeContentHash(content),
          finalContent: content,
          canonicalPath: authorizedPath.canonicalPath,
          capabilityIssuer: params.capabilityIssuer,
        }),
      ]
    }

    if (operation.type === 'delete_file') {
      let deletedHash = ''
      let receipt: CommitReceiptV1 | undefined
      await authority.withAuthorizedPathLocks([authorizedPath], async () => {
        const oldContent = await fs.readFile(fullPath)
        const expected = {
          state: 'present' as const,
          hash: hashFileContent(
            typeof oldContent === 'string'
              ? oldContent
              : Buffer.from(oldContent),
          ),
        }
        deletedHash = expected.hash
        const commitAuthorization = await authority.authorizeCommit(
          authorizedPath,
          'delete',
        )
        if (!commitAuthorization.allowed) {
          throw new Error(`Delete denied: ${commitAuthorization.code}`)
        }
        const validation = await authority.revalidateExpectedState(
          commitAuthorization.path,
          expected,
        )
        if (!validation.matches) {
          throw new Error(
            `Delete rejected for ${operation.path}: the file changed after it was read. Re-read it before retrying.`,
          )
        }
        throwIfAborted(params.signal)
        const begun = authority.beginCommit(operationId)
        if (!begun.begun) throw new Error('Delete commit could not begin.')
        try {
          const conditional = await authority.conditionalDelete(
            commitAuthorization.path,
            expected.hash,
          )
          if (conditional.supported) {
            if (!conditional.result.applied) {
              throw new Error(
                `Delete rejected for ${operation.path}: the file changed immediately before deletion.`,
              )
            }
          } else {
            await fs.unlink(fullPath)
          }
          receipt = await authority.issueCommittedReceipt({
            operationId,
            callId: params.callId ?? operationId,
            authorityTier: conditional.supported
              ? 'conditional_commit'
              : 'portable_path',
            actions: [
              {
                actionId: `${operationId}:0`,
                index: 0,
                action: 'delete',
                path: operation.path,
                beforeHash: deletedHash,
              },
            ],
            expectedFinalHashes: { [operation.path]: null },
          })
          authority.finishCommit(begun.lease, { succeeded: true })
        } catch (error) {
          authority.finishCommit(begun.lease, {
            succeeded: false,
            errorCode: 'DELETE_FAILED',
          })
          throw error
        }
      })
      return [
        successResult({
          file: operation.path,
          action: 'delete',
          operationId,
          receipt: receipt!,
          beforeHash: deletedHash,
          afterHash: null,
        }),
      ]
    }

    let updateBeforeHash = ''
    let updateAfterHash = ''
    let updateReceipt: CommitReceiptV1 | undefined
    const updateError = await authority.withAuthorizedPathLocks(
      [authorizedPath],
      async (): Promise<string | null> => {
        const sanitizedDiff = sanitizeUnifiedDiff(operation.diff)
        const oldContent = await fs.readFile(fullPath, 'utf-8')
        const expected = {
          state: 'present' as const,
          hash: hashFileContent(oldContent),
        }
        updateBeforeHash = expected.hash
        const isLargeFile =
          oldContent.length > LARGE_FILE_CHAR_THRESHOLD ||
          getLineCount(oldContent) > LARGE_FILE_LINE_THRESHOLD
        if (
          isLargeFile &&
          (!operation.basedOnRead || operation.basedOnRead.length === 0)
        ) {
          return [
            `Large-file apply_patch blocked for ${operation.path}: this file has ${getLineCount(oldContent).toLocaleString()} lines and ${oldContent.length.toLocaleString()} characters.`,
            'Do not use naked apply_patch on large files.',
            'First read every touched hunk with read_files.ranges, then retry with operation.basedOnRead containing { startLine, endLine, hash: rangeHash } for each hunk.',
          ].join('\n')
        }

        const serializedCapabilities = operation.basedOnRead ?? []
        const decodedCapabilities: ReadCapability[] = []
        for (const token of serializedCapabilities) {
          const decoded = decodeReadCapabilityToken(token)
          if (typeof decoded === 'string') return decoded
          if (
            !params.capabilityIssuer ||
            !readCapabilityMatchesScope(decoded, {
              ...params.capabilityIssuer,
              path: operation.path,
            })
          ) {
            return `apply_patch rejected for ${operation.path}: basedOnRead does not match the active project, path, and run scope. Re-read the target range through the active runtime and retry with its fresh readCapability.`
          }
          decodedCapabilities.push(decoded)
        }
        const requiredRanges = decodedCapabilities.length
          ? validateReadCapabilities({
              path: operation.path,
              content: oldContent,
              capabilities: decodedCapabilities,
            })
          : []
        if (typeof requiredRanges === 'string') return requiredRanges

        const patchResult = tryApplyPatchWithFallbacks({
          oldContent,
          diff: sanitizedDiff,
          requiredRanges,
        })
        if (patchResult.patched === null) {
          return formatPatchFailureMessage({
            path: operation.path,
            attemptedStrategies: patchResult.attemptedStrategies,
            lastError: patchResult.lastError,
          })
        }

        const updatedContent = preserveOriginalLineEndings({
          original: oldContent,
          patched: patchResult.patched,
        })
        updateAfterHash = computeContentHash(updatedContent)
        const commitAuthorization = await authority.authorizeCommit(
          authorizedPath,
          'overwrite',
        )
        if (!commitAuthorization.allowed) {
          return `Update denied: ${commitAuthorization.code}`
        }
        throwIfAborted(params.signal)
        if (authority.capabilities.capabilities.has('conditional_commit')) {
          const begun = authority.beginCommit(operationId)
          if (!begun.begun) return 'Update commit could not begin.'
          const conditional = await authority.conditionalCommit(
            commitAuthorization.path,
            updatedContent,
            expected,
          )
          if (!conditional.supported || !conditional.result.applied) {
            authority.finishCommit(begun.lease, {
              succeeded: false,
              errorCode: 'STALE_STATE',
            })
            return `Update rejected for ${operation.path}: the file changed after it was read. Re-read it before retrying.`
          }
          updateReceipt = await authority.issueCommittedReceipt({
            operationId,
            callId: params.callId ?? operationId,
            authorityTier: 'conditional_commit',
            actions: [
              {
                actionId: `${operationId}:0`,
                index: 0,
                action: 'update',
                path: operation.path,
                beforeHash: updateBeforeHash,
              },
            ],
            expectedFinalHashes: {
              [operation.path]: hashFileContent(updatedContent),
            },
          })
          authority.finishCommit(begun.lease, { succeeded: true })
          return null
        }
        const validation = await authority.revalidateExpectedState(
          commitAuthorization.path,
          expected,
        )
        if (!validation.matches) {
          return `Update rejected for ${operation.path}: the file changed after it was read. Re-read it before retrying.`
        }
        const begun = authority.beginCommit(operationId)
        if (!begun.begun) return 'Update commit could not begin.'
        try {
          await fs.writeFile(fullPath, updatedContent)
          updateReceipt = await authority.issueCommittedReceipt({
            operationId,
            callId: params.callId ?? operationId,
            authorityTier: 'portable_path',
            actions: [
              {
                actionId: `${operationId}:0`,
                index: 0,
                action: 'update',
                path: operation.path,
                beforeHash: updateBeforeHash,
              },
            ],
            expectedFinalHashes: {
              [operation.path]: hashFileContent(updatedContent),
            },
          })
          authority.finishCommit(begun.lease, { succeeded: true })
        } catch (error) {
          authority.finishCommit(begun.lease, {
            succeeded: false,
            errorCode: 'WRITE_FAILED',
          })
          throw error
        }
        return null
      },
    )
    if (updateError) {
      authority.cancel(operationId)
      return [
        await errorResult(
          updateError,
          authority,
          params.callId ?? operationId,
          operation,
          operationId,
        ),
      ]
    }

    return [
      successResult({
        file: operation.path,
        action: 'update',
        operationId,
        receipt: updateReceipt!,
        beforeHash: updateBeforeHash,
        afterHash: updateAfterHash,
        finalContent: await fs.readFile(authorizedPath.operationPath, 'utf-8'),
        canonicalPath: authorizedPath.canonicalPath,
      }),
    ]
  } catch (error) {
    return [
      await errorResult(
        error instanceof Error ? error.message : String(error),
        authority,
        params.callId ?? operationId,
        operation,
        operationId,
      ),
    ]
  }
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return
  throw signal.reason instanceof Error
    ? signal.reason
    : new DOMException('Operation aborted', 'AbortError')
}
