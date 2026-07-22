/**
 * JSON serialization for chat-state persistence that survives the two ways
 * JSON.stringify fails on real transcripts in prod:
 *
 * - Cyclic structures: tool blocks carry raw tool output (`outputRaw`) and
 *   message metadata carries opaque run state, either of which can smuggle a
 *   cyclic object (e.g. an error with req/res references) into the transcript.
 * - "Out of memory" / "Invalid string length": transcripts with huge
 *   accumulated tool outputs can exceed the engine's string limits.
 *
 * The fast path is a plain JSON.stringify (no replacer overhead — these
 * payloads are multi-MB and serialized on every checkpoint). Only when it
 * throws do we retry with a replacer that breaks cycles (and, for the
 * OOM case, truncates giant leaf strings), reporting what was altered so the
 * caller can log a diagnostic pointing at the culprit.
 */

export type SerializeFallbackReport = {
  /** Why the fast path failed. */
  reason: 'cyclic' | 'oom'
  /** JSON paths of the first few broken cycles (empty if none found). */
  cyclePaths: string[]
  /** Number of leaf strings truncated to rescue an over-limit payload. */
  truncatedStrings: number
}

export type SerializeResult = {
  json: string
  /** Present only when the fast path failed and the fallback pass ran. */
  fallback?: SerializeFallbackReport
}

// Only strings this large are candidates for truncation in the OOM fallback,
// so normally-sized content is never altered. Kept generous: truncation is a
// last resort that trades fidelity (e.g. an embedded base64 image) for
// persisting the transcript at all.
const TRUNCATE_THRESHOLD_CHARS = 1_000_000
const TRUNCATE_KEEP_CHARS = 50_000
const MAX_REPORTED_CYCLE_PATHS = 5

export function classifyStringifyError(
  error: unknown,
): 'cyclic' | 'oom' | null {
  const msg = (
    error instanceof Error ? error.message : String(error)
  ).toLowerCase()
  // Bun: "JSON.stringify cannot serialize cyclic structures."
  // Node: "Converting circular structure to JSON"
  if (msg.includes('cyclic') || msg.includes('circular')) return 'cyclic'
  // Bun: "Out of memory" / Node: "Invalid string length"
  if (msg.includes('out of memory') || msg.includes('invalid string length')) {
    return 'oom'
  }
  return null
}

/**
 * Replacer that breaks true cycles only (shared non-cyclic references are
 * preserved), based on the json-stringify-safe ancestor-stack technique.
 * Optionally truncates giant leaf strings for the OOM rescue path.
 */
function makeFallbackReplacer(
  truncate: boolean,
  report: SerializeFallbackReport,
): (this: unknown, key: string, value: unknown) => unknown {
  const stack: unknown[] = []
  const keys: string[] = []
  return function (key, value) {
    if (stack.length > 0) {
      const thisPos = stack.indexOf(this)
      if (thisPos !== -1) {
        stack.splice(thisPos + 1)
        keys.splice(thisPos, Infinity, key)
      } else {
        stack.push(this)
        keys.push(key)
      }
      if (
        typeof value === 'object' &&
        value !== null &&
        stack.includes(value)
      ) {
        if (report.cyclePaths.length < MAX_REPORTED_CYCLE_PATHS) {
          report.cyclePaths.push(keys.filter(Boolean).join('.'))
        }
        return '[Circular]'
      }
    } else {
      stack.push(value)
    }
    if (
      truncate &&
      typeof value === 'string' &&
      value.length > TRUNCATE_THRESHOLD_CHARS
    ) {
      report.truncatedStrings++
      return (
        value.slice(0, TRUNCATE_KEEP_CHARS) +
        `…[truncated ${value.length - TRUNCATE_KEEP_CHARS} chars]`
      )
    }
    return value
  }
}

/**
 * Serialize for persistence: plain JSON.stringify, falling back to a
 * cycle-breaking (and, on memory errors, string-truncating) pass. Throws the
 * original error if even the fallback pass cannot produce a string.
 */
export function serializeForPersistence(value: unknown): SerializeResult {
  try {
    return { json: JSON.stringify(value) }
  } catch (error) {
    const reason = classifyStringifyError(error)
    if (!reason) throw error
    const report: SerializeFallbackReport = {
      reason,
      cyclePaths: [],
      truncatedStrings: 0,
    }
    try {
      const json = JSON.stringify(
        value,
        makeFallbackReplacer(reason === 'oom', report),
      )
      return { json, fallback: report }
    } catch (fallbackError) {
      // A cyclic payload can *also* be over the string limit: retry once more
      // with truncation enabled before giving up.
      if (
        reason === 'cyclic' &&
        classifyStringifyError(fallbackError) === 'oom'
      ) {
        const retryReport: SerializeFallbackReport = {
          reason: 'oom',
          cyclePaths: [],
          truncatedStrings: 0,
        }
        try {
          const json = JSON.stringify(
            value,
            makeFallbackReplacer(true, retryReport),
          )
          return { json, fallback: retryReport }
        } catch {
          throw error
        }
      }
      throw error
    }
  }
}
