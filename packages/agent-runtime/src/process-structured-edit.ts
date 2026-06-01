import type { Logger } from '@codebuff/common/types/contracts/logger'

export type InsertTextStructuredOperation = {
  kind: 'insert_text'
  position: {
    line: number
    column: number
  }
  text: string
}

export type InsertImportStructuredOperation = {
  kind: 'insert_import'
  importStatement: string
}

export type RemoveImportStructuredOperation = {
  kind: 'remove_import'
  importStatement?: string
  moduleSpecifier?: string
}

export type StructuredEditOperation =
  | InsertTextStructuredOperation
  | InsertImportStructuredOperation
  | RemoveImportStructuredOperation

export type StructuredTransactionEdit = {
  id?: string
  type: 'structured'
  path: string
  operation: StructuredEditOperation
}

type StructuredEditResult =
  | {
      content: string
      messages: string[]
    }
  | {
      error: string
    }

export async function processStructuredEdit(params: {
  edit: StructuredTransactionEdit
  initialContentPromise: Promise<string | null>
  logger: Logger
}): Promise<StructuredEditResult> {
  const { edit, initialContentPromise, logger } = params
  const initialContent = await initialContentPromise

  if (initialContent === null) {
    return {
      error: `Cannot apply structured ${edit.operation.kind} edit to ${edit.path}: file does not exist or could not be read.`,
    }
  }

  switch (edit.operation.kind) {
    case 'insert_text':
      return insertText({
        edit: { ...edit, operation: edit.operation },
        content: initialContent,
        logger,
      })
    case 'insert_import':
      return insertImport({
        edit: { ...edit, operation: edit.operation },
        content: initialContent,
        logger,
      })
    case 'remove_import':
      return removeImport({
        edit: { ...edit, operation: edit.operation },
        content: initialContent,
        logger,
      })
  }
}

function insertText(params: {
  edit: StructuredTransactionEdit & { operation: InsertTextStructuredOperation }
  content: string
  logger: Logger
}): StructuredEditResult {
  const { edit, content, logger } = params
  const { line, column } = edit.operation.position

  if (line < 1 || column < 1) {
    return {
      error: `Invalid insert_text position for ${edit.path}: line and column are 1-indexed and must be >= 1.`,
    }
  }

  const lineStartOffsets = getLineStartOffsets(content)
  if (line > lineStartOffsets.length) {
    return {
      error: `Invalid insert_text position for ${edit.path}: line ${line} is past end of file (${lineStartOffsets.length} line(s)).`,
    }
  }

  const lineStart = lineStartOffsets[line - 1]
  const lineEnd = getLineEndOffset(content, lineStart)
  const lineLength = lineEnd - lineStart
  if (column > lineLength + 1) {
    return {
      error: `Invalid insert_text position for ${edit.path}: column ${column} is past end of line (${lineLength + 1}).`,
    }
  }

  const offset = lineStart + column - 1
  logger.debug(
    {
      path: edit.path,
      operation: edit.operation.kind,
      line,
      column,
      insertedLength: edit.operation.text.length,
    },
    'Applying structured edit',
  )

  return {
    content: `${content.slice(0, offset)}${edit.operation.text}${content.slice(offset)}`,
    messages: [
      `Applied structured insert_text at ${edit.path}:${line}:${column}.`,
    ],
  }
}

function insertImport(params: {
  edit: StructuredTransactionEdit & { operation: InsertImportStructuredOperation }
  content: string
  logger: Logger
}): StructuredEditResult {
  const { edit, content, logger } = params
  const importStatement = normalizeImportStatement(edit.operation.importStatement)
  if (!isValidImportStatement(importStatement)) {
    return {
      error: `Invalid insert_import statement for ${edit.path}: expected a complete TypeScript import declaration.`,
    }
  }

  const existingImport = findImportStatement(content, importStatement)
  if (existingImport) {
    return {
      error: `Cannot insert import into ${edit.path}: import already exists.`,
    }
  }

  const insertionOffset = getImportInsertionOffset(content)
  const prefix = content.slice(0, insertionOffset)
  const suffix = content.slice(insertionOffset)
  const separator = prefix.length === 0 || prefix.endsWith('\n') ? '' : '\n'
  const trailing = suffix.length === 0 ? '' : suffix.startsWith('\n') ? '' : '\n'
  logger.debug(
    { path: edit.path, operation: edit.operation.kind, importStatement },
    'Applying structured edit',
  )

  return {
    content: `${prefix}${separator}${importStatement}\n${trailing}${suffix}`,
    messages: [`Applied structured insert_import in ${edit.path}.`],
  }
}

function removeImport(params: {
  edit: StructuredTransactionEdit & { operation: RemoveImportStructuredOperation }
  content: string
  logger: Logger
}): StructuredEditResult {
  const { edit, content, logger } = params
  const importStatement = edit.operation.importStatement
    ? normalizeImportStatement(edit.operation.importStatement)
    : undefined
  const moduleSpecifier = edit.operation.moduleSpecifier

  if (!importStatement && !moduleSpecifier) {
    return {
      error: `Invalid remove_import operation for ${edit.path}: provide importStatement or moduleSpecifier.`,
    }
  }
  if (importStatement && !isValidImportStatement(importStatement)) {
    return {
      error: `Invalid remove_import statement for ${edit.path}: expected a complete TypeScript import declaration.`,
    }
  }

  const ranges = getImportRanges(content)
  const matchingRanges = ranges.filter((range) => {
    const statement = content.slice(range.start, range.end).trim()
    if (importStatement && normalizeImportStatement(statement) === importStatement) {
      return true
    }
    return moduleSpecifier ? getImportModuleSpecifier(statement) === moduleSpecifier : false
  })

  if (matchingRanges.length === 0) {
    return {
      error: `Cannot remove import from ${edit.path}: no matching import declaration found.`,
    }
  }
  if (matchingRanges.length > 1) {
    return {
      error: `Cannot remove import from ${edit.path}: ${matchingRanges.length} matching import declarations found.`,
    }
  }

  const range = matchingRanges[0]
  logger.debug(
    { path: edit.path, operation: edit.operation.kind, importStatement, moduleSpecifier },
    'Applying structured edit',
  )

  return {
    content: `${content.slice(0, range.start)}${content.slice(range.end)}`,
    messages: [`Applied structured remove_import in ${edit.path}.`],
  }
}

function normalizeImportStatement(statement: string): string {
  return statement.trim().replace(/;$/, '')
}

function isValidImportStatement(statement: string): boolean {
  return /^import(?:\s+type)?\s+[\s\S]+\s+from\s+['"][^'"]+['"]$/.test(statement) ||
    /^import\s+['"][^'"]+['"]$/.test(statement)
}

function findImportStatement(content: string, importStatement: string): boolean {
  return getImportRanges(content).some(
    (range) => normalizeImportStatement(content.slice(range.start, range.end)) === importStatement,
  )
}

function getImportInsertionOffset(content: string): number {
  const ranges = getImportRanges(content)
  if (ranges.length > 0) {
    return ranges[ranges.length - 1].end
  }

  const shebangEnd = content.startsWith('#!') ? content.indexOf('\n') + 1 : 0
  const useStrictMatch = content.slice(shebangEnd).match(/^(?:['"]use strict['"];?\r?\n)/)
  return shebangEnd + (useStrictMatch?.[0].length ?? 0)
}

function getImportRanges(content: string): { start: number; end: number }[] {
  const ranges: { start: number; end: number }[] = []
  const importRegex = /^import(?:\s+type)?(?:\s+[\s\S]*?\s+from\s+['"][^'"]+['"]|\s+['"][^'"]+['"]);?\r?\n?/gm
  let match: RegExpExecArray | null
  while ((match = importRegex.exec(content)) !== null) {
    ranges.push({ start: match.index, end: match.index + match[0].length })
  }
  return ranges
}

function getImportModuleSpecifier(statement: string): string | null {
  const fromMatch = statement.match(/\sfrom\s+['"]([^'"]+)['"]\s*;?$/)
  if (fromMatch) return fromMatch[1]
  const sideEffectMatch = statement.match(/^import\s+['"]([^'"]+)['"]\s*;?$/)
  return sideEffectMatch?.[1] ?? null
}

function getLineStartOffsets(content: string): number[] {
  const offsets = [0]
  for (let index = 0; index < content.length; index++) {
    if (content[index] === '\n' && index + 1 < content.length) {
      offsets.push(index + 1)
    }
  }
  return offsets
}

function getLineEndOffset(content: string, lineStart: number): number {
  const newlineIndex = content.indexOf('\n', lineStart)
  const rawLineEnd = newlineIndex === -1 ? content.length : newlineIndex
  return rawLineEnd > lineStart && content[rawLineEnd - 1] === '\r'
    ? rawLineEnd - 1
    : rawLineEnd
}
