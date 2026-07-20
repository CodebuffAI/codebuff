import { endsAgentStepParam, toolNames } from '@codebuff/common/tools/constants'
import { toolParams } from '@codebuff/common/tools/list'
import { decodeJsonObjectString } from '@codebuff/common/tools/params/tool/set-output'
import {
  parseJsonBounded,
  parseJsonStringWithRepair,
} from '@codebuff/common/tools/params/utils'
import {
  buildNativeToolResultErrorOutputV1,
  buildReadFilesResultV1,
  fileMutationResultV1Schema,
  reconcileFileMutationResultV1,
  type ReadFilesItemV1,
} from '@codebuff/common/tools/results/filesystem'
import { getToolMetadata } from '@codebuff/common/tools/metadata'
import { isAbortError } from '@codebuff/common/util/error'
import { jsonToolResult } from '@codebuff/common/util/messages'
import { generateCompactId } from '@codebuff/common/util/string'
import { cloneDeep } from 'lodash'
import * as path from 'path'
import { realpathSync } from 'node:fs'

import { getMCPToolData } from '../mcp'
import { MCP_TOOL_SEPARATOR } from '../mcp-constants'
import { getAgentShortName, getAgentToolName } from '../templates/prompts'
import { getEffectiveAgentToolNames } from '../util/agent-tool-names'
import {
  normalizeScopedToolPath,
  scopePatternMatches,
} from '../util/filesystem-scope'
import {
  formatValidationIssues,
  type ValidationIssue,
} from '../util/format-validation-issues'
import { formatValueForError } from '../util/format-value'
import { codebuffToolHandlers } from './handlers/list'
import {
  getMatchingSpawn,
  isBaseAgent,
  normalizeSpawnAgentType,
  toolNotAgentError,
  validateAgentInput,
  validateAndGetAgentTemplate,
} from './handlers/tool/spawn-agent-utils'
import { getAgentTemplate } from '../templates/agent-registry'
import { ensureZodSchema } from './prompts'

import type { AgentTemplate } from '../templates/types'
import type { CodebuffToolHandlerFunction } from './handlers/handler-function-type'
import type { FileProcessingState } from './handlers/tool/write-file'
import type { ToolName } from '@codebuff/common/tools/constants'
import type {
  ClientToolCall,
  ClientToolName,
  CodebuffToolCall,
  CodebuffToolOutput,
} from '@codebuff/common/tools/list'
import type {
  AgentRuntimeDeps,
  AgentRuntimeScopedDeps,
} from '@codebuff/common/types/contracts/agent-runtime'
import type { Logger } from '@codebuff/common/types/contracts/logger'
import type { ToolMessage } from '@codebuff/common/types/messages/codebuff-message'
import type { ToolResultOutput } from '@codebuff/common/types/messages/content-part'
import type { ProviderMetadata } from '@codebuff/common/types/messages/provider-metadata'
import type { PrintModeEvent } from '@codebuff/common/types/print-mode'
import type {
  AgentTemplateType,
  AgentState,
  Subgoal,
} from '@codebuff/common/types/session-state'
import type {
  CustomToolDefinitions,
  ProjectFileContext,
} from '@codebuff/common/util/file'
import type { ToolCallPart, ToolSet } from 'ai'

export type CustomToolCall = {
  toolName: string
  input: Record<string, unknown>
} & Omit<ToolCallPart, 'type'>

export type ToolCallError = {
  toolName?: string
  input: unknown
  error: string
  formattedInput?: string
} & Pick<CodebuffToolCall, 'toolCallId'>

function makeAbortableBarrier(
  barrier: Promise<void>,
  signal: AbortSignal,
): Promise<void> {
  if (signal.aborted) {
    return Promise.reject(
      new DOMException(
        signal.reason instanceof Error ? signal.reason.message : 'Aborted',
        'AbortError',
      ),
    )
  }
  return new Promise<void>((resolve, reject) => {
    let settled = false
    const finish = (callback: () => void) => {
      if (settled) return
      settled = true
      signal.removeEventListener('abort', onAbort)
      callback()
    }
    const onAbort = () =>
      finish(() =>
        reject(
          new DOMException(
            signal.reason instanceof Error ? signal.reason.message : 'Aborted',
            'AbortError',
          ),
        ),
      )
    signal.addEventListener('abort', onAbort, { once: true })
    barrier.then(
      () => finish(resolve),
      (error) => finish(() => reject(error)),
    )
  })
}

export function buildSpawnAgentsHandlerFailureOutput(
  input: unknown,
  error: unknown,
): CodebuffToolOutput<'spawn_agents'> {
  const inputRecord =
    input && typeof input === 'object'
      ? (input as Record<string, unknown>)
      : undefined
  const agents =
    inputRecord && Array.isArray(inputRecord.agents) ? inputRecord.agents : []
  const errorMessage =
    error instanceof Error ? error.message : String(error || 'Unknown error')

  return jsonToolResult(
    (agents.length > 0 ? agents : [{}]).map((agent) => {
      const agentType =
        agent &&
        typeof agent === 'object' &&
        typeof (agent as Record<string, unknown>).agent_type === 'string'
          ? String((agent as Record<string, unknown>).agent_type)
          : 'unknown'
      return {
        agentType,
        agentName: agentType,
        value: { errorMessage: `Agent spawn failed: ${errorMessage}` },
      }
    }),
  )
}

export function normalizeNativeToolOutput<T extends ToolName>(params: {
  toolName: T
  toolCallId: string
  output: CodebuffToolOutput<T>
}):
  | { valid: true; output: CodebuffToolOutput<T>; issues: [] }
  | {
      valid: false
      output: CodebuffToolOutput<T>
      issues: ReadonlyArray<{ message: string }>
    } {
  const canonicalHandlerFailure = params.output.some((part) => {
    if (part.type !== 'json' || !part.value || typeof part.value !== 'object') {
      return false
    }
    const value = part.value as Record<string, unknown>
    const lifecycle = value.lifecycle
    return (
      value.kind === 'native_tool_result_error' &&
      value.version === 1 &&
      lifecycle !== null &&
      typeof lifecycle === 'object' &&
      (lifecycle as Record<string, unknown>).callId === params.toolCallId &&
      (lifecycle as Record<string, unknown>).state === 'failed'
    )
  })
  if (canonicalHandlerFailure) {
    return { valid: true, output: params.output, issues: [] }
  }
  const parsed = toolParams[params.toolName].outputSchema.safeParse(
    params.output,
  )
  if (parsed.success) {
    if (getToolMetadata(params.toolName).resultContract === 'mutation_v1') {
      const canonical = params.output.some((part) => {
        if (part.type !== 'json') return false
        const mutation = fileMutationResultV1Schema.safeParse(part.value)
        return (
          mutation.success &&
          (mutation.data.outcome === 'unconfirmed' ||
            mutation.data.authorityReceipt?.callId === params.toolCallId)
        )
      })
      if (!canonical) {
        const mismatchedCanonical = params.output.some(
          (part) =>
            part.type === 'json' &&
            fileMutationResultV1Schema.safeParse(part.value).success,
        )
        if (mismatchedCanonical) {
          return {
            valid: false,
            output: jsonToolResult(
              fileMutationResultV1Schema.parse({
                kind: 'file_mutation_result',
                version: 1,
                operationId: `${params.toolCallId}:unconfirmed`,
                outcome: 'unconfirmed',
                actions: [],
                authorityTier: null,
                errors: [
                  {
                    code: 'malformed_result',
                    message:
                      'Canonical mutation receipt did not correlate to the active tool call.',
                    retryable: false,
                    recovery: 'fix_result',
                  },
                ],
                freshCapabilities: [],
              }),
            ) as CodebuffToolOutput<T>,
            issues: [
              {
                message: 'mutation receipt callId did not match the tool call',
              },
            ],
          }
        }
        const diagnosticRecords = params.output
          .filter((part) => part.type === 'json')
          .map((part) => part.value)
          .filter(
            (value) =>
              value !== null &&
              typeof value === 'object' &&
              !Array.isArray(value),
          ) as Record<string, unknown>[]
        const diagnostic =
          diagnosticRecords.find(
            (value) => typeof value.errorMessage === 'string',
          ) ?? diagnosticRecords[0]
        const message =
          typeof diagnostic?.errorMessage === 'string'
            ? diagnostic.errorMessage
            : 'Legacy mutation output was accepted but could not be authority-verified.'
        const path =
          typeof diagnostic?.file === 'string'
            ? diagnostic.file
            : typeof diagnostic?.path === 'string'
              ? diagnostic.path
              : undefined
        const patch =
          typeof diagnostic?.patch === 'string'
            ? diagnostic.patch
            : typeof diagnostic?.unifiedDiff === 'string'
              ? diagnostic.unifiedDiff
              : undefined
        const operationId = `${params.toolCallId}:legacy`
        const hasError = typeof diagnostic?.errorMessage === 'string'
        return {
          valid: true,
          output: jsonToolResult(
            fileMutationResultV1Schema.parse({
              kind: 'file_mutation_result',
              version: 1,
              operationId,
              outcome: 'unconfirmed',
              actions: path
                ? [
                    {
                      actionId: `${operationId}:0`,
                      index: 0,
                      action: 'update',
                      path,
                      outcome: 'unconfirmed',
                      beforeHash: null,
                      afterHash: null,
                      ...(patch ? { patch } : {}),
                      ...(hasError
                        ? {
                            error: {
                              code: 'application_rejected',
                              message,
                              retryable: true,
                              recovery: 'read_again',
                            },
                          }
                        : {}),
                    },
                  ]
                : [],
              authorityTier: null,
              errors: hasError
                ? [
                    {
                      code: 'application_rejected',
                      message,
                      retryable: true,
                      recovery: 'read_again',
                    },
                  ]
                : [],
              freshCapabilities: [],
            }),
          ) as CodebuffToolOutput<T>,
          issues: [],
        }
      }
    }
    return { valid: true, output: params.output, issues: [] }
  }
  if (getToolMetadata(params.toolName).resultContract === 'mutation_v1') {
    const first = params.output[0]
    const raw = first?.type === 'json' ? first.value : undefined
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      const record = raw as Record<string, unknown>
      const receipt = record.authorityReceipt
      const operationId =
        typeof record.operationId === 'string'
          ? record.operationId
          : receipt &&
              typeof receipt === 'object' &&
              !Array.isArray(receipt) &&
              typeof (receipt as Record<string, unknown>).operationId ===
                'string'
            ? ((receipt as Record<string, unknown>).operationId as string)
            : undefined
      if (operationId) {
        const reconciled = reconcileFileMutationResultV1({
          lifecycle: {
            kind: 'tool_lifecycle',
            version: 1,
            callId: params.toolCallId,
            sequence: 0,
            state: 'succeeded',
          },
          operationId,
          handlerResult: raw,
          receipt,
        })
        if (reconciled.mutation.outcome !== 'unconfirmed') {
          return {
            valid: false,
            output: jsonToolResult(
              reconciled.mutation,
            ) as CodebuffToolOutput<T>,
            issues: parsed.error.issues,
          }
        }
      }
    }
  }
  return {
    valid: false,
    output: buildNativeToolResultErrorOutputV1({
      toolName: params.toolName,
      callId: params.toolCallId,
      issueCount: parsed.error.issues.length,
    }) as CodebuffToolOutput<T>,
    issues: parsed.error.issues,
  }
}

const bareStringFieldRepairAllowlist: Partial<
  Record<string, readonly string[]>
> = {
  code_search: ['pattern'],
  find_files: ['prompt'],
  find_files_matching_content: ['pattern'],
  glob: ['pattern'],
  list_directory: ['path'],
  lookup_agent_info: ['agentId'],
  read_files: ['paths'],
  read_subtree: ['paths'],
  skill: ['name'],
  web_search: ['query'],
}

function repairBareStringFieldObject(input: string, toolName: string): unknown {
  const allowedFields = bareStringFieldRepairAllowlist[toolName]
  if (!allowedFields) {
    return undefined
  }

  const match = input
    .trim()
    .match(
      /^\{\s*"([A-Za-z_][A-Za-z0-9_]*)"\s*:\s*([^"{}\[\],][^{}\[\],]*)\s*\}$/,
    )
  if (!match) {
    return undefined
  }

  const [, field, rawValue] = match
  if (!allowedFields.includes(field)) {
    return undefined
  }

  const value = rawValue.trim()
  if (!value || value === 'null' || value === 'undefined') {
    return undefined
  }

  return { [field]: value }
}

function parseStringifiedToolInput(
  input: unknown,
  toolName: string,
): { input: unknown; parseError?: string } {
  let parsed = input
  let parseError: string | undefined

  // Some providers/models double-encode tool arguments, for example an input
  // value like "\"{\\\"path\\\":\\\"file.ts\\\"}\"". Repeated JSON.parse
  // handles that before falling back to narrow, tool-specific repairs.
  for (let i = 0; i < 3 && typeof parsed === 'string'; i++) {
    const stringInput = parsed
    try {
      parsed = parseJsonStringWithRepair(stringInput)
      parseError = undefined
    } catch (error) {
      const repairedField = repairBareStringFieldObject(stringInput, toolName)
      if (repairedField !== undefined) {
        parsed = repairedField
        parseError = undefined
      } else {
        parseError = error instanceof Error ? error.message : String(error)
      }
      break
    }
  }

  return { input: parsed, parseError }
}

function detectHeredocPayload(rawInput: unknown): string | undefined {
  if (typeof rawInput !== 'string') return undefined
  if (/<<(['"]?)EOF\1/i.test(rawInput)) {
    return 'Payload was truncated in transport. If you embedded a file body or heredoc inside a basher command, split the work: create the file with write_file/edit_transaction, then run it via a short basher command.'
  }
  return undefined
}

function stringInputError(
  toolName: string,
  toolCallId: string,
  parseError?: string,
  rawInput?: unknown,
): ToolCallError {
  const parseDetails = parseError
    ? ` Parsing as JSON failed: ${parseError}. The arguments may be malformed or incomplete.`
    : ' Parsing succeeded, but the parsed value was still a string.'
  const heredocHint =
    toolName === 'spawn_agents' || toolName === 'basher'
      ? detectHeredocPayload(rawInput)
      : undefined
  const retryHint =
    heredocHint ??
    (toolName === 'set_output'
      ? ' Pass the result as an object directly, for example { "data": { "schemaVersion": 1, ... } }. Do not JSON.stringify the object. Keep findings and evidence compact enough to complete one tool call.'
      : ' Re-issue the tool call with the full arguments object and properly escaped string values.')
  return {
    toolName,
    toolCallId,
    input: {},
    error: `Invalid parameters for ${toolName}: expected the tool arguments to be an object, but received a string.${parseDetails}${retryHint}`,
  }
}

function repairSetOutputData(toolName: string, input: unknown): unknown {
  if (
    toolName !== 'set_output' ||
    input === null ||
    Array.isArray(input) ||
    typeof input !== 'object'
  ) {
    return input
  }
  const record = input as Record<string, unknown>
  if (typeof record.data !== 'string') return input
  const parsed = decodeJsonObjectString(record.data)
  if (parsed === null || Array.isArray(parsed) || typeof parsed !== 'object') {
    return input
  }
  return { ...record, data: parsed }
}

function getFieldSpecificHint(
  toolName: string,
  issues: ValidationIssue[],
): string | undefined {
  // Fix D: when the model emits the wrong JS type for a known-typed field,
  // surface the exact expected shape so it can self-correct on the next attempt
  // instead of looping on a generic Zod message. This covers the three fields
  // most commonly emitted with the wrong type during edit-tool calls.
  if (toolName !== 'str_replace') {
    return undefined
  }

  const paths = new Set(
    issues
      .map((issue) => issue.path?.map((segment) => String(segment)).join('.'))
      .filter((p): p is string => Boolean(p)),
  )
  const fieldNames = new Set(
    issues.flatMap(
      (issue) => issue.path?.map((segment) => String(segment)) ?? [],
    ),
  )

  if (
    paths.has('atomic') ||
    fieldNames.has('atomic') ||
    // Equivalent fields on other edit tools, kept for forward symmetry.
    fieldNames.has('useAtomicBatch')
  ) {
    return [
      'Hint: `atomic` must be a boolean (true/false), not a string. Omit it entirely for the default (false).',
      'Example: { "path": "file.ts", "atomic": true, "replacements": [{ ... }] }',
    ].join('\n')
  }

  if (paths.has('basedOnRead') || fieldNames.has('basedOnRead')) {
    return [
      'Hint: `basedOnRead` must be a read-capability token string returned by read_files (e.g. "cap.<base64>") OR an object { startLine, endLine, hash }. A wrapped object like { "$text": "..." } is not accepted.',
      'Copy the `readCapability` value verbatim from the read_files range header output.',
    ].join('\n')
  }

  if (paths.has('occurrenceIndex') || fieldNames.has('occurrenceIndex')) {
    return [
      'Hint: `occurrenceIndex` must be a positive integer (1-indexed), not a string. Omit it unless you need to target a specific duplicate.',
    ].join('\n')
  }

  return undefined
}

function getToolValidationHint(
  toolName: string,
  issues?: ValidationIssue[],
): string | undefined {
  const fieldHint = issues ? getFieldSpecificHint(toolName, issues) : undefined

  if (toolName === 'str_replace') {
    const base = [
      'Expected shape: { "path": string, "replacements": [{ "oldString": string, "newString": string, "allowMultiple"?: boolean }] }.',
      'If a previous edit failed, stop retrying from memory: re-read the exact current lines with read_files before issuing another replacement.',
    ].join('\n')
    return fieldHint ? `${base}\n\n${fieldHint}` : base
  }
  if (toolName === 'write_file') {
    const base =
      'Expected shape: { "path": string, "instructions": string, "content": string }. Quote string values and escape newlines/quotes inside content.'
    return fieldHint ? `${base}\n\n${fieldHint}` : base
  }
  if (toolName === 'set_output') {
    return [
      'Expected shape: { "data": { ...structured fields... } } (or the structured fields directly at top level).',
      'Pass a real object to set_output. Do not JSON.stringify it or place serialized JSON inside data. Keep findings and evidence concise enough to finish the tool call.',
    ].join('\n')
  }
  if (toolName === 'spawn_agents') {
    return [
      'Expected shape: { "agents": [{ "agent_type": string, "prompt"?: string, "params"?: object }] }.',
      'Pass agents as an array of objects. Valid stringified or double-stringified JSON is repaired automatically, but truncated JSON and non-object entries are rejected. Do not stringify each agent entry.',
    ].join('\n')
  }
  if (toolName === 'edit_transaction') {
    const fieldNames = new Set(
      (issues ?? []).flatMap(
        (issue) => issue.path?.map((segment) => String(segment)) ?? [],
      ),
    )
    const targetedHints: string[] = []
    if (fieldNames.has('readCapability')) {
      targetedHints.push(
        [
          'For replace_range, choose one target form only.',
          'Preferred: { "type": "replace_range", "path": "file.ts", "readCapability": "cap...", "newContent": "..." }.',
          'If the capability covers a wider range than intended, re-read the exact target lines first; never narrow a capability with separate line/hash fields.',
        ].join('\n'),
      )
    }
    if (fieldNames.has('skipIfMissing')) {
      targetedHints.push(
        [
          '`skipIfMissing` is deletion-only. Remove it when newString is non-empty.',
          'For an idempotent deletion use { "oldString": "...", "newString": "", "skipIfMissing": true }.',
        ].join('\n'),
      )
    }
    if (targetedHints.length > 0) return targetedHints.join('\n\n')
    const hasEditsContainerIssue = (issues ?? []).some(
      (issue) => issue.path?.[0] === 'edits' && issue.path.length <= 1,
    )
    if (!hasEditsContainerIssue) return undefined
    return [
      'Expected shape: { "edits": [{ "id"?: string, "type": "str_replace" | "replace_range" | "structured" | "create" | "delete" | "move" | "rewrite_symbol" | "patch" | "write_file", "path": string, ... }] }.',
      'Pass `edits` as an actual array of objects. Do not JSON.stringify the array or its entries. Complete legacy JSON strings are decoded defensively, but malformed or truncated strings cannot be reconstructed without risking partial edits.',
      'Re-issue one complete tool call. If the payload is large, split independent edits into smaller transactions; keep edits that must remain atomic together.',
    ].join('\n')
  }
  return fieldHint
}

function valueAtPath(value: unknown, path: PropertyKey[]): unknown {
  let current = value
  for (const segment of path) {
    if (current === null || typeof current !== 'object') return undefined
    current = (current as Record<PropertyKey, unknown>)[segment]
  }
  return current
}

function formatInvalidInputExcerpts(
  input: unknown,
  issues: ValidationIssue[],
): string {
  const seen = new Set<string>()
  const excerpts: string[] = []
  for (const issue of issues) {
    const path = issue.path ?? []
    const excerptPath = path.length > 0 ? path.slice(0, -1) : path
    const label = excerptPath.length
      ? excerptPath
          .map((segment, index) =>
            typeof segment === 'number'
              ? `[${segment}]`
              : `${index > 0 ? '.' : ''}${String(segment)}`,
          )
          .join('')
      : '<root>'
    if (seen.has(label)) continue
    seen.add(label)
    excerpts.push(
      `${label}:\n${formatValueForError(valueAtPath(input, excerptPath), 1_600)}`,
    )
    if (excerpts.join('\n\n').length >= 6_000) break
  }
  return excerpts.join('\n\n') || formatValueForError(input, 2_000)
}

function isFileChangingTool(toolName: string): boolean {
  return (
    toolName === 'apply_patch' ||
    toolName === 'apply_smart_patch' ||
    toolName === 'edit_transaction' ||
    toolName === 'replace_range' ||
    toolName === 'rewrite_symbol' ||
    toolName === 'str_replace' ||
    toolName === 'write_file' ||
    toolName === 'edit_3d_asset'
  )
}

export function sanitizePathSegment(segment: string): string {
  // Strip path separators (forward/back slash, null byte) and parent-directory
  // traversal (..) so an agent-supplied identifier (e.g. write_audit_findings
  // sessionSlug/shardId) cannot escape the intended findings directory via
  // ../../.. when no filesystemScope is configured.
  return segment.replace(/[\\/\u0000]/g, '').replace(/\.\./g, '')
}

export function getFilesystemToolPaths(
  toolName: string,
  input: Record<string, unknown>,
): { access: 'read' | 'write'; paths: string[] } | undefined {
  const strings = (value: unknown): string[] =>
    Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string')
      : typeof value === 'string'
        ? [value]
        : []
  const objectPaths = (value: unknown): string[] =>
    Array.isArray(value)
      ? value.flatMap((item) =>
          item && typeof item === 'object'
            ? strings((item as Record<string, unknown>).path)
            : [],
        )
      : []
  if (toolName === 'read_files') {
    return {
      access: 'read',
      paths: [
        ...strings(input.paths),
        ...objectPaths(input.ranges),
        ...objectPaths(input.symbols),
      ],
    }
  }
  if (toolName === 'read_subtree' || toolName === 'read_image') {
    const paths = strings(input.paths)
    return {
      access: 'read',
      paths: toolName === 'read_subtree' && paths.length === 0 ? ['.'] : paths,
    }
  }
  if (
    toolName === 'read_outline' ||
    toolName === 'read_slices' ||
    toolName === 'list_directory' ||
    toolName === 'inspect_3d_asset' ||
    toolName === 'render_3d_preview'
  ) {
    return { access: 'read', paths: strings(input.path) }
  }
  if (toolName === 'glob' || toolName === 'code_search') {
    return { access: 'read', paths: strings(input.cwd ?? '.') }
  }
  if (toolName === 'apply_patch') {
    const operation = input.operation
    return {
      access: 'write',
      paths:
        operation && typeof operation === 'object'
          ? strings((operation as Record<string, unknown>).path)
          : [],
    }
  }
  if (toolName === 'edit_transaction') {
    const edits = Array.isArray(input.edits) ? input.edits : []
    return {
      access: 'write',
      paths: edits.flatMap((edit) =>
        edit && typeof edit === 'object'
          ? [
              ...strings((edit as Record<string, unknown>).path),
              ...strings((edit as Record<string, unknown>).destinationPath),
            ]
          : [],
      ),
    }
  }
  if (toolName === 'write_audit_findings') {
    const sessionSlug = sanitizePathSegment(
      typeof input.sessionSlug === 'string' ? input.sessionSlug : '',
    )
    const shardId = sanitizePathSegment(
      typeof input.shardId === 'string' ? input.shardId : '',
    )
    return {
      access: 'write',
      paths: [`.agents/sessions/${sessionSlug}/findings/${shardId}.md`],
    }
  }
  if (isFileChangingTool(toolName)) {
    return { access: 'write', paths: strings(input.path) }
  }
  return undefined
}

export function canonicalScopedToolPath(
  normalizedPath: string,
  projectRoot: string,
): string {
  const root = realpathSync(projectRoot)
  const target = path.resolve(projectRoot, normalizedPath)
  const suffix: string[] = []
  let existing = target
  let canonicalExisting: string | undefined
  // Walk up to the nearest existing ancestor. Use a single realpathSync
  // call per iteration (instead of existsSync + realpathSync) to close the
  // TOCTOU window where a symlink could be swapped between the existence
  // check and the canonical resolution. If the path does not exist,
  // realpathSync throws and we defer that segment to lexical reattachment.
  // SDK handlers remain the authoritative containment layer; this is a
  // defense-in-depth symlink mitigation.
  while (canonicalExisting === undefined) {
    try {
      canonicalExisting = realpathSync(existing)
    } catch {
      const parent = path.dirname(existing)
      if (parent === existing) break
      suffix.unshift(path.basename(existing))
      existing = parent
    }
  }
  if (canonicalExisting === undefined) {
    // No existing ancestor resolved (e.g. projectRoot missing); fall back to
    // the lexical path so create operations are not falsely denied.
    return normalizedPath.replace(/\\/g, '/') || '.'
  }
  return (
    path
      .relative(root, path.join(canonicalExisting, ...suffix))
      .replace(/\\/g, '/') || '.'
  )
}

export function parseRawToolCall<T extends ToolName = ToolName>(params: {
  rawToolCall: {
    toolName: T
    toolCallId: string
    input: unknown
    providerOptions?: ProviderMetadata
  }
}): CodebuffToolCall<T> | ToolCallError {
  const { rawToolCall } = params
  const toolName = rawToolCall.toolName

  const processedParameters = parseStringifiedToolInput(
    rawToolCall.input,
    toolName,
  )
  const paramsSchema = toolParams[toolName].inputSchema

  if (typeof processedParameters.input === 'string') {
    return stringInputError(
      toolName,
      rawToolCall.toolCallId,
      processedParameters.parseError,
      rawToolCall.input,
    )
  }

  const repairedInput = repairSetOutputData(toolName, processedParameters.input)
  const result = paramsSchema.safeParse(repairedInput)

  if (!result.success) {
    // Keep the public set_output schema strict so providers are guided toward
    // object-valued data. If a model still stringifies data, publish the tool
    // call and let the handler return a recoverable validation result. This
    // gives the agent a chance to retry instead of terminating on a raw tool
    // parameter error. The handler never commits incomplete string data.
    if (
      toolName === 'set_output' &&
      repairedInput !== null &&
      typeof repairedInput === 'object' &&
      !Array.isArray(repairedInput) &&
      typeof (repairedInput as Record<string, unknown>).data === 'string'
    ) {
      const transportInput = {
        ...(repairedInput as Record<string, unknown>),
      }
      delete transportInput[endsAgentStepParam]
      return {
        toolName,
        input: transportInput,
        toolCallId: rawToolCall.toolCallId,
        ...(rawToolCall.providerOptions && {
          providerOptions: rawToolCall.providerOptions,
        }),
      } as CodebuffToolCall<T>
    }

    const issues = result.error.issues as ValidationIssue[]
    const hint = getToolValidationHint(toolName, issues)
    const summary = formatValidationIssues({ issues, toolName })
    const validationDetails = JSON.stringify(result.error.issues, null, 2)
    return {
      toolName,
      toolCallId: rawToolCall.toolCallId,
      input: rawToolCall.input,
      error: `Invalid parameters for ${toolName}: ${summary}\n\nRaw validation issues:\n${validationDetails}${hint ? `\n\n${hint}` : ''}`,
      formattedInput: formatInvalidInputExcerpts(repairedInput, issues),
    }
  }

  if (endsAgentStepParam in result.data) {
    delete result.data[endsAgentStepParam]
  }

  return {
    toolName,
    input: result.data,
    toolCallId: rawToolCall.toolCallId,
    ...(rawToolCall.providerOptions && {
      providerOptions: rawToolCall.providerOptions,
    }),
  } as CodebuffToolCall<T>
}

export type ExecuteToolCallParams<T extends string = ToolName> = {
  toolName: T
  input: Record<string, unknown>
  autoInsertEndStepParam?: boolean
  excludeToolFromMessageHistory?: boolean

  agentContext: Record<string, Subgoal>
  agentState: AgentState
  agentStepId: string
  ancestorRunIds: string[]
  agentTemplate: AgentTemplate
  clientSessionId: string
  fileContext: ProjectFileContext
  fileProcessingState: FileProcessingState
  fingerprintId: string
  fromHandleSteps?: boolean
  fullResponse: string
  localAgentTemplates: Record<string, AgentTemplate>
  logger: Logger
  previousToolCallFinished: Promise<void>
  // True when a write is waiting behind an active read or write barrier.
  // Threaded through so the emitted `tool_call` event can carry `queued`, and
  // so a `tool_start` transition fires once the dependency resolves. This is
  // independent of whether a single target path can be extracted.
  queued?: boolean
  prompt: string | undefined
  providerOptions?: ProviderMetadata
  repoId: string | undefined
  repoUrl: string | undefined
  runId: string
  signal: AbortSignal
  system: string
  tools: ToolSet
  toolCallId: string | undefined
  toolCalls: (CodebuffToolCall | CustomToolCall)[]
  toolCallsToAddToMessageHistory: (CodebuffToolCall | CustomToolCall)[]
  toolResults: ToolMessage[]
  toolResultsToAddToMessageHistory: ToolMessage[]
  userId: string | undefined
  userInputId: string

  fetch: typeof globalThis.fetch
  onCostCalculated: (providerCostCents: number) => Promise<void>
  onResponseChunk: (chunk: string | PrintModeEvent) => void
} & AgentRuntimeDeps &
  AgentRuntimeScopedDeps

export async function executeToolCall<T extends ToolName>(
  params: ExecuteToolCallParams<T>,
): Promise<void> {
  const {
    toolName,
    input,
    excludeToolFromMessageHistory = false,
    fromHandleSteps = false,

    agentState,
    agentTemplate,
    logger,
    previousToolCallFinished,
    toolCalls,
    toolCallsToAddToMessageHistory,
    toolResults,
    toolResultsToAddToMessageHistory,
    userInputId,

    onCostCalculated,
    onResponseChunk,
    requestToolCall,
    queued,
  } = params
  const toolCallId = params.toolCallId ?? generateCompactId()
  const abortablePreviousToolCallFinished = makeAbortableBarrier(
    previousToolCallFinished,
    params.signal,
  )

  const toolCall: CodebuffToolCall<T> | ToolCallError = parseRawToolCall<T>({
    rawToolCall: {
      toolName,
      toolCallId,
      input,
      providerOptions: params.providerOptions,
    },
  })

  // Filter out restricted tools - emit error instead of tool call/result
  // This prevents the CLI from showing tool calls that the agent doesn't have permission to use
  if (
    toolCall.toolName &&
    !getEffectiveAgentToolNames(agentTemplate).includes(toolCall.toolName) &&
    !fromHandleSteps
  ) {
    const availableTools = getEffectiveAgentToolNames(agentTemplate)
    // Emit an error event instead of tool call/result pair
    // The stream parser will convert this to a user message for proper API compliance
    onResponseChunk({
      type: 'error',
      message: `Tool \`${toolName}\` is not available for agent \`${agentTemplate.id}\`. Available tools: ${availableTools.length > 0 ? availableTools.map((name) => `\`${name}\``).join(', ') : '(none)'}. Use one of those tools or continue without a tool; do not retry the unavailable name.`,
    })
    return abortablePreviousToolCallFinished
  }

  if ('error' in toolCall) {
    const formattedInput = toolCall.formattedInput ?? formatValueForError(input)
    const inputLabel = toolCall.formattedInput
      ? 'Relevant invalid input excerpts'
      : 'Original tool call input'
    onResponseChunk({
      type: 'error',
      message: `${toolCall.error}\n\n${inputLabel}:\n${formattedInput}`,
    })
    logger.debug(
      { toolCall, error: toolCall.error },
      `${toolName} error: ${toolCall.error}`,
    )
    return abortablePreviousToolCallFinished
  }

  const filesystemAccess = getFilesystemToolPaths(
    toolName,
    toolCall.input as Record<string, unknown>,
  )
  const allowedPatterns = filesystemAccess
    ? agentTemplate.filesystemScope?.[filesystemAccess.access]
    : undefined
  if (filesystemAccess && allowedPatterns) {
    const deniedPaths = filesystemAccess.paths
      .map((rawPath) => {
        const normalized = normalizeScopedToolPath(
          rawPath,
          params.fileContext.projectRoot,
        )
        let canonical = normalized
        if (params.fileContext.fileTreeSource !== 'virtual') {
          try {
            canonical = canonicalScopedToolPath(
              normalized,
              params.fileContext.projectRoot,
            )
          } catch {
            // SDK handlers remain the authoritative containment layer. Keep
            // lexical scope for missing paths so create operations still work.
          }
        }
        return { rawPath, normalized, canonical }
      })
      .filter(
        ({ normalized, canonical }) =>
          normalized === '..' ||
          normalized.startsWith('../') ||
          path.isAbsolute(normalized) ||
          canonical === '..' ||
          canonical.startsWith('../') ||
          path.isAbsolute(canonical) ||
          !allowedPatterns.some(
            (pattern) =>
              scopePatternMatches(normalized, pattern) &&
              scopePatternMatches(canonical, pattern),
          ),
      )
    if (deniedPaths.length > 0) {
      onResponseChunk({
        type: 'error',
        message: `Tool \`${toolName}\` was blocked by the ${agentTemplate.id} filesystem ${filesystemAccess.access} scope. Disallowed path(s): ${deniedPaths.map(({ rawPath }) => rawPath).join(', ')}. Allowed patterns: ${allowedPatterns.join(', ')}.`,
      })
      return abortablePreviousToolCallFinished
    }
  }

  const canSuggestFollowups = (agentState as { canSuggestFollowups?: boolean })
    .canSuggestFollowups
  if (toolName === 'suggest_followups') {
    if (
      canSuggestFollowups === false ||
      toolCalls.some((call) => isFileChangingTool(call.toolName))
    ) {
      onResponseChunk({
        type: 'error',
        message:
          'Tool `suggest_followups` is not available yet. Finish the requested work first; for edited code, wait until the automated validation/reviewer gate has passed and you have written a user-visible completion summary.',
      })
      return abortablePreviousToolCallFinished
    }
  } else if (
    canSuggestFollowups === true &&
    isFileChangingTool(toolName) &&
    toolCalls.some((call) => call.toolName === 'suggest_followups')
  ) {
    onResponseChunk({
      type: 'error',
      message:
        'File-changing tools are not available after suggest_followups in the same step. If more edits are needed, make them before final follow-up suggestions so validation and review can rerun.',
    })
    return abortablePreviousToolCallFinished
  }

  // Retract suggest_followups permission for the remainder of this step as
  // soon as a file-changing tool executes. canSuggestFollowups is computed
  // once at the top of the orchestrator's loop from the prior gate state;
  // without this, an LLM could make edits in one tool-call batch and then
  // call suggest_followups in a later batch of the same step (before the
  // post-step edits-detected block re-evaluates the gate), bypassing the
  // validation/reviewer gate. The same-batch case is already covered by the
  // toolCalls.some(isFileChangingTool) check above; this covers cross-batch.
  // Only retract when the gate system is active (canSuggestFollowups is
  // defined); non-base2/custom agents that never opted into the gate are
  // unaffected.
  if (
    isFileChangingTool(toolName) &&
    canSuggestFollowups !== undefined &&
    canSuggestFollowups !== false
  ) {
    ;(agentState as { canSuggestFollowups?: boolean }).canSuggestFollowups =
      false
  }

  // TODO: Allow tools to provide a validation function, and move this logic into the spawn_agents validation function.
  // Pre-validate spawn_agents to filter out non-existent agents before streaming
  let effectiveInput = toolCall.input as Record<string, unknown>

  // Deterministically block git-committer spawns until the validation/reviewer
  // gate has passed. canSuggestFollowups is false precisely when the gate is
  // not green (edits pending review). This mirrors the suggest_followups guard
  // above and enforces the harness ordering: commit only after review is green.
  // When canSuggestFollowups is undefined (gate system not active, e.g. non-base2
  // agents), the check is skipped so custom agents are unaffected.
  // Only the git-committer entry is filtered; co-batched legitimate agents
  // proceed normally, consistent with the spawn_agents pre-validation pattern.
  if (toolName === 'spawn_agents' && canSuggestFollowups === false) {
    const agents = effectiveInput.agents
    if (Array.isArray(agents)) {
      const filteredAgents = agents.filter(
        (agent) =>
          !(
            agent &&
            typeof agent === 'object' &&
            typeof (agent as Record<string, unknown>).agent_type === 'string' &&
            // Match on the resolved agent id so a git-committer alias cannot
            // bypass the pre-gate block (consistent with spawn resolution).
            normalizeSpawnAgentType(
              String((agent as Record<string, unknown>).agent_type),
            ) === 'git-committer'
          ),
      )
      if (filteredAgents.length < agents.length) {
        onResponseChunk({
          type: 'error',
          message:
            'Spawning `git-committer` is not available yet. The validation/reviewer gate must pass before committing. Wait for the automated gate to complete, then commit.',
        })
        if (filteredAgents.length === 0) {
          return abortablePreviousToolCallFinished
        }
        effectiveInput = { ...effectiveInput, agents: filteredAgents }
      }
    }
  }
  if (toolName === 'spawn_agents') {
    const agents = effectiveInput.agents
    if (Array.isArray(agents)) {
      // Pre-flight size warning: a single agent entry whose serialized form
      // exceeds 4KB is likely carrying a large file body or heredoc inside
      // params.command — the canonical truncation anti-pattern. Surface a
      // non-blocking logger.warn so the signal is observable without
      // disrupting the call. The prompt guard (Fix A) is the primary
      // prevention; this is the safety net.
      const MAX_SINGLE_AGENT_PAYLOAD_CHARS = 4_000
      // Conservative pre-screen threshold: JSON.stringify adds structural
      // overhead (quotes, braces, commas, escaping) on top of the raw
      // string/key content, so an entry whose raw content is somewhat below the
      // limit can still serialize past it. Trigger the exact serialized-length
      // check at half the limit so near-boundary oversized entries are not
      // missed, while still skipping truly small entries on the hot spawn path.
      const PAYLOAD_PRESCREEN_CHARS = Math.floor(
        MAX_SINGLE_AGENT_PAYLOAD_CHARS / 2,
      )
      // Depth cap guards against pathological/cyclic object graphs if this
      // walk is ever reused on untrusted (non-JSON) input. Parsed JSON is
      // acyclic and agent payloads are shallow, so the cap is never hit in
      // practice; beyond it we stop descending (treated as not-oversized).
      const MAX_PAYLOAD_WALK_DEPTH = 64
      const couldExceedPayloadLimit = (value: unknown): boolean => {
        let total = 0
        const walk = (node: unknown, depth: number): boolean => {
          if (depth > MAX_PAYLOAD_WALK_DEPTH) return false
          if (typeof node === 'string') {
            total += node.length
            return total >= PAYLOAD_PRESCREEN_CHARS
          }
          if (Array.isArray(node)) {
            for (const item of node) {
              if (walk(item, depth + 1)) return true
            }
            return false
          }
          if (node && typeof node === 'object') {
            for (const [key, val] of Object.entries(node)) {
              total += key.length
              if (total >= PAYLOAD_PRESCREEN_CHARS) return true
              if (walk(val, depth + 1)) return true
            }
          }
          return false
        }
        return walk(value, 0)
      }
      for (const agent of agents) {
        if (!couldExceedPayloadLimit(agent)) continue
        let serialized: string
        try {
          serialized = JSON.stringify(agent)
        } catch {
          continue
        }
        if (serialized.length > MAX_SINGLE_AGENT_PAYLOAD_CHARS) {
          const agentType =
            agent && typeof agent === 'object' && typeof (agent as Record<string, unknown>).agent_type === 'string'
              ? String((agent as Record<string, unknown>).agent_type)
              : 'unknown'
          logger.warn(
            { agentType, serializedLength: serialized.length, limit: MAX_SINGLE_AGENT_PAYLOAD_CHARS },
            'spawn_agents entry exceeds the soft payload size limit; the transport may truncate it. Consider authoring large file bodies with write_file/edit_transaction and running them via a short basher command.',
          )
        }
      }
      const isParentBaseAgent = isBaseAgent(agentTemplate.id)

      const validationResults = await Promise.allSettled(
        agents.map(async (agent) => {
          if (!agent || typeof agent !== 'object') {
            return { valid: false as const, error: 'Invalid agent entry' }
          }
          const agentTypeStr = (agent as Record<string, unknown>).agent_type
          if (typeof agentTypeStr !== 'string' || !agentTypeStr) {
            return {
              valid: false as const,
              error: 'Agent entry missing agent_type',
            }
          }

          let agentIdToLoad = normalizeSpawnAgentType(agentTypeStr)
          if (!isParentBaseAgent) {
            const matchingSpawn = getMatchingSpawn(
              agentTemplate.spawnableAgents,
              agentTypeStr,
            )
            if (!matchingSpawn) {
              if (toolNames.includes(agentTypeStr as ToolName)) {
                return {
                  valid: false as const,
                  error: toolNotAgentError(agentTypeStr),
                }
              }
              return {
                valid: false as const,
                error: `Agent "${agentTypeStr}" is not available to spawn`,
              }
            }
            agentIdToLoad = matchingSpawn
          }

          try {
            const template = await getAgentTemplate({
              agentId: agentIdToLoad,
              localAgentTemplates: params.localAgentTemplates,
              fetchAgentFromDatabase: params.fetchAgentFromDatabase,
              databaseAgentCache: params.databaseAgentCache,
              logger,
              apiKey: params.apiKey,
            })
            if (!template) {
              if (toolNames.includes(agentTypeStr as ToolName)) {
                return {
                  valid: false as const,
                  error: toolNotAgentError(agentTypeStr),
                }
              }
              return {
                valid: false as const,
                error: `Agent "${agentTypeStr}" does not exist`,
              }
            }
            const entry = agent as Record<string, unknown>
            validateAgentInput(
              template,
              agentTypeStr,
              typeof entry.prompt === 'string' ? entry.prompt : undefined,
              entry.params,
            )
          } catch (error) {
            return {
              valid: false as const,
              error:
                error instanceof Error
                  ? error.message
                  : `Agent "${agentTypeStr}" could not be loaded or validated`,
            }
          }

          return { valid: true as const, agent }
        }),
      )

      const validAgents: unknown[] = []
      const errors: string[] = []

      for (const result of validationResults) {
        if (result.status === 'rejected') {
          errors.push('Agent validation failed unexpectedly')
        } else if (result.value.valid) {
          validAgents.push(result.value.agent)
        } else {
          errors.push(result.value.error)
        }
      }

      if (errors.length > 0) {
        if (validAgents.length === 0) {
          logger.debug(
            { toolName, errors },
            'All agents in spawn_agents failed pre-validation; publishing the call so the handler can return a structured failure result',
          )
        } else {
          const errorMsg = `Some agents could not be spawned: ${errors.join('; ')}. Proceeding with valid agents only.`
          onResponseChunk({ type: 'error', message: errorMsg })
          effectiveInput = { ...effectiveInput, agents: validAgents }
        }
      }
    }
  } else if (toolName === 'spawn_agent_inline') {
    const inlineInput = effectiveInput as {
      agent_type?: unknown
      prompt?: unknown
      params?: unknown
    }
    if (typeof inlineInput.agent_type === 'string') {
      try {
        const validated = await validateAndGetAgentTemplate({
          ...params,
          agentTypeStr: inlineInput.agent_type,
          parentAgentTemplate: agentTemplate,
        })
        validateAgentInput(
          validated.agentTemplate,
          validated.agentType,
          typeof inlineInput.prompt === 'string'
            ? inlineInput.prompt
            : undefined,
          inlineInput.params,
        )
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        onResponseChunk({ type: 'error', message })
        logger.debug(
          { toolName, error: message },
          'spawn_agent_inline input failed pre-publication validation',
        )
        return abortablePreviousToolCallFinished
      }
    }
  }

  // Only emit tool_call event after permission check passes
  onResponseChunk({
    type: 'tool_call',
    toolCallId,
    toolName,
    input: effectiveInput,
    agentId: agentState.agentId,
    parentAgentId: agentState.parentId,
    includeToolCall: !excludeToolFromMessageHistory,
    ...(queued !== undefined && { queued }),
  })

  // When this write is queued behind a prior same-path write, emit a
  // `tool_start` transition once the barrier resolves so the CLI can flip the
  // block from "queued" to "pending". This is non-blocking: we do NOT await
  // `previousToolCallFinished` here (the handler still awaits it internally;
  // double-resolution is harmless). Attach the `.then` immediately after the
  // `tool_call` emit so ordering vs `tool_result` is guaranteed.
  if (queued === true) {
    abortablePreviousToolCallFinished.then(
      () => onResponseChunk({ type: 'tool_start', toolCallId }),
      () => {},
    )
  }

  // Cast to any to avoid type errors
  const handler = codebuffToolHandlers[
    toolName
  ] as unknown as CodebuffToolHandlerFunction<T>

  // Use effective input for spawn_agents so the handler receives the correct agent types
  const finalToolCall =
    toolName === 'spawn_agents'
      ? { ...toolCall, input: effectiveInput }
      : toolCall

  toolCalls.push(finalToolCall)
  if (!excludeToolFromMessageHistory) {
    toolCallsToAddToMessageHistory.push(finalToolCall)
  }

  const toolResultPromise = Promise.resolve().then(() =>
    handler({
      ...params,
      toolCall: finalToolCall,
      previousToolCallFinished: abortablePreviousToolCallFinished,
      writeToClient: onResponseChunk,
      requestClientToolCall: (async (
        clientToolCall: ClientToolCall<T extends ClientToolName ? T : never>,
      ) => {
        if (params.signal.aborted) {
          return []
        }

        const clientToolResult = await requestToolCall({
          userInputId,
          callId: clientToolCall.toolCallId,
          toolName: clientToolCall.toolName,
          input: clientToolCall.input,
          signal: params.signal,
        })
        return clientToolResult.output as CodebuffToolOutput<T>
      }) as any,
    }),
  )

  const recoverableToolResultPromise = toolResultPromise.catch((error) => {
    if (isAbortError(error)) throw error
    logger.warn(
      { error, toolName, toolCallId: toolCall.toolCallId },
      'Native tool handler failed after tool-call publication; returning a terminal failure result',
    )
    return {
      output:
        toolName === 'spawn_agents'
          ? buildSpawnAgentsHandlerFailureOutput(finalToolCall.input, error)
          : (buildNativeToolResultErrorOutputV1({
              toolName,
              callId: toolCall.toolCallId,
              issueCount: 1,
              message: `The ${toolName} handler failed after the tool call started: ${error instanceof Error ? error.message : String(error)}. No successful result is confirmed.`,
            }) as CodebuffToolOutput<T>),
    } as Awaited<ReturnType<typeof handler>>
  })

  return recoverableToolResultPromise.then(async ({ output, creditsUsed }) => {
    let validatedOutput = output
    if (toolName === 'read_files') {
      const parsed = toolParams.read_files.outputSchema.safeParse(output)
      if (!parsed.success) {
        logger.error(
          {
            toolCallId: toolCall.toolCallId,
            issues: parsed.error.issues,
          },
          'Native read_files output failed schema validation',
        )
        const input = finalToolCall.input as {
          paths?: string[]
          ranges?: Array<{ path: string }>
          symbols?: Array<{ path: string }>
        }
        const selectors = [
          ...(input.paths ?? []).map((path) => ({
            selector: 'file' as const,
            path,
          })),
          ...(input.ranges ?? []).map((range) => ({
            selector: 'range' as const,
            path: range.path,
          })),
          ...(input.symbols ?? []).map((symbol) => ({
            selector: 'symbols' as const,
            path: symbol.path,
          })),
        ]
        const results: ReadFilesItemV1[] = (
          selectors.length > 0
            ? selectors
            : [{ selector: 'file' as const, path: '<read_files>' }]
        ).map((selector, requestIndex) => ({
          ...selector,
          requestIndex,
          status: 'error' as const,
          error: {
            code: 'io_error' as const,
            message:
              'The read_files harness produced a malformed result. Retry the read; no read authorization was granted.',
            retryable: true,
            recovery: 'read_again' as const,
          },
        }))
        for (const { path } of selectors) {
          delete params.fileProcessingState.readAuthorizationsByPath?.[path]
          delete params.fileProcessingState.readAuthorizationHashesByPath?.[
            path
          ]
          params.fileProcessingState.failedEditRequiresReadByPath[path] = true
        }
        validatedOutput = jsonToolResult(
          buildReadFilesResultV1(results),
        ) as typeof output
      }
    } else {
      const normalized = normalizeNativeToolOutput({
        toolName,
        toolCallId: toolCall.toolCallId,
        output,
      })
      if (!normalized.valid) {
        logger.error(
          {
            toolCallId: toolCall.toolCallId,
            toolName,
            issueCount: normalized.issues.length,
            issues: normalized.issues.map((issue) => issue.message),
          },
          'Native tool output failed schema validation',
        )
        validatedOutput = normalized.output
      }
    }
    const toolResult: ToolMessage = {
      role: 'tool',
      toolName,
      toolCallId: toolCall.toolCallId,
      content: validatedOutput,
    }

    onResponseChunk({
      type: 'tool_result',
      toolCallId: toolResult.toolCallId,
      toolName: toolResult.toolName,
      output: toolResult.content,
      agentId: agentState.agentId,
      parentAgentId: agentState.parentId,
    })

    toolResults.push(toolResult)

    if (!excludeToolFromMessageHistory) {
      toolResultsToAddToMessageHistory.push(toolResult)
    }

    // After tool completes, resolve any pending creditsUsed promise
    if (creditsUsed) {
      onCostCalculated(creditsUsed)
      logger.debug(
        { credits: creditsUsed, totalCredits: agentState.creditsUsed },
        `Added ${creditsUsed} credits from ${toolName} to agent state`,
      )
    }
  })
}

export function parseRawCustomToolCall(params: {
  customToolDefs: CustomToolDefinitions
  rawToolCall: {
    toolName: string
    toolCallId: string
    input: unknown
    providerOptions?: ProviderMetadata
  }
  autoInsertEndStepParam?: boolean
}): CustomToolCall | ToolCallError {
  const { customToolDefs, rawToolCall, autoInsertEndStepParam = false } = params
  const toolName = rawToolCall.toolName

  if (
    !(customToolDefs && toolName in customToolDefs) &&
    !toolName.includes(MCP_TOOL_SEPARATOR)
  ) {
    return {
      toolName,
      toolCallId: rawToolCall.toolCallId,
      input: rawToolCall.input,
      error: `Tool ${toolName} not found`,
    }
  }

  const parsedInput = parseStringifiedToolInput(rawToolCall.input, toolName)

  if (typeof parsedInput.input === 'string') {
    return stringInputError(
      toolName,
      rawToolCall.toolCallId,
      parsedInput.parseError,
    )
  }

  const processedParameters: Record<string, any> = {}
  for (const [param, val] of Object.entries(parsedInput.input ?? {})) {
    processedParameters[param] = val
  }

  // Add the required codebuff_end_step parameter with the correct value for this tool if requested
  if (autoInsertEndStepParam) {
    processedParameters[endsAgentStepParam] =
      customToolDefs?.[toolName]?.endsAgentStep
  }

  const rawSchema = customToolDefs?.[toolName]?.inputSchema
  if (rawSchema) {
    const paramsSchema = ensureZodSchema(rawSchema)
    const result = paramsSchema.safeParse(processedParameters)

    if (!result.success) {
      const issues = result.error.issues as ValidationIssue[]
      return {
        toolName: toolName,
        toolCallId: rawToolCall.toolCallId,
        input: rawToolCall.input,
        error: `Invalid parameters for ${toolName}: ${formatValidationIssues({ issues, toolName })}`,
      }
    }
  }

  const input = JSON.parse(JSON.stringify(parsedInput.input))
  if (endsAgentStepParam in input) {
    delete input[endsAgentStepParam]
  }
  return {
    toolName: toolName,
    input,
    toolCallId: rawToolCall.toolCallId,
    ...(rawToolCall.providerOptions && {
      providerOptions: rawToolCall.providerOptions,
    }),
  }
}

export async function executeCustomToolCall(
  params: ExecuteToolCallParams<string>,
): Promise<void> {
  const {
    toolName,
    input,
    autoInsertEndStepParam = false,
    excludeToolFromMessageHistory = false,
    fromHandleSteps = false,

    agentState,
    agentTemplate,
    fileContext,
    logger,
    onResponseChunk,
    previousToolCallFinished,
    requestToolCall,
    toolCallId,
    toolCalls,
    toolCallsToAddToMessageHistory,
    toolResults,
    toolResultsToAddToMessageHistory,
    userInputId,
    queued,
  } = params
  const abortablePreviousToolCallFinished = makeAbortableBarrier(
    previousToolCallFinished,
    params.signal,
  )
  const toolCall: CustomToolCall | ToolCallError = parseRawCustomToolCall({
    customToolDefs: await getMCPToolData({
      ...params,
      toolNames: getEffectiveAgentToolNames(agentTemplate),
      mcpServers: agentTemplate.mcpServers,
      writeTo: cloneDeep(fileContext.customToolDefinitions),
    }),
    rawToolCall: {
      toolName,
      toolCallId: toolCallId ?? generateCompactId(),
      input,
      providerOptions: params.providerOptions,
    },
    autoInsertEndStepParam,
  })

  // Filter out restricted tools - emit error instead of tool call/result
  // This prevents the CLI from showing tool calls that the agent doesn't have permission to use
  if (
    toolCall.toolName &&
    !getEffectiveAgentToolNames(agentTemplate).includes(toolCall.toolName) &&
    !fromHandleSteps &&
    !(
      toolCall.toolName.includes(MCP_TOOL_SEPARATOR) &&
      toolCall.toolName.split(MCP_TOOL_SEPARATOR)[0] in agentTemplate.mcpServers
    )
  ) {
    const availableTools = getEffectiveAgentToolNames(agentTemplate)
    // Emit an error event instead of tool call/result pair
    // The stream parser will convert this to a user message for proper API compliance
    onResponseChunk({
      type: 'error',
      message: `Tool \`${toolName}\` is not available for agent \`${agentTemplate.id}\`. Available tools: ${availableTools.length > 0 ? availableTools.map((name) => `\`${name}\``).join(', ') : '(none)'}. Use one of those tools or continue without a tool; do not retry the unavailable name.`,
    })
    return abortablePreviousToolCallFinished
  }

  if ('error' in toolCall) {
    const formattedInput = toolCall.formattedInput ?? formatValueForError(input)
    const inputLabel = toolCall.formattedInput
      ? 'Relevant invalid input excerpts'
      : 'Original tool call input'
    onResponseChunk({
      type: 'error',
      message: `${toolCall.error}\n\n${inputLabel}:\n${formattedInput}`,
    })
    logger.debug(
      { toolCall, error: toolCall.error },
      `${toolName} error: ${toolCall.error}`,
    )
    return abortablePreviousToolCallFinished
  }

  // Only emit tool_call event after permission check passes
  onResponseChunk({
    type: 'tool_call',
    toolCallId: toolCall.toolCallId,
    toolName,
    input: toolCall.input,
    agentId: agentState.agentId,
    parentAgentId: agentState.parentId,
    // Include includeToolCall flag if explicitly set to false
    ...(excludeToolFromMessageHistory && { includeToolCall: false }),
    ...(queued !== undefined && { queued }),
  })

  // When this write is queued behind a prior same-path write, emit a
  // `tool_start` transition once the barrier resolves so the CLI can flip the
  // block from "queued" to "pending". Non-blocking: do NOT await
  // `previousToolCallFinished` here (the handler still awaits it internally).
  // For custom/unknown-path writes `queued` is typically undefined, so this
  // is a no-op in practice — guarded for consistency with native writes.
  if (queued === true) {
    abortablePreviousToolCallFinished.then(
      () => {
        onResponseChunk({
          type: 'tool_start',
          toolCallId: toolCall.toolCallId,
        })
      },
      () => {},
    )
  }

  toolCalls.push(toolCall)
  if (!excludeToolFromMessageHistory) {
    toolCallsToAddToMessageHistory.push(toolCall)
  }

  return abortablePreviousToolCallFinished
    .then(async () => {
      if (params.signal.aborted) {
        return null
      }

      const toolName = toolCall.toolName.includes(MCP_TOOL_SEPARATOR)
        ? toolCall.toolName
            .split(MCP_TOOL_SEPARATOR)
            .slice(1)
            .join(MCP_TOOL_SEPARATOR)
        : toolCall.toolName
      const clientToolResult = await requestToolCall({
        userInputId,
        toolName,
        input: toolCall.input,
        mcpConfig: toolCall.toolName.includes(MCP_TOOL_SEPARATOR)
          ? agentTemplate.mcpServers[
              toolCall.toolName.split(MCP_TOOL_SEPARATOR)[0]
            ]
          : undefined,
        signal: params.signal,
      })
      return clientToolResult.output satisfies ToolResultOutput[]
    })
    .catch((error) => {
      if (isAbortError(error)) throw error
      logger.warn(
        { error, toolName, toolCallId: toolCall.toolCallId },
        'Custom tool handler failed after tool-call publication; returning a terminal failure result',
      )
      return buildNativeToolResultErrorOutputV1({
        toolName,
        callId: toolCall.toolCallId,
        issueCount: 1,
        message: `The ${toolName} handler failed after the tool call started: ${error instanceof Error ? error.message : String(error)}. No successful result is confirmed.`,
      })
    })
    .then((result) => {
      if (!result) {
        return
      }
      const toolResult = {
        role: 'tool',
        toolName,
        toolCallId: toolCall.toolCallId,
        content: result,
      } satisfies ToolMessage
      logger.debug(
        { input, toolResult },
        `${toolName} custom tool call & result (${toolResult.toolCallId})`,
      )
      onResponseChunk({
        type: 'tool_result',
        toolName: toolResult.toolName,
        toolCallId: toolResult.toolCallId,
        output: toolResult.content,
        agentId: agentState.agentId,
        parentAgentId: agentState.parentId,
      })

      toolResults.push(toolResult)

      if (!excludeToolFromMessageHistory) {
        toolResultsToAddToMessageHistory.push(toolResult)
      }

      return
    })
}

export function tryTransformAgentToolCall(params: {
  toolName: string
  input: unknown
  spawnableAgents: AgentTemplateType[]
}): { toolName: 'spawn_agents'; input: Record<string, unknown> } | null {
  const { toolName, spawnableAgents } = params

  const matchesAgentToolName = (agentType: AgentTemplateType) =>
    getAgentToolName(agentType) === toolName ||
    getAgentShortName(agentType) === toolName

  // Find the full agent type for this direct-call alias.
  const fullAgentType = spawnableAgents.find(matchesAgentToolName)
  if (!fullAgentType) {
    return null
  }

  const parsedInput = parseJsonBounded(params.input)
  if (
    parsedInput === null ||
    typeof parsedInput !== 'object' ||
    Array.isArray(parsedInput)
  ) {
    return null
  }
  const input = parsedInput as Record<string, unknown>

  const repairMalformedNestedValue = (value: unknown): unknown => {
    if (typeof value !== 'string') return value
    try {
      JSON.parse(value)
      return value
    } catch {
      return parseJsonBounded(value)
    }
  }

  // Convert to spawn_agents call - input already has prompt and params as top-level fields
  // (consistent with spawn_agents schema)
  const agentEntry: Record<string, unknown> = {
    agent_type: fullAgentType,
  }
  if (typeof input.prompt === 'string') {
    agentEntry.prompt = input.prompt
  }
  if (Object.hasOwn(input, 'params')) {
    agentEntry.params = repairMalformedNestedValue(input.params)
  }
  if (Object.hasOwn(input, 'handoff')) {
    agentEntry.handoff = repairMalformedNestedValue(input.handoff)
  }
  if (Object.hasOwn(input, 'background')) {
    agentEntry.background = input.background
  }
  if (Object.hasOwn(input, 'timeout_seconds')) {
    agentEntry.timeout_seconds = input.timeout_seconds
  }
  const spawnAgentsInput = {
    agents: [agentEntry],
  }

  return { toolName: 'spawn_agents', input: spawnAgentsInput }
}
