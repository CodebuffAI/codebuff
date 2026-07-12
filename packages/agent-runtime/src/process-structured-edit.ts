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
  edit: StructuredTransactionEdit & {
    operation: InsertImportStructuredOperation
  }
  content: string
  logger: Logger
}): StructuredEditResult {
  const { edit, content, logger } = params
  const importStatement = normalizeImportStatement(
    edit.operation.importStatement,
    edit.path,
  )
  if (!isValidImportStatement(edit.path, importStatement)) {
    return {
      error: `Invalid insert_import statement for ${edit.path}: expected a complete language-native import declaration.`,
    }
  }

  const goBlockInsertion = insertIntoGoImportBlock(
    edit.path,
    content,
    importStatement,
  )
  if (goBlockInsertion) {
    if ('error' in goBlockInsertion) return goBlockInsertion
    return {
      content: goBlockInsertion.content,
      messages: [`Applied structured insert_import in ${edit.path}.`],
    }
  }

  const existingImport = findImportStatement(
    edit.path,
    content,
    importStatement,
  )
  if (existingImport) {
    return {
      error: `Cannot insert import into ${edit.path}: import already exists.`,
    }
  }

  const insertionOffset = getImportInsertionOffset(edit.path, content)
  const prefix = content.slice(0, insertionOffset)
  const suffix = content.slice(insertionOffset)
  const separator = prefix.length === 0 || prefix.endsWith('\n') ? '' : '\n'
  const trailing =
    suffix.length === 0 ? '' : suffix.startsWith('\n') ? '' : '\n'
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
  edit: StructuredTransactionEdit & {
    operation: RemoveImportStructuredOperation
  }
  content: string
  logger: Logger
}): StructuredEditResult {
  const { edit, content, logger } = params
  const importStatement = edit.operation.importStatement
    ? normalizeImportStatement(edit.operation.importStatement, edit.path)
    : undefined
  const moduleSpecifier = edit.operation.moduleSpecifier

  if (!importStatement && !moduleSpecifier) {
    return {
      error: `Invalid remove_import operation for ${edit.path}: provide importStatement or moduleSpecifier.`,
    }
  }
  if (importStatement && !isValidImportStatement(edit.path, importStatement)) {
    return {
      error: `Invalid remove_import statement for ${edit.path}: expected a complete language-native import declaration.`,
    }
  }

  if (moduleSpecifier && extensionForPath(edit.path) === '.go') {
    const goRemoval = removeFromGoImportBlock(content, moduleSpecifier)
    if (goRemoval) {
      return {
        content: goRemoval,
        messages: [`Applied structured remove_import in ${edit.path}.`],
      }
    }
  }

  const ranges = getImportRanges(edit.path, content)
  const matchingRanges = ranges.filter((range) => {
    const statement = content.slice(range.start, range.end).trim()
    if (
      importStatement &&
      normalizeImportStatement(statement, edit.path) === importStatement
    ) {
      return true
    }
    return moduleSpecifier
      ? getImportModuleSpecifier(edit.path, statement) === moduleSpecifier
      : false
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
    {
      path: edit.path,
      operation: edit.operation.kind,
      importStatement,
      moduleSpecifier,
    },
    'Applying structured edit',
  )

  return {
    content: `${content.slice(0, range.start)}${content.slice(range.end)}`,
    messages: [`Applied structured remove_import in ${edit.path}.`],
  }
}

function normalizeImportStatement(statement: string, filePath: string): string {
  const trimmed = statement.trim()
  return [
    '.ts',
    '.tsx',
    '.js',
    '.jsx',
    '.mts',
    '.cts',
    '.mjs',
    '.cjs',
  ].includes(extensionForPath(filePath))
    ? trimmed.replace(/;$/, '')
    : trimmed
}

function insertIntoGoImportBlock(
  filePath: string,
  content: string,
  importStatement: string,
): { content: string } | { error: string } | null {
  if (extensionForPath(filePath) !== '.go') return null
  const specifier = importStatement.match(/^import\s+(.+)$/s)?.[1]
  if (!specifier || specifier.startsWith('(')) return null
  const moduleSpecifier = specifier.match(/["`]([^"`]+)["`]/)?.[1]
  const block =
    /(^[ \t]*import[ \t]*\([ \t]*\r?\n)([\s\S]*?)(^[ \t]*\)[ \t]*\r?\n?)/m.exec(
      content,
    )
  if (!block) return null
  if (
    moduleSpecifier &&
    new RegExp(`["\`]${escapeRegex(moduleSpecifier)}["\`]`).test(block[2])
  ) {
    return {
      error: `Cannot insert import into ${filePath}: import already exists.`,
    }
  }
  const closingOffset = block.index + block[1].length + block[2].length
  return {
    content: `${content.slice(0, closingOffset)}\t${specifier}\n${content.slice(closingOffset)}`,
  }
}

function removeFromGoImportBlock(
  content: string,
  moduleSpecifier: string,
): string | null {
  const block =
    /(^[ \t]*import[ \t]*\([ \t]*\r?\n)([\s\S]*?)(^[ \t]*\)[ \t]*\r?\n?)/m.exec(
      content,
    )
  if (!block) return null
  const lineRegex = new RegExp(
    `^[ \\t]*(?:[\\w.]+\\s+)?["\`]${escapeRegex(moduleSpecifier)}["\`][ \\t]*(?:\\/\\/.*)?\\r?\\n?`,
    'm',
  )
  const line = lineRegex.exec(block[2])
  if (!line) return null
  const start = block.index + block[1].length + line.index
  return `${content.slice(0, start)}${content.slice(start + line[0].length)}`
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function extensionForPath(filePath: string): string {
  const match = filePath.toLowerCase().match(/\.[^.\/]+$/)
  return match?.[0] ?? ''
}

function isValidImportStatement(filePath: string, statement: string): boolean {
  const extension = extensionForPath(filePath)
  if (
    ['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts', '.mjs', '.cjs'].includes(
      extension,
    )
  ) {
    return (
      /^import(?:\s+type)?\s+[\s\S]+\s+from\s+['"][^'"]+['"]$/.test(
        statement,
      ) || /^import\s+['"][^'"]+['"]$/.test(statement)
    )
  }
  if (['.py', '.pyi'].includes(extension)) {
    return /^(?:from\s+[.\w]+\s+import\s+.+|import\s+[\w.]+(?:\s+as\s+\w+)?)$/.test(
      statement,
    )
  }
  if (extension === '.rs')
    return /^(?:pub\s+)?(?:use\s+[^;]+|mod\s+\w+);?$/.test(statement)
  if (extension === '.go')
    return (
      /^import\s+(?:[\w.]+\s+)?["`][^"`]+["`]$/.test(statement) ||
      /^import\s*\([\s\S]*["`][^"`]+["`][\s\S]*\)$/.test(statement)
    )
  if (['.java', '.kt', '.kts'].includes(extension))
    return /^import\s+(?:static\s+)?[\w.*]+;?$/.test(statement)
  if (extension === '.cs')
    return /^(?:global\s+)?using\s+(?:\w+\s*=\s*)?[\w.]+;?$/.test(statement)
  if (
    ['.c', '.cc', '.cpp', '.cxx', '.h', '.hh', '.hpp', '.hxx'].includes(
      extension,
    )
  ) {
    return /^#\s*include\s*[<"][^>"]+[>"]$/.test(statement)
  }
  if (extension === '.rb')
    return /^require(?:_relative)?\s*[('" ]+[^'"\s)]+['"]?\)?$/.test(statement)
  if (extension === '.php')
    return /^(?:use\s+[\w\\]+|(?:require|require_once|include|include_once)\s*\(?\s*['"][^'"]+['"]\)?);?$/.test(
      statement,
    )
  if (extension === '.swift')
    return /^import\s+(?:\w+\s+)?[\w.]+$/.test(statement)
  if (extension === '.gd')
    return /^(?:const|var)\s+\w+(?::[^=]+)?\s*=\s*(?:preload|load)\(\s*["']res:\/\/[^"']+["']\s*\)$/.test(
      statement,
    )
  return false
}

function findImportStatement(
  filePath: string,
  content: string,
  importStatement: string,
): boolean {
  return getImportRanges(filePath, content).some(
    (range) =>
      normalizeImportStatement(
        content.slice(range.start, range.end),
        filePath,
      ) === importStatement,
  )
}

function getImportInsertionOffset(filePath: string, content: string): number {
  const ranges = getImportRanges(filePath, content)
  if (ranges.length > 0) {
    return ranges[ranges.length - 1].end
  }

  const extension = extensionForPath(filePath)
  const shebangEnd = content.startsWith('#!') ? content.indexOf('\n') + 1 : 0
  if (['.py', '.pyi'].includes(extension)) {
    let offset = shebangEnd
    const afterShebang = content.slice(offset)
    const encoding = afterShebang.match(
      /^#.*coding[:=][ \t]*[-\w.]+[ \t]*\r?\n/,
    )
    if (encoding) offset += encoding[0].length
    const docstring = content
      .slice(offset)
      .match(/^(?:[ \t]*\r?\n)*[rubfRUBF]*("""|''')[\s\S]*?\1[ \t]*\r?\n?/)
    if (docstring) offset += docstring[0].length
    return offset
  }
  if (extension === '.rs') {
    const prologue = content.match(
      /^(?:(?:#!\[[^\n]+\]|\/\/![^\n]*)[ \t]*\r?\n)*/,
    )
    return prologue?.[0].length ?? 0
  }
  if (extension === '.go') {
    const packageMatch = content.match(/^[ \t]*package\s+\w+[ \t]*\r?\n/m)
    return packageMatch ? packageMatch.index! + packageMatch[0].length : 0
  }
  if (['.java', '.kt', '.kts'].includes(extension)) {
    const packageMatch = content.match(
      /^[ \t]*package\s+[\w.]+[ \t]*;?[ \t]*\r?\n/m,
    )
    return packageMatch ? packageMatch.index! + packageMatch[0].length : 0
  }
  if (extension === '.php') {
    return getPhpImportInsertionOffset(content)
  }
  if (extension === '.gd') {
    const headerMatches = [
      ...content.matchAll(
        /^[ \t]*(?:@tool|class_name\s+\w+|extends\s+.+)[ \t]*\r?\n/gm,
      ),
    ]
    const lastHeader = headerMatches.at(-1)
    return lastHeader?.index !== undefined
      ? lastHeader.index + lastHeader[0].length
      : 0
  }
  const useStrictMatch = content
    .slice(shebangEnd)
    .match(/^(?:['"]use strict['"];?\r?\n)/)
  return shebangEnd + (useStrictMatch?.[0].length ?? 0)
}

function getPhpImportInsertionOffset(content: string): number {
  let offset = content.match(/^\uFEFF?<\?php\b/)?.[0].length ?? 0
  offset = skipPhpTrivia(content, offset)

  const declareMatch = content.slice(offset).match(/^declare\s*\([^)]*\)\s*;/)
  if (declareMatch) {
    offset += declareMatch[0].length
    offset = skipPhpTrivia(content, offset)
  }

  const namespaceMatch = content
    .slice(offset)
    .match(/^namespace\s+[\w\\]+\s*(?:;|\{)/)
  if (namespaceMatch) offset += namespaceMatch[0].length

  const newline = content.slice(offset).match(/^[ \t]*\r?\n/)
  return offset + (newline?.[0].length ?? 0)
}

function skipPhpTrivia(content: string, start: number): number {
  let offset = start
  while (offset < content.length) {
    const trivia = content
      .slice(offset)
      .match(
        /^(?:\s+|\/\*[\s\S]*?\*\/|\/\/[^\n]*(?:\n|$)|#(?!\[)[^\n]*(?:\n|$))/,
      )
    if (!trivia) break
    offset += trivia[0].length
  }
  return offset
}

function getImportRanges(
  filePath: string,
  content: string,
): { start: number; end: number }[] {
  const ranges: { start: number; end: number }[] = []
  const extension = extensionForPath(filePath)
  const importRegex = [
    '.ts',
    '.tsx',
    '.js',
    '.jsx',
    '.mts',
    '.cts',
    '.mjs',
    '.cjs',
  ].includes(extension)
    ? /^import(?:\s+type)?(?:\s+[\s\S]*?\s+from\s+['"][^'"]+['"]|\s+['"][^'"]+['"]);?\r?\n?/gm
    : importLineRegex(extension)
  let match: RegExpExecArray | null
  while ((match = importRegex.exec(content)) !== null) {
    ranges.push({ start: match.index, end: match.index + match[0].length })
  }
  return ranges
}

function importLineRegex(extension: string): RegExp {
  if (['.py', '.pyi'].includes(extension))
    return /^[ \t]*(?:from\s+[.\w]+\s+import\s+.+|import\s+.+)\r?\n?/gm
  if (extension === '.rs')
    return /^[ \t]*(?:pub\s+)?(?:use\s+[^;]+;?|mod\s+\w+;?)[ \t]*\r?\n?/gm
  if (extension === '.go')
    return /^[ \t]*import(?:\s+(?:[\w.]+\s+)?["`][^"`]+["`][ \t]*|[ \t]*\([\s\S]*?^[ \t]*\)[ \t]*)\r?\n?/gm
  if (['.java', '.kt', '.kts'].includes(extension))
    return /^[ \t]*import\s+(?:static\s+)?[\w.*]+[ \t]*;?[ \t]*\r?\n?/gm
  if (extension === '.cs')
    return /^[ \t]*(?:global\s+)?using\s+(?:\w+\s*=\s*)?[\w.]+[ \t]*;[ \t]*\r?\n?/gm
  if (
    ['.c', '.cc', '.cpp', '.cxx', '.h', '.hh', '.hpp', '.hxx'].includes(
      extension,
    )
  )
    return /^[ \t]*#\s*include\s*[<"][^>"]+[>"][ \t]*\r?\n?/gm
  if (extension === '.rb')
    return /^[ \t]*require(?:_relative)?\s*[('" ]+[^'"\s)]+['"]?\)?[ \t]*\r?\n?/gm
  if (extension === '.php')
    return /^[ \t]*(?:use\s+[\w\\]+|(?:require|require_once|include|include_once)\s*\(?\s*['"][^'"]+['"]\)?)[ \t]*;?[ \t]*\r?\n?/gm
  if (extension === '.swift')
    return /^[ \t]*import\s+(?:\w+\s+)?[\w.]+[ \t]*\r?\n?/gm
  if (extension === '.gd')
    return /^[ \t]*(?:const|var)\s+\w+(?::[^=]+)?\s*=\s*(?:preload|load)\(\s*["']res:\/\/[^"']+["']\s*\)[ \t]*\r?\n?/gm
  return /$a/g
}

function getImportModuleSpecifier(
  filePath: string,
  statement: string,
): string | null {
  const extension = extensionForPath(filePath)
  const fromMatch = statement.match(/\sfrom\s+['"]([^'"]+)['"]\s*;?$/)
  if (fromMatch) return fromMatch[1]
  const sideEffectMatch = statement.match(/^import\s+['"]([^'"]+)['"]\s*;?$/)
  if (sideEffectMatch) return sideEffectMatch[1]
  if (['.py', '.pyi'].includes(extension)) {
    return (
      statement.match(/^from\s+([.\w]+)\s+import/)?.[1] ??
      statement.match(/^import\s+([\w.]+)/)?.[1] ??
      null
    )
  }
  if (extension === '.rs')
    return statement.match(/^(?:pub\s+)?(?:use|mod)\s+([^;]+)/)?.[1] ?? null
  if (extension === '.go')
    return statement.match(/["`]([^"`]+)["`]/)?.[1] ?? null
  if (['.java', '.kt', '.kts'].includes(extension))
    return statement.match(/^import\s+(?:static\s+)?([\w.*]+)/)?.[1] ?? null
  if (extension === '.cs')
    return statement.match(/using\s+(?:\w+\s*=\s*)?([\w.]+)/)?.[1] ?? null
  if (
    ['.c', '.cc', '.cpp', '.cxx', '.h', '.hh', '.hpp', '.hxx'].includes(
      extension,
    )
  )
    return statement.match(/[<"]([^>"]+)[>"]/)?.[1] ?? null
  if (extension === '.rb')
    return (
      statement.match(/require(?:_relative)?\s*[('" ]+([^'"\s)]+)/)?.[1] ?? null
    )
  if (extension === '.php')
    return (
      statement.match(/^use\s+([\w\\]+)/)?.[1]?.replace(/\\/g, '/') ??
      statement.match(/['"]([^'"]+)['"]/)?.[1] ??
      null
    )
  if (extension === '.swift')
    return statement.match(/^import\s+(?:\w+\s+)?([\w.]+)/)?.[1] ?? null
  if (extension === '.gd')
    return statement.match(/["']res:\/\/([^"']+)["']/)?.[1] ?? null
  return null
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
