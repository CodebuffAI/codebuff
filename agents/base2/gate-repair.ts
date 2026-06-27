/**
 * Pure validation-failure parsing helpers extracted from `base2.ts`.
 *
 * These deterministically parse raw hook-failure strings (produced by
 * `collectHookFailures` in base2.ts) into structured
 * `{file, line, column, message, source}` records so the gate can spawn
 * a targeted editor repair instead of surfacing raw stderr for the model
 * to guess at.
 *
 * NOTE: equivalent inline copies of these helpers exist inside
 * `createBase2`'s `handleSteps` generator because that function is
 * serialized via `handleSteps.toString()` and reconstructed with
 * `new Function(...)`. Reconstructed functions lose their module
 * closure, so they cannot reference imports from this file. Keep the
 * two implementations in sync — `agents/__tests__/gate-repair-parity.test.ts`
 * enforces this.
 */

export type ParsedValidationFailure = {
  file: string
  line?: number
  column?: number
  message: string
  /** Hook name extracted from the `- {name} failed (exit N):` prefix, or 'unknown'. */
  source: string
}

/**
 * Parses raw hook-failure strings into structured file:line:column records.
 *
 * Each input string is expected to be in one of two forms:
 *   1. `- {hookName} failed (exit {code}):\n{stdout+stderr}` (from collectHookFailures)
 *   2. A raw errorMessage string (no prefix)
 *
 * Within each failure's body, diagnostic locations are extracted in order:
 *   - tsc:        `src/foo.ts(12,34): error TS2322: ...`
 *   - eslint/gcc: `/path/file.js:10:5: message`
 *   - generic:    `path:10: message` (no column)
 *
 * The first format that yields any matches wins per failure string (a single
 * hook's output is typically homogeneous). Failures with no parseable
 * file:line get an entry with `file: ''` so the caller can detect
 * unparseable output and fall back to raw stderr surfacing.
 *
 * Deduplicates by `file:line:column` within a single call.
 */
export function parseValidationFailures(
  failures: string[],
): ParsedValidationFailure[] {
  const out: ParsedValidationFailure[] = []
  const seen = new Set<string>()
  for (const raw of failures) {
    if (typeof raw !== 'string' || !raw.trim()) continue
    let source = 'unknown'
    let body = raw
    const prefixMatch = raw.match(/^-\s+(\S+)\s+failed\s+\(exit\s+\d+\):\s*\n?/)
    if (prefixMatch) {
      source = prefixMatch[1]
      body = raw.slice(prefixMatch[0].length)
    }
    const parsed: ParsedValidationFailure[] = []
    // tsc: "file.ts(line,col): error TSxxxx: message"
    const tscRe = /^([^(]+)\((\d+),(\d+)\):\s*(error|warning)\s+(.+)$/gm
    let m: RegExpExecArray | null
    while ((m = tscRe.exec(body)) !== null) {
      parsed.push({
        file: m[1].trim(),
        line: parseInt(m[2], 10),
        column: parseInt(m[3], 10),
        message: `${m[4]}: ${m[5]}`.trim(),
        source,
      })
    }
    if (parsed.length === 0) {
      // eslint / gcc / rust: "file:line:col: message"
      const unixRe = /^(\S+?):(\d+):(\d+):\s*(.+)$/gm
      while ((m = unixRe.exec(body)) !== null) {
        parsed.push({
          file: m[1].trim(),
          line: parseInt(m[2], 10),
          column: parseInt(m[3], 10),
          message: m[4].trim(),
          source,
        })
      }
    }
    if (parsed.length === 0) {
      // generic: "file:line: message" (no column)
      const genericRe = /^(\S+?):(\d+):\s+(.+)$/gm
      while ((m = genericRe.exec(body)) !== null) {
        parsed.push({
          file: m[1].trim(),
          line: parseInt(m[2], 10),
          message: m[3].trim(),
          source,
        })
      }
    }
    if (parsed.length > 0) {
      for (const p of parsed) {
        const key = `${p.file}:${p.line ?? 0}:${p.column ?? 0}`
        if (seen.has(key)) continue
        seen.add(key)
        out.push(p)
      }
    } else {
      const key = `::${source}:${body.slice(0, 80)}`
      if (!seen.has(key)) {
        seen.add(key)
        out.push({
          file: '',
          message: body.trim().slice(0, 500),
          source,
        })
      }
    }
  }
  return out
}

/**
 * Builds a self-contained repair prompt for the editor agent. The editor
 * does not inherit conversation history, so this prompt must include
 * everything needed to make a targeted fix: the failing file:line locations,
 * the error messages, and the pending files context.
 *
 * Grouped by file for easy scanning. Unparseable failures are included as
 * raw text at the end so the editor has maximum context.
 */
export function buildRepairEditorPrompt(
  parsed: ParsedValidationFailure[],
  pendingFiles: string[],
): string {
  const fileFailures = parsed.filter((p) => p.file.length > 0)
  const lines: string[] = [
    'Validation hooks failed after your edits. A deterministic failure parser extracted the specific failing locations below.',
    '',
    'For each failure, read the exact file and line, make the minimal targeted fix, then finish. Do not refactor or make unrelated changes. The gate will re-run validation automatically after your edits.',
    '',
  ]
  if (fileFailures.length > 0) {
    lines.push('Failing locations (file:line:column — message):')
    const byFile = new Map<string, ParsedValidationFailure[]>()
    for (const f of fileFailures) {
      const list = byFile.get(f.file) ?? []
      list.push(f)
      byFile.set(f.file, list)
    }
    for (const [file, fails] of byFile) {
      lines.push(`  ${file}:`)
      for (const f of fails) {
        const loc =
          f.line != null
            ? `${f.line}${f.column != null ? `:${f.column}` : ''}`
            : '?'
        lines.push(`    ${loc} — [${f.source}] ${f.message}`)
      }
    }
  } else {
    lines.push(
      'No specific file:line locations could be parsed from the failure output. Read the raw failures below and the pending files, then fix.',
    )
  }
  const unparsed = parsed.filter((p) => p.file.length === 0)
  if (unparsed.length > 0) {
    lines.push('')
    lines.push('Raw unparsed failures:')
    for (const u of unparsed) {
      lines.push(`  [${u.source}] ${u.message}`)
    }
  }
  if (pendingFiles.length > 0) {
    lines.push('')
    lines.push(`Pending changed files: ${pendingFiles.join(', ')}`)
  }
  return lines.join('\n')
}
