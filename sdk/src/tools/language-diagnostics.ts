import path from 'node:path'

export type LanguageDiagnosticSeverity = 'error' | 'warning' | 'info' | 'hint'

export type LanguageDiagnosticPosition = {
  /** 1-indexed line number, matching native compiler output. */
  line: number
  /** 1-indexed column number, matching native compiler output. */
  column: number
}

export type LanguageDiagnosticRange = {
  start: LanguageDiagnosticPosition
  end: LanguageDiagnosticPosition
}

export type LanguageDiagnostic = {
  file: string | null
  range: LanguageDiagnosticRange | null
  severity: LanguageDiagnosticSeverity
  code: string | null
  message: string
  command: string
  source: string
}

export type DiagnosticParserInput = {
  command: string
  cwd?: string
  stdout?: string
  stderr?: string
}

export type DiagnosticParser = {
  id: string
  parse: (input: DiagnosticParserInput) => LanguageDiagnostic[]
}

const MAX_DIAGNOSTICS = 200

type LocatedDiagnostic = {
  file: string
  line: number
  column?: number
  severity: LanguageDiagnosticSeverity
  code?: string
  message: string
  source: string
}

function severity(value: string): LanguageDiagnosticSeverity {
  const normalized = value.toLowerCase()
  if (normalized.includes('warn') || normalized === 'w') return 'warning'
  if (normalized === 'info' || normalized === 'note' || normalized === 'c') {
    return 'info'
  }
  if (normalized === 'hint') return 'hint'
  return 'error'
}

function normalizeFile(file: string, cwd?: string): string {
  const withoutUri = file.replace(/^file:\/\//, '').replace(/^res:\/\//, '')
  if (!cwd || !path.isAbsolute(withoutUri)) return withoutUri
  const relative = path.relative(cwd, withoutUri)
  return relative && !relative.startsWith('..') && !path.isAbsolute(relative)
    ? relative
    : withoutUri
}

function toDiagnostic(
  item: LocatedDiagnostic,
  input: DiagnosticParserInput,
): LanguageDiagnostic {
  const column = item.column && item.column > 0 ? item.column : 1
  const position = { line: item.line, column }
  return {
    file: normalizeFile(item.file, input.cwd),
    range: { start: position, end: position },
    severity: item.severity,
    code: item.code ?? null,
    message: item.message.trim(),
    command: input.command,
    source: item.source,
  }
}

function outputLines(input: DiagnosticParserInput): string[] {
  return `${input.stdout ?? ''}\n${input.stderr ?? ''}`
    .split(/\r?\n/)
    .map((line) => line.replace(/\x1b\[[0-9;]*m/g, ''))
}

const parenthesizedParser: DiagnosticParser = {
  id: 'parenthesized-compiler',
  parse(input) {
    const diagnostics: LanguageDiagnostic[] = []
    for (const line of outputLines(input)) {
      const match = line.match(
        /^(.+?)\((\d+),(\d+)\):\s*(error|warning|info)\s+([A-Za-z]+\d+):\s*(.+?)(?:\s+\[[^\]]+\])?$/i,
      )
      if (!match) continue
      diagnostics.push(
        toDiagnostic(
          {
            file: match[1],
            line: Number(match[2]),
            column: Number(match[3]),
            severity: severity(match[4]),
            code: match[5],
            message: match[6],
            source: 'compiler',
          },
          input,
        ),
      )
    }
    return diagnostics
  },
}

const colonCompilerParser: DiagnosticParser = {
  id: 'colon-compiler',
  parse(input) {
    const diagnostics: LanguageDiagnostic[] = []
    for (const line of outputLines(input)) {
      const match = line.match(
        /^(.+?):(\d+):(\d+):\s*(fatal error|error|warning|note|info):\s*(.+?)(?:\s+\[([^\]]+)\])?$/i,
      )
      if (!match) continue
      diagnostics.push(
        toDiagnostic(
          {
            file: match[1],
            line: Number(match[2]),
            column: Number(match[3]),
            severity: severity(match[4]),
            code: match[6],
            message: match[5],
            source: 'compiler',
          },
          input,
        ),
      )
    }
    return diagnostics
  },
}

const pythonParser: DiagnosticParser = {
  id: 'python',
  parse(input) {
    const diagnostics: LanguageDiagnostic[] = []
    for (const line of outputLines(input)) {
      const match = line.match(
        /^(.+?):(\d+):(\d+)\s+-\s+(error|warning|information|hint):\s*(.+?)(?:\s+\(([^)]+)\))?$/i,
      )
      if (!match) continue
      diagnostics.push(
        toDiagnostic(
          {
            file: match[1],
            line: Number(match[2]),
            column: Number(match[3]),
            severity: severity(match[4] === 'information' ? 'info' : match[4]),
            code: match[6],
            message: match[5],
            source: 'python',
          },
          input,
        ),
      )
    }
    return diagnostics
  },
}

const lintParser: DiagnosticParser = {
  id: 'language-linters',
  parse(input) {
    const diagnostics: LanguageDiagnostic[] = []
    let eslintFile: string | undefined
    for (const line of outputLines(input)) {
      if (/^[^\s].*\.(?:[cm]?[jt]sx?)$/.test(line.trim())) {
        eslintFile = line.trim()
        continue
      }

      const eslint = line.match(
        /^\s*(\d+):(\d+)\s+(error|warning)\s+(.+?)\s+([@\w][\w/-]+)\s*$/i,
      )
      if (eslint && eslintFile) {
        diagnostics.push(
          toDiagnostic(
            {
              file: eslintFile,
              line: Number(eslint[1]),
              column: Number(eslint[2]),
              severity: severity(eslint[3]),
              code: eslint[5],
              message: eslint[4],
              source: 'eslint',
            },
            input,
          ),
        )
        continue
      }

      const ruff = line.match(
        /^(.+?):(\d+):(\d+):\s*([A-Z][A-Z0-9]*\d{2,4})\s+(.+)$/,
      )
      if (ruff) {
        diagnostics.push(
          toDiagnostic(
            {
              file: ruff[1],
              line: Number(ruff[2]),
              column: Number(ruff[3]),
              severity: 'warning',
              code: ruff[4],
              message: ruff[5],
              source: 'ruff',
            },
            input,
          ),
        )
        continue
      }

      const rubocop = line.match(
        /^(.+?):(\d+):(\d+):\s*([CWEF]):\s*(.+?)(?:\s+\[([^\]]+)\])?$/,
      )
      if (rubocop) {
        diagnostics.push(
          toDiagnostic(
            {
              file: rubocop[1],
              line: Number(rubocop[2]),
              column: Number(rubocop[3]),
              severity: severity(rubocop[4] === 'W' ? 'warning' : rubocop[4]),
              code: rubocop[6],
              message: rubocop[5],
              source: 'rubocop',
            },
            input,
          ),
        )
      }
    }
    return diagnostics
  },
}

const jvmParser: DiagnosticParser = {
  id: 'jvm',
  parse(input) {
    const diagnostics: LanguageDiagnostic[] = []
    for (const line of outputLines(input)) {
      const maven = line.match(/^\[ERROR\]\s+(.+?):\[(\d+),(\d+)\]\s+(.+)$/)
      const kotlin = line.match(/^e:\s+(?:file:\/\/)?(.+?):(\d+):(\d+)\s+(.+)$/)
      const javac = line.match(/^(.+?\.java):(\d+):\s*error:\s*(.+)$/)
      const match = maven ?? kotlin ?? javac
      if (!match) continue
      diagnostics.push(
        toDiagnostic(
          {
            file: match[1],
            line: Number(match[2]),
            column: match === javac ? 1 : Number(match[3]),
            severity: 'error',
            message: match === javac ? match[3] : match[4],
            source: kotlin ? 'kotlin' : 'java',
          },
          input,
        ),
      )
    }
    return diagnostics
  },
}

const cargoParser: DiagnosticParser = {
  id: 'cargo',
  parse(input) {
    const lines = outputLines(input)
    const diagnostics: LanguageDiagnostic[] = []
    for (let index = 0; index < lines.length; index += 1) {
      const header = lines[index].match(
        /^(error|warning)(?:\[([^\]]+)\])?:\s*(.+)$/,
      )
      if (!header) continue
      for (
        let offset = 1;
        offset <= 4 && index + offset < lines.length;
        offset++
      ) {
        const location = lines[index + offset].match(
          /^\s*-->\s+(.+?):(\d+):(\d+)\s*$/,
        )
        if (!location) continue
        diagnostics.push(
          toDiagnostic(
            {
              file: location[1],
              line: Number(location[2]),
              column: Number(location[3]),
              severity: severity(header[1]),
              code: header[2],
              message: header[3],
              source: 'cargo',
            },
            input,
          ),
        )
        break
      }
    }
    return diagnostics
  },
}

const commandSpecificParser: DiagnosticParser = {
  id: 'command-specific',
  parse(input) {
    const diagnostics: LanguageDiagnostic[] = []
    const command = input.command.toLowerCase()
    for (const line of outputLines(input)) {
      if (/\bphpstan\b/.test(command)) {
        const match = line.match(/^(.+?):(\d+):\s*(.+)$/)
        if (match) {
          diagnostics.push(
            toDiagnostic(
              {
                file: match[1],
                line: Number(match[2]),
                severity: 'error',
                message: match[3],
                source: 'phpstan',
              },
              input,
            ),
          )
        }
      } else if (/\b(?:go\s+(?:test|vet)|php\s+-l)\b/.test(command)) {
        const match = line.match(/^(.+?):(\d+)(?::(\d+))?:\s*(.+)$/)
        if (match) {
          diagnostics.push(
            toDiagnostic(
              {
                file: match[1],
                line: Number(match[2]),
                column: match[3] ? Number(match[3]) : 1,
                severity: 'error',
                message: match[4],
                source: command.includes('php') ? 'php' : 'go',
              },
              input,
            ),
          )
        }
      }
    }
    return diagnostics
  },
}

const godotParser: DiagnosticParser = {
  id: 'godot',
  parse(input) {
    if (!/\bgodot\b/i.test(input.command)) return []
    const lines = outputLines(input)
    const diagnostics: LanguageDiagnostic[] = []
    for (let index = 0; index < lines.length; index += 1) {
      const header = lines[index].match(
        /^(?:SCRIPT ERROR:\s*)?(Parse Error|Error|Warning):\s*(.+)$/i,
      )
      if (!header) continue
      const nearby = lines.slice(index, index + 3).join(' ')
      const location = nearby.match(/(?:res:\/\/)?([^\s()]+\.gd):(\d+)/)
      if (!location) continue
      diagnostics.push(
        toDiagnostic(
          {
            file: location[1],
            line: Number(location[2]),
            severity: severity(header[1]),
            message: header[2],
            source: 'godot',
          },
          input,
        ),
      )
    }
    return diagnostics
  },
}

export const diagnosticParsers: readonly DiagnosticParser[] = [
  parenthesizedParser,
  colonCompilerParser,
  pythonParser,
  lintParser,
  jvmParser,
  cargoParser,
  commandSpecificParser,
  godotParser,
]

export function parseLanguageDiagnostics(
  input: DiagnosticParserInput,
  parsers: readonly DiagnosticParser[] = diagnosticParsers,
): LanguageDiagnostic[] {
  const diagnostics = parsers.flatMap((parser) => parser.parse(input))
  const seen = new Set<string>()
  const unique: LanguageDiagnostic[] = []
  for (const diagnostic of diagnostics) {
    const key = JSON.stringify([
      diagnostic.file,
      diagnostic.range,
      diagnostic.severity,
      diagnostic.code,
      diagnostic.message,
    ])
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(diagnostic)
    if (unique.length >= MAX_DIAGNOSTICS) break
  }
  return unique
}
