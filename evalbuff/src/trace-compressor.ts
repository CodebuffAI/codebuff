import fs from 'fs'
import path from 'path'

/**
 * A compressed trace where large tool results are stored in separate files.
 * The inline trace keeps the full reasoning + tool calls but replaces
 * tool result bodies with pointers like:
 *   [Tool result stored in: /tmp/evalbuff-traces-xxx/result-003.txt (2847 chars)]
 */
export interface CompressedTrace {
  /** The trace with large tool results replaced by file pointers */
  inline: string
  /** Directory containing the extracted result files (caller should clean up) */
  traceDir: string
}

/** Minimum size (chars) for a tool result body to get extracted to a file */
const EXTRACT_THRESHOLD = 300

/**
 * Compress an agent trace by extracting large tool results into files.
 *
 * Supports multiple trace formats:
 * 1. JSON-lines streaming (Claude `--output-format stream-json`)
 * 2. Structured text with code blocks / indented output
 *
 * Returns the compressed inline trace + path to the directory of result files.
 */
export function compressTrace(
  rawTrace: string,
  traceDir: string,
): CompressedTrace {
  fs.mkdirSync(traceDir, { recursive: true })

  // Try JSON-lines first (Claude streaming format)
  const jsonResult = tryCompressJsonLines(rawTrace, traceDir)
  if (jsonResult) return jsonResult

  // Fall back to heuristic text compression
  return compressTextTrace(rawTrace, traceDir)
}

/**
 * Try to parse as JSON-lines (one JSON object per line).
 * Claude CLI with --output-format stream-json emits events like:
 *   {"type":"tool_use","name":"Read","input":{...}}
 *   {"type":"tool_result","content":"...huge file contents..."}
 */
function tryCompressJsonLines(
  rawTrace: string,
  traceDir: string,
): CompressedTrace | null {
  const lines = rawTrace.split('\n')

  // Quick check: are most non-empty lines valid JSON?
  const nonEmpty = lines.filter((l) => l.trim())
  if (nonEmpty.length < 2) return null

  let jsonCount = 0
  for (const line of nonEmpty.slice(0, 10)) {
    try {
      JSON.parse(line)
      jsonCount++
    } catch {
      // not json
    }
  }
  if (jsonCount < nonEmpty.length * 0.5) return null

  // Parse and compress
  const outputLines: string[] = []
  let fileIdx = 0

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) {
      outputLines.push('')
      continue
    }

    let parsed: any
    try {
      parsed = JSON.parse(trimmed)
    } catch {
      outputLines.push(line)
      continue
    }

    // Check if this is a tool result with large content
    if (isToolResultEvent(parsed)) {
      const content = extractToolResultContent(parsed)
      if (content && content.length > EXTRACT_THRESHOLD) {
        const fileName = `result-${String(fileIdx).padStart(3, '0')}.txt`
        const filePath = path.join(traceDir, fileName)
        fs.writeFileSync(filePath, content)
        fileIdx++

        // Replace content with pointer, keep the rest of the event
        const summary = summarizeContent(content)
        const compressed = replaceToolResultContent(
          parsed,
          `[Stored in: ${filePath} (${content.length} chars) — ${summary}]`,
        )
        outputLines.push(JSON.stringify(compressed))
        continue
      }
    }

    outputLines.push(line)
  }

  return {
    inline: outputLines.join('\n'),
    traceDir,
  }
}

/**
 * Heuristic compression for unstructured text traces.
 * Detects large blocks (code fences, indented blocks, long output runs)
 * and extracts them to files.
 */
function compressTextTrace(
  rawTrace: string,
  traceDir: string,
): CompressedTrace {
  const lines = rawTrace.split('\n')
  const outputLines: string[] = []
  let fileIdx = 0
  let i = 0

  while (i < lines.length) {
    // Detect code fence blocks: ``` ... ```
    if (lines[i].trim().startsWith('```')) {
      const blockStart = i
      const openFence = lines[i].trim()
      i++
      const blockLines: string[] = [lines[blockStart]]

      // Find closing fence
      while (i < lines.length) {
        blockLines.push(lines[i])
        if (lines[i].trim() === '```' || lines[i].trim() === openFence) {
          i++
          break
        }
        i++
      }

      const blockContent = blockLines.join('\n')
      if (blockContent.length > EXTRACT_THRESHOLD) {
        const fileName = `result-${String(fileIdx).padStart(3, '0')}.txt`
        const filePath = path.join(traceDir, fileName)
        fs.writeFileSync(filePath, blockContent)
        fileIdx++
        const summary = summarizeContent(blockContent)
        outputLines.push(
          `[Code block stored in: ${filePath} (${blockContent.length} chars) — ${summary}]`,
        )
      } else {
        outputLines.push(...blockLines)
      }
      continue
    }

    // Detect indented blocks (4+ spaces or tab) — common for tool output
    if (/^(?:    |\t)/.test(lines[i]) && i + 1 < lines.length) {
      const blockStart = i
      const blockLines: string[] = []
      while (i < lines.length && (/^(?:    |\t)/.test(lines[i]) || lines[i].trim() === '')) {
        blockLines.push(lines[i])
        i++
      }

      // Only extract if it's a large block (not just 2-3 indented lines)
      const blockContent = blockLines.join('\n')
      if (blockContent.length > EXTRACT_THRESHOLD && blockLines.length > 5) {
        const fileName = `result-${String(fileIdx).padStart(3, '0')}.txt`
        const filePath = path.join(traceDir, fileName)
        fs.writeFileSync(filePath, blockContent)
        fileIdx++
        const summary = summarizeContent(blockContent)
        outputLines.push(
          `[Indented block stored in: ${filePath} (${blockContent.length} chars, ${blockLines.length} lines) — ${summary}]`,
        )
      } else {
        outputLines.push(...blockLines)
      }
      continue
    }

    outputLines.push(lines[i])
    i++
  }

  return {
    inline: outputLines.join('\n'),
    traceDir,
  }
}

// --- Helpers ---

/** Check if a parsed JSON event is a tool result */
function isToolResultEvent(event: any): boolean {
  if (!event || typeof event !== 'object') return false
  // Claude streaming: {"type":"tool_result",...} or {"type":"content_block_delta","delta":{"type":"tool_result",...}}
  if (event.type === 'tool_result') return true
  if (event.type === 'content_block_stop' && event.content_block?.type === 'tool_result') return true
  // Codex: {"type":"function_result",...}
  if (event.type === 'function_result') return true
  // Generic: anything with a large "content" or "output" or "result" field
  for (const key of ['content', 'output', 'result', 'text']) {
    if (typeof event[key] === 'string' && event[key].length > EXTRACT_THRESHOLD) return true
  }
  return false
}

/** Extract the large content body from a tool result event */
function extractToolResultContent(event: any): string | null {
  // Try common field names in order of specificity
  for (const key of ['content', 'output', 'result', 'text']) {
    if (typeof event[key] === 'string') return event[key]
    // Nested: event.content[0].text (Claude format)
    if (Array.isArray(event[key])) {
      const texts = event[key]
        .filter((item: any) => typeof item === 'object' && typeof item.text === 'string')
        .map((item: any) => item.text)
      if (texts.length > 0) return texts.join('\n')
    }
  }
  // Check nested delta
  if (event.delta && typeof event.delta === 'object') {
    return extractToolResultContent(event.delta)
  }
  return null
}

/** Replace the content body in a tool result event with a pointer string */
function replaceToolResultContent(event: any, pointer: string): any {
  const clone = { ...event }
  for (const key of ['content', 'output', 'result', 'text']) {
    if (typeof clone[key] === 'string') {
      clone[key] = pointer
      return clone
    }
    if (Array.isArray(clone[key])) {
      clone[key] = [{ type: 'text', text: pointer }]
      return clone
    }
  }
  if (clone.delta) {
    clone.delta = replaceToolResultContent({ ...clone.delta }, pointer)
  }
  return clone
}

/** Generate a short summary of content for the inline pointer */
function summarizeContent(content: string): string {
  const firstLine = content.split('\n').find((l) => l.trim())?.trim() || ''
  const lineCount = content.split('\n').length

  // Detect content type
  if (content.includes('```')) return `code block, ${lineCount} lines`
  if (firstLine.startsWith('{') || firstLine.startsWith('[')) return `JSON, ${lineCount} lines`
  if (firstLine.match(/^\s*\d+[→|│:]/)) return `file content, ${lineCount} lines`
  if (firstLine.startsWith('diff ') || firstLine.startsWith('---')) return `diff, ${lineCount} lines`
  if (firstLine.startsWith('$') || firstLine.startsWith('>')) return `command output, ${lineCount} lines`

  // Use first line as summary, truncated
  const short = firstLine.length > 60 ? firstLine.slice(0, 57) + '...' : firstLine
  return `${short} (${lineCount} lines)`
}

/**
 * Clean up a trace directory.
 */
export function cleanupTraceDir(traceDir: string): void {
  try {
    fs.rmSync(traceDir, { recursive: true, force: true })
  } catch {
    // ignore
  }
}
