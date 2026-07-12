/**
 * Conservative idiom-pattern signals for Python, Rust, and Go diffs.
 *
 * These pure helpers only inspect added lines from unified diffs. Findings are
 * advisory and meant for eval reporting/tests, not score enforcement.
 */

export type IdiomPatternLanguage = 'python' | 'rust' | 'go'

export interface IdiomPatternFinding {
  patternId: string
  language: IdiomPatternLanguage
  path: string
  lineNumber: number
  line: string
  message: string
}

interface DiffAddedLine {
  path: string
  lineNumber: number
  content: string
}

interface IdiomPatternRule {
  patternId: string
  language: IdiomPatternLanguage
  test: (line: string) => boolean
  message: string
}

const PYTHON_RULES: IdiomPatternRule[] = [
  {
    patternId: 'python-manual-open-close',
    language: 'python',
    test: (line) => /^\s*\w+\s*=\s*open\([^)]*\)\s*$/.test(line),
    message: 'Use a context manager when opening files.',
  },
  {
    patternId: 'python-os-path-join',
    language: 'python',
    test: (line) => /\bos\.path\.join\(/.test(line),
    message: 'Prefer pathlib for path construction in new Python code.',
  },
  {
    patternId: 'python-list-append-loop',
    language: 'python',
    test: (line) => /^\s*\w+\.append\([^)]*\)\s*$/.test(line),
    message: 'Consider a comprehension for simple collection construction.',
  },
]

const RUST_RULES: IdiomPatternRule[] = [
  {
    patternId: 'rust-unwrap',
    language: 'rust',
    test: (line) => /\.unwrap\(\)/.test(line),
    message:
      'Avoid unwrap in eval tasks; propagate or handle errors explicitly.',
  },
  {
    patternId: 'rust-expect',
    language: 'rust',
    test: (line) => /\.expect\("[^"]*"\)/.test(line),
    message:
      'Avoid expect in production paths; return Result with context instead.',
  },
  {
    patternId: 'rust-unnecessary-clone',
    language: 'rust',
    test: (line) => /\.clone\(\)/.test(line),
    message:
      'Review clone usage and prefer borrowing or ownership transfer when obvious.',
  },
]

const GO_RULES: IdiomPatternRule[] = [
  {
    patternId: 'go-panic-error-path',
    language: 'go',
    test: (line) => /\bpanic\(err\)/.test(line),
    message: 'Return errors instead of panicking on ordinary error paths.',
  },
  {
    patternId: 'go-discarded-error',
    language: 'go',
    test: (line) => /,\s*_\s*:=/.test(line) || /,\s*_\s*=/.test(line),
    message: 'Do not discard errors; handle or return them explicitly.',
  },
  {
    patternId: 'go-errorf-missing-wrap',
    language: 'go',
    test: (line) => /fmt\.Errorf\([^\n]*%v[^\n]*,\s*err\)/.test(line),
    message: 'Use %w when wrapping errors with fmt.Errorf.',
  },
]

const RULES_BY_LANGUAGE: Record<IdiomPatternLanguage, IdiomPatternRule[]> = {
  python: PYTHON_RULES,
  rust: RUST_RULES,
  go: GO_RULES,
}

const LANGUAGE_BY_EXTENSION: Record<string, IdiomPatternLanguage> = {
  '.py': 'python',
  '.rs': 'rust',
  '.go': 'go',
}

export function normalizeDiffPath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\.\//, '')
}

function languageExtensions(): string[] {
  return ['.py', '.rs', '.go']
}

export function languageForDiffPath(
  path: string,
): IdiomPatternLanguage | undefined {
  const normalized = normalizeDiffPath(path).toLowerCase()
  const extension = languageExtensions().find((ext) => normalized.endsWith(ext))
  return extension ? LANGUAGE_BY_EXTENSION[extension] : undefined
}

function parseHunkNewStart(line: string): number | undefined {
  const match = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line)
  if (!match) return undefined
  return Number(match[1])
}

function pathFromDiffHeader(line: string): string | undefined {
  const match = /^diff --git a\/(.+?) b\/(.+)$/.exec(line)
  return match ? normalizeDiffPath(match[2]) : undefined
}

function addedLinesFromDiff(diff: string): DiffAddedLine[] {
  const addedLines: DiffAddedLine[] = []
  let currentPath: string | undefined
  let newLineNumber = 0

  for (const rawLine of diff.split('\n')) {
    const headerPath = pathFromDiffHeader(rawLine)
    if (headerPath) {
      currentPath = headerPath
      newLineNumber = 0
      continue
    }

    const hunkStart = parseHunkNewStart(rawLine)
    if (hunkStart !== undefined) {
      newLineNumber = hunkStart
      continue
    }

    if (!currentPath || newLineNumber === 0) continue
    if (rawLine.startsWith('+++') || rawLine.startsWith('---')) continue

    if (rawLine.startsWith('+')) {
      addedLines.push({
        path: currentPath,
        lineNumber: newLineNumber,
        content: rawLine.slice(1),
      })
      newLineNumber++
      continue
    }

    if (rawLine.startsWith('-')) continue
    if (rawLine.startsWith(' ') || rawLine === '') newLineNumber++
  }

  return addedLines
}

export function detectIdiomPatternSignals(diff: string): IdiomPatternFinding[] {
  return addedLinesFromDiff(diff).flatMap((addedLine) => {
    const language = languageForDiffPath(addedLine.path)
    if (!language) return []

    return RULES_BY_LANGUAGE[language]
      .filter((rule) => rule.test(addedLine.content))
      .map((rule) => ({
        patternId: rule.patternId,
        language,
        path: addedLine.path,
        lineNumber: addedLine.lineNumber,
        line: addedLine.content,
        message: rule.message,
      }))
  })
}
