import { publisher } from '../constants'

import type { AgentDefinition } from '../types/agent-definition'
import { qualitySection } from '../base2/quality-prompt-section'
import { PLACEHOLDER } from '@codebuff/agent-runtime/templates/types'

type CodeEditorVariant =
  | 'gpt-5'
  | 'opus'
  | 'glm'
  | 'kimi'
  | 'deepseek'
  | 'minimax'

// Only Opus gets <think>-tag scaffolding in its instructions; the other
// variants either have native reasoning (deepseek) or are non-reasoning
// models where the extra prose just bloats the prompt without helping.
const EDITOR_VARIANTS_WITH_THINK_TAGS: ReadonlySet<CodeEditorVariant> = new Set(
  ['opus'],
)
const EDITOR_MODELS: Record<CodeEditorVariant, AgentDefinition['model']> = {
  'gpt-5': 'openai/gpt-5.3',
  opus: 'anthropic/claude-opus-4.7',
  glm: 'z-ai/glm-4.7',
  kimi: 'moonshotai/kimi-k2.6',
  deepseek: 'deepseek/deepseek-v4-pro',
  minimax: 'minimax/minimax-m2.7',
}

export const createCodeEditor = (options: {
  model: CodeEditorVariant
}): Omit<AgentDefinition, 'id'> => {
  const { model } = options
  return {
    publisher,
    model: EDITOR_MODELS[model],
    displayName: 'Code Editor',
    spawnerPrompt:
      'Expert code editor that implements code changes. Spawn this agent with a compact, self-contained implementation brief containing requirements, target files, constraints/non-goals, relevant patterns, and code-level risks. Do not include validation commands, terminal cleanup, visual checks, review, git operations, or other parent-only work. The editor can read exact target files to recover missing or stale context and performs every mutation through edit_transaction, including capability-anchored range and symbol edits.',
    outputMode: 'structured_output',
    outputSchema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['completed', 'partial', 'blocked'],
        },
        messages: { type: 'array', items: {} },
        changedFiles: { type: 'array', items: { type: 'string' } },
        targetFileProgress: {
          type: 'object',
          properties: {
            targetFiles: { type: 'array', items: { type: 'string' } },
            changedTargetFiles: { type: 'array', items: { type: 'string' } },
            pendingTargetFiles: { type: 'array', items: { type: 'string' } },
          },
          required: ['targetFiles', 'changedTargetFiles', 'pendingTargetFiles'],
        },
        requirementsAddressed: { type: 'array', items: { type: 'string' } },
        acceptanceCriteriaAddressed: {
          type: 'array',
          items: { type: 'string' },
        },
        findingsAddressed: { type: 'array', items: { type: 'string' } },
        unresolved: { type: 'array', items: { type: 'string' } },
        requestedValidation: { type: 'array', items: { type: 'string' } },
      },
      required: [
        'status',
        'messages',
        'changedFiles',
        'requirementsAddressed',
        'acceptanceCriteriaAddressed',
        'findingsAddressed',
        'unresolved',
        'requestedValidation',
      ],
    },
    toolNames: ['read_files', 'read_outline', 'edit_transaction'],

    includeMessageHistory: false,
    inheritParentSystemPrompt: false,

    instructionsPrompt: `You are an expert code editor with deep understanding of software engineering principles. You were spawned to generate an implementation for the user's request. Do not spawn an editor agent, you are the editor agent and have already been spawned.
    
Your task is to write out ALL the code changes needed to complete the implementation-scoped portion of the user's request, across every file that must change. Treat the spawn prompt's implementation-scoped requirements, target files, constraints/non-goals, relevant patterns, and code-level risks as the source of truth.

Before a non-trivial edit, establish a compact source-backed implementation hypothesis: current behavior, desired behavior, exact evidence, intended change, expected observable result, and the signal that would falsify the approach. Do not edit when there is no causal link between evidence and the proposed change. Preserve stated invariants, failure behavior, compatibility expectations, acceptance cases, and explicit unknowns.

Prefer the smallest vertical slice (type/schema -> implementation -> direct test -> callers). If the same hypothesis or diagnostic survives two targeted attempts, stop repeating it, re-read the causal path, and switch strategy.

Do not perform or attempt parent-orchestrator responsibilities. You cannot run validation, typechecks, tests, terminal commands, visual smoke tests, code review, git operations, or shell-based cleanup/deletion. If parent-only tasks are mentioned anywhere in the spawn prompt, ignore them as parent responsibilities after you return. Do not create placeholder/no-op files to work around unavailable tools.

You may make edits across multiple turns. After each edit you will see whether it applied successfully:
- Call only edit_transaction for mutations. Use edit type rewrite_symbol for an entire function/class/method/type, str_replace for targeted text, replace_range for a freshly read block, structured for import-only changes, create for new files, patch for a complete unified diff, and write_file only for a necessary whole-file rewrite.
- For large files, use read_outline to discover structure and read_files.symbols to pull a specific symbol. If rewrite_symbol cannot parse or find the target, read the exact range and submit a replace_range edit with editAnchor.readCapability.
- If a str_replace edit fails because oldString is stale, missing, or ambiguous, re-read the exact current range (or use the fresh capability in the diagnostic) before retrying. A syntax-only preflight failure may retry corrected new content without re-reading because oldString already matched.
- If edit_transaction aborts, no files changed. Re-read every failed range named in the diagnostic, fix ambiguous oldString targets with a longer anchor or occurrenceIndex, and rebuild the whole related transaction from one fresh snapshot.
- Never use ultra-broad anchors such as a lone closing brace plus newline, blank lines, or common punctuation. If a diagnostic reports many occurrences, use rewrite_symbol, a capability-anchored replace_range, or occurrenceIndex only when the exact occurrence is known from the read/diagnostic.
- Put dependent edits in one transaction so they preflight together. A simple one-file change is also a one-edit transaction.
- Keep editing until the entire request is implemented across all files. Do not stop after a single file when more files still need changes.
- Do not create scratch, placeholder, sentinel, or no-op files just to test whether editing works or to signal completion. Only create files that are explicitly requested or directly required by the implementation.
- When every change has been made and all edits have applied successfully, stop: respond with a brief one-line confirmation and make no further tool calls.

Important: You may call read_files only for exact files you need to edit or to recover after a failed/stale edit. You cannot search, write todos, spawn agents, or set output. set_output in particular should not be used. Do not call any unsupported tools!

Deterministic large-file editing (follow this exactly to avoid edits that fail for no apparent reason):
- Before editing a large file, ALWAYS read the exact target range yourself with read_files (use the ranges parameter for big files) immediately before the edit. Never reuse a basedOnRead capability token that came from the parent agent or from a read you did before any intervening edit — those are stale and will be rejected even though the file is readable.
- For a medium/large block replacement, copy editAnchor.readCapability from the fresh range result into a replace_range edit. Do not also send startLine, endLine, or expectedHash; the capability already binds all three.
- For a large-file str_replace edit, copy editAnchor.readCapability verbatim into basedOnRead on each replacement.
- Put several non-overlapping changes in one edit_transaction. Replacements within one str_replace edit apply sequentially, so consolidate overlapping expectations into one larger str_replace, replace_range, or rewrite_symbol edit.
- Edit, get proof, edit again: after a successful transaction, use an echoed post-edit readCapability for the same region or re-read the region before the next edit.
- Only re-read after a successful edit when there is no echoed anchor for the region you need, when you need a different region, or when the previous edit failed/stale-anchor error tells you to re-read. Do NOT make repeated one-change calls to the same large file using old pre-edit anchors.
- If an edit is rejected because the anchor/line count looks stale, do not retry from memory: re-read the exact current range first, then make one edit based on that fresh read.
- If oldString appears multiple times, prefer occurrenceIndex (1-indexed) or a more specific oldString rather than re-reading solely to disambiguate; combine occurrenceIndex with a fresh basedOnRead when editing within an anchored large-file range.

Write every mutation using this tool call shape:

<codebuff_tool_call>
{
  "cb_tool_name": "edit_transaction",
  "edits": [
    {
      "type": "str_replace",
      "path": "path/to/file",
      "replacements": [
        {
          "oldString": "exact old code",
          "newString": "exact new code"
        }
      ]
    },
    {
      "type": "structured",
      "path": "path/to/file",
      "operation": {
        "kind": "insert_import",
        "importStatement": "import { helper } from './helper'"
      }
    },
    {
      "type": "replace_range",
      "path": "path/to/large-file.ts",
      "readCapability": "cap.v3.from-editAnchor",
      "newContent": "complete replacement content"
    }
  ]
}
</codebuff_tool_call>

${
  EDITOR_VARIANTS_WITH_THINK_TAGS.has(model)
    ? `Before you start writing your implementation, you should use <think> tags to think about the best way to implement the changes.

You can also use <think> tags interspersed between tool calls to think about the best way to implement the changes.

<example>

<think>
[ Long think about the best way to implement the changes ]
</think>

<codebuff_tool_call>
[ First tool call to implement the feature ]
</codebuff_tool_call>

<codebuff_tool_call>
[ Second tool call to implement the feature ]
</codebuff_tool_call>

<think>
[ Thoughts about a tricky part of the implementation ]
</think>

<codebuff_tool_call>
[ Third tool call to implement the feature ]
</codebuff_tool_call>

</example>`
    : ''
}

Your implementation should:
- Be complete and comprehensive
- Include all necessary changes to fulfill the user's request
- Follow the project's conventions and patterns
- Be as simple and maintainable as possible
- Reuse existing code wherever possible
- Be well-structured and organized

More style notes:
- Extra try/catch blocks clutter the code -- use them sparingly.
- Use required arguments when they represent real invariants; use defaults, optionals, builders, or overloads when they are idiomatic for the active language and match the surrounding API.
- Preserve the project's file-organization conventions. Split a new component or module only when that improves cohesion in this ecosystem.

Write out your complete implementation now, formatting all changes as tool calls as shown above.

${qualitySection}

${PLACEHOLDER.LANGUAGE_PROFILE}

${PLACEHOLDER.FRONTEND_SECTION}`,

    handleSteps: function* ({ agentState: initialAgentState, prompt, params }) {
      const initialMessageHistoryLength =
        initialAgentState.messageHistory.length
      const targetFiles = extractTargetFiles(
        prompt,
        initialAgentState.messageHistory,
      )

      let agentState = initialAgentState

      // Prime the editor with the exact declared targets before its first model
      // step. This both gives the model current source context and lets the
      // strict read-before-edit harness mint whole-file authorization for files
      // that exist. Missing targets remain eligible for create edits.
      if (targetFiles.length > 0) {
        const preRead = yield {
          toolName: 'read_files',
          input: { paths: targetFiles },
        }
        agentState = preRead.agentState
      }

      // Keep stepping while the model is still emitting edit tool calls so it
      // can implement multi-file changes and recover from failed transactions.
      // Productive steps are unlimited by default. The runtime's repeated-step
      // watchdog, cancellation, budgets, and subagent timeout bound runaway work.
      while (true) {
        const result = yield 'STEP'
        agentState = result.agentState
        if (result.stepsComplete) break
      }

      const { messageHistory } = agentState

      const newMessages = messageHistory.slice(initialMessageHistoryLength)
      const changedFiles = extractChangedFiles(newMessages)
      const targetFileProgress = buildTargetFileProgress(
        targetFiles,
        changedFiles,
      )
      const handoff =
        params?.handoff && typeof params.handoff === 'object'
          ? (params.handoff as Record<string, any>)
          : undefined
      const unresolved = targetFileProgress?.pendingTargetFiles ?? []
      const status =
        changedFiles.length === 0
          ? 'blocked'
          : unresolved.length > 0
            ? 'partial'
            : 'completed'
      const changedFileSet = new Set(changedFiles.map(normalizeFilePath))
      // Attest handoff findings whenever mutations landed and every listed
      // finding file is covered. Do not require status === 'completed' alone:
      // partial multi-target repairs still address the findings they touched.
      const findingsAddressed =
        changedFiles.length > 0 && Array.isArray(handoff?.findings)
          ? handoff.findings
              .filter((item: any) => {
                if (!Array.isArray(item?.files) || item.files.length === 0) {
                  return false
                }
                return item.files.every((file: unknown) =>
                  typeof file === 'string'
                    ? changedFileSet.has(normalizeFilePath(file))
                    : false,
                )
              })
              .map((item: any) => item.id)
              .filter((id: unknown): id is string => typeof id === 'string')
          : []

      yield {
        toolName: 'set_output',
        input: {
          output: {
            status,
            messages: newMessages,
            changedFiles,
            ...(targetFileProgress ? { targetFileProgress } : {}),
            requirementsAddressed: [],
            acceptanceCriteriaAddressed: [],
            findingsAddressed,
            unresolved,
            requestedValidation: [],
          },
        },
        includeToolCall: false,
      }

      function extractChangedFiles(messages: unknown[]): string[] {
        const files = new Set<string>()
        visit(messages, files)
        return [...files]
      }

      // NOTE: these helpers are inlined here (rather than imported from
      // agents/base2/gate-files) because `handleSteps` is serialized via
      // `.toString()` and reconstructed with `new Function(...)`, which drops
      // the module closure. Any module-scope reference would be `undefined`
      // at runtime. Keep these in sync with agents/base2/gate-files.ts and
      // the parallel inline copies in agents/base2/base2.ts.
      function isFileChangingTool(toolName: string): boolean {
        return (
          toolName === 'apply_patch' ||
          toolName === 'apply_smart_patch' ||
          toolName === 'edit_transaction' ||
          toolName === 'replace_range' ||
          toolName === 'rewrite_symbol' ||
          toolName === 'str_replace' ||
          toolName === 'write_file'
        )
      }

      // Accept both file_mutation_result and commit_receipt shapes. Runtime
      // attestation walks both; the editor must not under-report changedFiles
      // when only a commit_receipt is present in tool history.
      //
      // NOTE: the applied-action predicate is inlined in both hasEditArtifact
      // and visit (rather than a shared sibling helper) because the gate-files
      // parity test extracts each of these functions in isolation via
      // `new Function`, so any sibling reference would be undefined at
      // reconstruction time. Keep in sync with the parallel inline copies in
      // agents/base2/base2.ts and the canonical agents/base2/gate-files.ts.
      function hasEditArtifact(record: Record<string, unknown>): boolean {
        if (!Array.isArray(record.actions)) return false
        const hasAppliedAction = record.actions.some((action) => {
          if (!action || typeof action !== 'object') return false
          const entry = action as Record<string, unknown>
          if (typeof entry.path !== 'string' || entry.path.length === 0) {
            return false
          }
          return (
            entry.outcome === 'applied' ||
            entry.status === 'committed' ||
            entry.outcome === 'committed'
          )
        })
        if (!hasAppliedAction) return false
        if (record.kind === 'commit_receipt') return true
        if (record.kind !== 'file_mutation_result') return false
        return (
          record.version === 1 &&
          typeof record.operationId === 'string' &&
          record.operationId.length > 0 &&
          (record.outcome === 'applied' ||
            record.outcome === 'partial' ||
            record.outcome === 'rollback_incomplete' ||
            record.outcome === 'committed')
        )
      }

      function collectToolInputFiles(input: unknown, out: Set<string>): void {
        if (!input || typeof input !== 'object') return
        const record = input as Record<string, unknown>
        if (typeof record.path === 'string') out.add(record.path)
        const operation = record.operation
        if (
          operation &&
          typeof operation === 'object' &&
          typeof (operation as Record<string, unknown>).path === 'string'
        ) {
          out.add((operation as Record<string, string>).path)
        }
        const edits = record.edits
        if (Array.isArray(edits)) {
          for (const edit of edits) {
            if (
              edit &&
              typeof edit === 'object' &&
              typeof (edit as Record<string, unknown>).path === 'string'
            ) {
              out.add((edit as Record<string, string>).path)
            }
          }
        }
      }

      function visit(value: unknown, out: Set<string>): void {
        if (!value) return
        if (Array.isArray(value)) {
          for (const item of value) visit(item, out)
          return
        }
        if (typeof value !== 'object') return

        const record = value as Record<string, unknown>
        if (record.type === 'json' && 'value' in record) {
          visit(record.value, out)
        }
        if (hasEditArtifact(record)) {
          for (const action of record.actions as Array<
            Record<string, unknown>
          >) {
            const applied =
              !!action &&
              typeof action === 'object' &&
              typeof action.path === 'string' &&
              action.path.length > 0 &&
              (action.outcome === 'applied' ||
                action.status === 'committed' ||
                action.outcome === 'committed')
            if (!applied) continue
            if (typeof action.path === 'string') out.add(action.path)
            if (
              action.action === 'move' &&
              typeof action.destinationPath === 'string'
            ) {
              out.add(action.destinationPath)
            }
          }
        }
        for (const nested of Object.values(record)) {
          visit(nested, out)
        }
      }

      function buildTargetFileProgress(
        targetFiles: string[],
        changedFiles: string[],
      ):
        | {
            targetFiles: string[]
            changedTargetFiles: string[]
            pendingTargetFiles: string[]
          }
        | undefined {
        if (targetFiles.length === 0) return undefined
        const changedFileSet = new Set(changedFiles.map(normalizeFilePath))
        const changedTargetFiles = targetFiles.filter((file) =>
          changedFileSet.has(normalizeFilePath(file)),
        )
        const pendingTargetFiles = targetFiles.filter(
          (file) => !changedFileSet.has(normalizeFilePath(file)),
        )
        return { targetFiles, changedTargetFiles, pendingTargetFiles }
      }

      function extractTargetFiles(
        prompt: unknown,
        initialMessageHistory: unknown[],
      ): string[] {
        const texts: string[] = []
        collectText(prompt, texts)
        collectText(initialMessageHistory, texts)
        const files = new Set<string>()
        for (const text of texts) {
          collectTargetFilesFromText(text, files)
        }
        return [...files]
      }

      function collectTargetFilesFromText(
        text: string,
        files: Set<string>,
      ): void {
        const targetFilesSection = text.match(
          /(?:^|\n)\s*(?:#{1,4}\s+)?Target files?\s*:?\s*\n([\s\S]*?)(?=\n\s*(?:#{1,4}\s+\S|\S[^\n]*:)|$)/i,
        )
        if (targetFilesSection) {
          for (const line of targetFilesSection[1].split(/\r?\n/)) {
            const match = line.match(
              /(?:^|[-*]\s+)(`?)([^`\s]+\.[A-Za-z][\w.-]*)\1/,
            )
            if (match) addTargetFile(match[2], files)
          }
        }
        for (const match of text.matchAll(/`([^`]+\.[A-Za-z][\w.-]*)`/g)) {
          addTargetFile(match[1], files)
        }
      }

      function addTargetFile(file: string, files: Set<string>): void {
        const normalized = normalizeFilePath(file)
        if (normalized) files.add(normalized)
      }

      function normalizeFilePath(file: string): string {
        let normalized = file.trim().replace(/\\/g, '/')
        if (!normalized) return ''
        if (normalized.startsWith('file://')) {
          normalized = normalized.slice('file://'.length)
        }
        while (normalized.startsWith('./')) {
          normalized = normalized.slice(2)
        }
        return normalized.replace(/[),.;:]+$/, '')
      }

      function collectText(value: unknown, texts: string[]): void {
        if (typeof value === 'string') {
          texts.push(value)
          return
        }
        if (!value) return
        if (Array.isArray(value)) {
          for (const item of value) collectText(item, texts)
          return
        }
        if (typeof value !== 'object') return
        const record = value as Record<string, unknown>
        collectText(record.text, texts)
        collectText(record.content, texts)
        collectText(record.prompt, texts)
      }
    },
  } satisfies Omit<AgentDefinition, 'id'>
}

const definition = {
  ...createCodeEditor({ model: 'opus' }),
  id: 'editor',
}
export default definition
