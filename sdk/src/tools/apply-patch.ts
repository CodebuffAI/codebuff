import path from 'path'

import type { ApplyPatchOperation } from '@codebuff/common/tools/params/tool/apply-patch'
import type { CodebuffToolOutput } from '@codebuff/common/tools/list'
import type { CodebuffFileSystem } from '@codebuff/common/types/filesystem'

type ApplyPatchResult = CodebuffToolOutput<'apply_patch'>
type ApplyPatchJson = ApplyPatchResult[number] & { type: 'json' }
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

function hasTraversal(targetPath: string): boolean {
  const normalized = path.normalize(targetPath)
  return path.isAbsolute(normalized) || normalized.startsWith('..')
}

function normalizeLineEndings(input: string): string {
  return input.replace(/\r\n/g, '\n')
}

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
): { newIndex: number; fuzz: number } {
  if (context.length === 0) {
    return { newIndex: start, fuzz: 0 }
  }

  for (let i = start; i < lines.length; i += 1) {
    if (equalsSlice(lines, context, i, (value) => value)) {
      return { newIndex: i, fuzz: 0 }
    }
  }

  for (let i = start; i < lines.length; i += 1) {
    if (equalsSlice(lines, context, i, (value) => value.trimEnd())) {
      return { newIndex: i, fuzz: 1 }
    }
  }

  for (let i = start; i < lines.length; i += 1) {
    if (equalsSlice(lines, context, i, (value) => value.trim())) {
      return { newIndex: i, fuzz: 100 }
    }
  }

  return { newIndex: -1, fuzz: 0 }
}

function findContext(
  lines: string[],
  context: string[],
  start: number,
  eof: boolean,
): { newIndex: number; fuzz: number } {
  if (eof) {
    const endStart = Math.max(0, lines.length - context.length)
    const endMatch = findContextCore(lines, context, endStart)
    if (endMatch.newIndex !== -1) {
      return endMatch
    }

    const fallback = findContextCore(lines, context, start)
    return { newIndex: fallback.newIndex, fuzz: fallback.fuzz + 10000 }
  }

  return findContextCore(lines, context, start)
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
    const hasBareHeader = line === '@@'
    const hasWrappedHeader = isWrappedAtHeader(line)
    const hasAnchorHeader = line.startsWith('@@ ') && !hasWrappedHeader
    const hasAnyHeader = hasBareHeader || hasWrappedHeader || hasAnchorHeader

    if (hasAnchorHeader) {
      anchor = line.slice(3)
      parser.index += 1
    } else if (hasBareHeader || hasWrappedHeader) {
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

    const { newIndex, fuzz } = findContext(inputLines, nextContext, cursor, eof)

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

    destinationLines.push(...originalLines.slice(originalIndex, chunk.origIndex))
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
): { result: string; fuzz: number } {
  const diffLines = normalizeDiffLines(diff)

  if (mode === 'create') {
    return { result: parseCreateDiff(diffLines), fuzz: 0 }
  }

  const { chunks, fuzz } = parseUpdateDiff(diffLines, input)
  return { result: applyChunks(input, chunks), fuzz }
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
      const { result: patched } = applyDiff(attempt.source, attempt.diff, 'default')

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

function successResult(file: string, action: PatchAction): ApplyPatchJson {
  return {
    type: 'json',
    value: {
      message: 'Applied 1 patch operation.',
      applied: [{ file, action }],
    },
  }
}

function errorResult(errorMessage: string): ApplyPatchJson {
  return {
    type: 'json',
    value: { errorMessage },
  }
}

function parseOperation(parameters: unknown): ApplyPatchOperation | null {
  if (
    typeof parameters !== 'object' ||
    parameters === null ||
    !('operation' in parameters) ||
    typeof (parameters as { operation: unknown }).operation !== 'object'
  ) {
    return null
  }

  return (parameters as { operation: ApplyPatchOperation }).operation
}

export async function applyPatchTool(params: {
  parameters: unknown
  cwd: string
  fs: CodebuffFileSystem
}): Promise<ApplyPatchResult> {
  const { parameters, cwd, fs } = params
  const operation = parseOperation(parameters)

  if (!operation) {
    return [errorResult('Missing or invalid operation object.')]
  }

  try {
    if (hasTraversal(operation.path)) {
      throw new Error(`Invalid path: ${operation.path}`)
    }

    const fullPath = path.join(cwd, operation.path)

    if (operation.type === 'create_file') {
      const sanitizedDiff = sanitizeUnifiedDiff(operation.diff)
      const { result: content } = applyDiff('', sanitizedDiff, 'create')

      await fs.mkdir(path.dirname(fullPath), { recursive: true })
      await fs.writeFile(fullPath, content)

      return [successResult(operation.path, 'add')]
    }

    if (operation.type === 'delete_file') {
      await fs.unlink(fullPath)
      return [successResult(operation.path, 'delete')]
    }

    const sanitizedDiff = sanitizeUnifiedDiff(operation.diff)
    const oldContent = await fs.readFile(fullPath, 'utf-8')
    const patchResult = tryApplyPatchWithFallbacks({
      oldContent,
      diff: sanitizedDiff,
    })

    if (!patchResult.patched) {
      return [
        errorResult(
          formatPatchFailureMessage({
            path: operation.path,
            attemptedStrategies: patchResult.attemptedStrategies,
            lastError: patchResult.lastError,
          }),
        ),
      ]
    }

    await fs.writeFile(
      fullPath,
      preserveOriginalLineEndings({
        original: oldContent,
        patched: patchResult.patched,
      }),
    )

    return [successResult(operation.path, 'update')]
  } catch (error) {
    return [errorResult(error instanceof Error ? error.message : String(error))]
  }
}
