import z from 'zod/v4'

import {
  endsAgentStepParam,
  endToolTag,
  startToolTag,
  toolNameParam,
} from '../constants'

import type { JSONValue } from '../../types/json'
import type { ToolResultOutput } from '../../types/messages/content-part'

/**
 * Coerces a value into an array if it isn't one already.
 * Handles common LLM mistakes:
 * - Single object/string passed instead of an array → wraps in array
 * - Stringified JSON array passed as a string → parses it
 * - Already an array → passes through
 * - null/undefined → passes through (let Zod handle it)
 */
export function coerceToArray(val: unknown): unknown {
  if (Array.isArray(val)) return val
  if (typeof val === 'string') {
    try {
      const parsed = JSON.parse(val)
      if (Array.isArray(parsed)) return parsed
    } catch {
      // Not valid JSON — fall through to wrap
    }
  }
  if (val != null) return [val]
  return val
}

/**
 * Coerces a stringified JSON object into an object.
 * This is intentionally narrow so malformed values still fail validation.
 */
export function coerceToObject(val: unknown): unknown {
  if (typeof val !== 'string') {
    return val
  }

  try {
    const parsed = JSON.parse(val)
    if (
      parsed != null &&
      typeof parsed === 'object' &&
      !Array.isArray(parsed)
    ) {
      return parsed
    }
  } catch {
    // Leave the original value untouched so schema validation can reject it.
  }

  return val
}

function parseJsonBounded(value: unknown, maxDepth = 3): unknown {
  let parsed = value
  for (let depth = 0; depth < maxDepth && typeof parsed === 'string'; depth++) {
    try {
      parsed = JSON.parse(parsed)
    } catch {
      return parsed
    }
  }
  return parsed
}

/**
 * Repairs the common spawn_agents encodings produced by tool-calling models:
 * a stringified array, a double-stringified array, or stringified object
 * entries. Malformed/truncated values remain untouched so Zod fails closed.
 */
export function normalizeSpawnAgentList(value: unknown): unknown {
  const decoded = parseJsonBounded(value)
  const entries = Array.isArray(decoded) ? decoded : [decoded]
  return entries.map((entry) => {
    const parsedEntry = parseJsonBounded(entry)
    if (
      parsedEntry === null ||
      typeof parsedEntry !== 'object' ||
      Array.isArray(parsedEntry)
    ) {
      return entry
    }

    const record = parsedEntry as Record<string, unknown>
    const repairedRecord = { ...record }
    let repaired = false

    const parsedHandoff = parseJsonBounded(record.handoff)
    if (
      typeof record.handoff === 'string' &&
      parsedHandoff !== null &&
      typeof parsedHandoff === 'object' &&
      !Array.isArray(parsedHandoff)
    ) {
      repairedRecord.handoff = parsedHandoff
      repaired = true
    }

    const parsedParams = parseJsonBounded(record.params)
    const canMergeParams =
      parsedParams === undefined ||
      (parsedParams !== null &&
        typeof parsedParams === 'object' &&
        !Array.isArray(parsedParams))

    if (canMergeParams) {
      const paramsRecord = {
        ...((parsedParams ?? {}) as Record<string, unknown>),
      }
      let paramsRepaired = typeof record.params === 'string'

      // Provider tool-call serializers sometimes preserve an agent-specific
      // array as a JSON string inside an otherwise valid params object (for
      // example, `searchQueries: "[...]"`). Decode only known array-shaped
      // handoff fields; leave commands, prompts, and arbitrary custom values
      // untouched so intentional strings are never reinterpreted as data.
      const arrayParamKeys = [
        'searchQueries',
        'filePaths',
        'directories',
        'prompts',
        'changed_files',
        'paths',
        'patterns',
        'queries',
      ]
      for (const key of arrayParamKeys) {
        const value = paramsRecord[key]
        const parsedValue = parseJsonBounded(value)
        if (typeof value !== 'string' || !Array.isArray(parsedValue)) {
          continue
        }
        paramsRecord[key] = parsedValue.map((item) => parseJsonBounded(item))
        paramsRepaired = true
      }

      // Direct agent calls accept legacy top-level params and convert them
      // into the nested `params` object. Apply the same narrowly-scoped repair
      // to spawn_agents for Basher's explicit command field. Never derive a
      // shell command from `prompt`: prose is not executable authority.
      if (
        record.agent_type === 'basher' &&
        typeof record.command === 'string' &&
        paramsRecord.command === undefined
      ) {
        paramsRecord.command = record.command
        paramsRepaired = true
      }

      // Snapshot-scoped specialists verify the supplied fingerprint against
      // the live review bundle, so recovering an explicitly labelled SHA from
      // their prompt does not grant authority or bypass freshness checks. This
      // repairs model calls that preserve the snapshot in prose but omit the
      // required params.snapshot_id field after context compaction.
      if (
        paramsRecord.snapshot_id === undefined &&
        typeof record.prompt === 'string'
      ) {
        const matches = [
          ...record.prompt.matchAll(
            /\b(?:Snapshot(?: ID| fingerprint)?(?:\s*\([^\n)]*\)|\s+to verify)?|snapshot_id)\s*:\s*`?([A-Za-z0-9][A-Za-z0-9._:-]{0,511})`?/gi,
          ),
        ]
        const explicitSnapshot = matches.at(-1)?.[1]
        if (explicitSnapshot) {
          paramsRecord.snapshot_id = explicitSnapshot
          paramsRepaired = true
        }
      }

      if (paramsRepaired) {
        repairedRecord.params = paramsRecord
        repaired = true
      }
    }

    return repaired ? repairedRecord : parsedEntry
  })
}

const OBVIOUS_EDIT_PLACEHOLDER =
  /^\s*[\[<{(]\s*(?:(?:see|use|same as|copy|paste|insert)\b[\s\S]*\b(?:above|below|patch|code|content|here)|(?:old|new|existing|current)\s+(?:code|content)\s+here)\s*[\]}>)]\s*$/i

/** True only for explicit prose placeholders that can never be file content. */
export function isObviousEditPlaceholder(value: string): boolean {
  return OBVIOUS_EDIT_PLACEHOLDER.test(value)
}

/**
 * Handles common replacement-key aliases emitted by some models while keeping
 * the documented schema stable.
 */
export function normalizeReplacementAliases(val: unknown): unknown {
  if (val === null || typeof val !== 'object' || Array.isArray(val)) {
    return val
  }

  const replacement = { ...(val as Record<string, unknown>) }
  for (const [target, aliases] of [
    ['oldString', ['old', 'old_str', 'old_string']],
    ['newString', ['new', 'new_str', 'new_string']],
  ] as const) {
    if (replacement[target] !== undefined) {
      continue
    }
    const alias = aliases.find((key) => typeof replacement[key] === 'string')
    if (alias) {
      replacement[target] = replacement[alias]
    }
  }
  return replacement
}

const REPLACEMENT_PLACEHOLDER_KEYS = new Set([
  'oldString',
  'newString',
  'old',
  'new',
  'old_str',
  'new_str',
  'old_string',
  'new_string',
  'allowMultiple',
  'occurrenceIndex',
  'basedOnRead',
  'skipIfMissing',
])

/**
 * Drops only operation-less replacement placeholders such as `{}` or
 * `{ allowMultiple: false }`. Some providers append one of these after an
 * otherwise complete replacement array. Entries containing either payload
 * field, an alias, or any unknown key remain untouched so normal validation
 * still rejects one-sided/truncated or misspelled real edits.
 */
export function normalizeReplacementList(val: unknown): unknown {
  const replacements = coerceToArray(val)
  if (!Array.isArray(replacements)) return replacements

  return replacements.filter((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return true
    const record = entry as Record<string, unknown>
    if (
      Object.keys(record).some((key) => !REPLACEMENT_PLACEHOLDER_KEYS.has(key))
    ) {
      return true
    }
    return [
      'oldString',
      'newString',
      'old',
      'new',
      'old_str',
      'new_str',
      'old_string',
      'new_string',
    ].some((key) => record[key] !== undefined)
  })
}

/**
 * Repairs omitted edit_transaction discriminators only when the payload shape
 * identifies exactly one operation. Ambiguous content-only edits remain
 * untouched because they could be create or write_file operations.
 */
export function normalizeTransactionEditList(val: unknown): unknown {
  const decoded = parseJsonBounded(val)
  // A malformed/truncated serialized array must fail at `edits` itself. Do
  // not wrap it as a one-element array, which produces the misleading
  // `edits[0] expected object, received string` diagnostic and encourages the
  // model to retry the same broken payload.
  if (typeof val === 'string' && typeof decoded === 'string') return decoded

  const edits = coerceToArray(decoded)
  if (!Array.isArray(edits)) return edits

  return edits.map((entry) => {
    const parsedEntry = parseJsonBounded(entry)
    if (
      parsedEntry === null ||
      typeof parsedEntry !== 'object' ||
      Array.isArray(parsedEntry)
    ) {
      return entry
    }

    const edit = parsedEntry as Record<string, unknown>
    if (edit.type !== undefined) return parsedEntry

    const candidateTypes: string[] = []
    if (edit.replacements !== undefined) candidateTypes.push('str_replace')
    if (edit.operation !== undefined) candidateTypes.push('structured')
    if (edit.destinationPath !== undefined) candidateTypes.push('move')
    if (edit.diff !== undefined) candidateTypes.push('patch')
    if (edit.symbol !== undefined && edit.content !== undefined) {
      candidateTypes.push('rewrite_symbol')
    } else if (edit.content !== undefined) {
      candidateTypes.push('create', 'write_file')
    }
    if (
      ((edit.startLine !== undefined &&
        edit.endLine !== undefined &&
        edit.expectedHash !== undefined) ||
        edit.readCapability !== undefined) &&
      edit.newContent !== undefined
    ) {
      candidateTypes.push('replace_range')
    }

    return candidateTypes.length === 1
      ? { ...edit, type: candidateTypes[0] }
      : parsedEntry
  })
}

/** Only used for generating tool call strings before all tools are defined.
 *
 * @param toolName - The name of the tool to call
 * @param inputSchema - The zod schema for the tool. This is only used as type validation and is unused otherwise.
 * @param input - The input to the tool
 * @param endsAgentStep - Whether the agent should end its turn after this tool call
 */
export function $getToolCallString<Input>(params: {
  toolName: string
  inputSchema: z.ZodType<any, Input> | null
  input: Input
  endsAgentStep: boolean
}): string {
  const { toolName, input, endsAgentStep } = params
  const obj: Record<string, any> = {
    [toolNameParam]: toolName,
    ...input,
  }
  if (endsAgentStep) {
    obj[endsAgentStepParam] = endsAgentStep satisfies true
  }
  return [startToolTag, JSON.stringify(obj, null, 2), endToolTag].join('')
}

export function $getNativeToolCallExampleString<Input>(params: {
  toolName: string
  inputSchema: z.ZodType<any, Input> | null
  input: Input
  endsAgentStep?: boolean // unused
}): string {
  const { toolName, input } = params
  return [
    `<${toolName}_params_example>\n`,
    JSON.stringify(input, null, 2),
    `\n</${toolName}_params_example>`,
  ].join('')
}

/** Generates the zod schema for a single JSON tool result. */
export function jsonToolResultSchema<T extends JSONValue>(
  valueSchema: z.ZodType<T>,
) {
  return z.tuple([
    z.object({
      type: z.literal('json'),
      value: valueSchema,
    }) satisfies z.ZodType<ToolResultOutput>,
  ])
}

/** Generates the zod schema for an empty tool result. */
export function emptyToolResultSchema() {
  return z.tuple([])
}

/** Generates the zod schema for a simple text tool result. */
export function textToolResultSchema() {
  return z.tuple([
    z.object({
      type: z.literal('json'),
      value: z.object({
        message: z.string(),
      }),
    }) satisfies z.ZodType<ToolResultOutput>,
  ])
}
