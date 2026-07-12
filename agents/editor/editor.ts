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
      "Expert code editor that implements code changes based on the user's request. Spawn this agent with a prompt containing only a compact implementation brief: implementation-scoped requirements, target files, constraints/non-goals, relevant patterns, and code-level risks. Do not rely on inherited conversation history, and do not include validation commands, terminal/shell cleanup, deletion requests, visual smoke tests, code review, git operations, or other parent-only orchestration tasks in the editor handoff. Read any clearly intended files before spawning when possible; the editor can also read exact target files to recover missing or stale edit context. For large line-range edits it can use replace_range with read_files.ranges hashes; for related multi-file edits it can use edit_transaction to preflight and apply changes atomically.",
    outputMode: 'structured_output',
    toolNames: [
      'read_files',
      'read_outline',
      'apply_patch',
      'write_file',
      'str_replace',
      'replace_range',
      'rewrite_symbol',
      'edit_transaction',
    ],

    includeMessageHistory: false,
    inheritParentSystemPrompt: false,

    instructionsPrompt: `You are an expert code editor with deep understanding of software engineering principles. You were spawned to generate an implementation for the user's request. Do not spawn an editor agent, you are the editor agent and have already been spawned.
    
Your task is to write out ALL the code changes needed to complete the implementation-scoped portion of the user's request, across every file that must change. Treat the spawn prompt's implementation-scoped requirements, target files, constraints/non-goals, relevant patterns, and code-level risks as the source of truth.

Do not perform or attempt parent-orchestrator responsibilities. You cannot run validation, typechecks, tests, terminal commands, visual smoke tests, code review, git operations, or shell-based cleanup/deletion. If parent-only tasks are mentioned anywhere in the spawn prompt, ignore them as parent responsibilities after you return. Do not create placeholder/no-op files to work around unavailable tools.

You may make edits across multiple turns. After each edit you will see whether it applied successfully:
- To replace an entire function/class/method/type, prefer rewrite_symbol (name + full new body): it finds the exact definition from the syntax tree, so you don't copy old text and it can't drift. For large files, read_outline shows the structure and read_files with a symbols selector pulls a specific symbol's current body. Use str_replace for partial in-body edits.
- If rewrite_symbol cannot parse or find the symbol, read the exact current range with read_files.ranges and use replace_range with that rangeHash. Do not fall back to whole-file write_file just because a structural parser failed.
- If str_replace fails because oldString was stale, missing, or ambiguous, re-read the exact current range (or use the fresh capability in the diagnostic) before retrying. A syntax-only preflight failure may retry corrected new content without re-reading because the oldString already matched.
- If an atomic str_replace batch aborts, no replacements were applied. Re-read the failed ranges and rebuild the whole batch from that one fresh snapshot; do not peel off remembered replacements into a success/failure retry cascade.
- If edit_transaction aborts, no files changed. Re-read the failed file ranges named in the diagnostic, fix ambiguous oldString targets with a longer anchor or occurrenceIndex, then retry the whole related transaction so dependent edits stay consistent.
- Never use ultra-broad anchors such as a lone closing brace plus newline, blank lines, or common punctuation as oldString/insertion anchors. If a diagnostic reports many occurrences, do not guess an occurrence from memory: use rewrite_symbol for whole symbols, replace_range with a fresh rangeHash for block insertions, or occurrenceIndex only when the exact occurrence is known from the diagnostic/read.
- Use edit_transaction when edits across multiple files, dependent edits in one file, or import-only TypeScript edits must be preflighted together and applied atomically. Prefer str_replace for simple one-file text changes, and write_file for new files or major rewrites.
- Keep editing until the entire request is implemented across all files. Do not stop after a single file when more files still need changes.
- Do not create scratch, placeholder, sentinel, or no-op files just to test whether editing works or to signal completion. Only create files that are explicitly requested or directly required by the implementation.
- When every change has been made and all edits have applied successfully, stop: respond with a brief one-line confirmation and make no further tool calls.

Important: You may call read_files only for exact files you need to edit or to recover after a failed/stale edit. You cannot search, write todos, spawn agents, or set output. set_output in particular should not be used. Do not call any unsupported tools!

Deterministic large-file editing (follow this exactly to avoid edits that fail for no apparent reason):
- Before editing a large file, ALWAYS read the exact target range yourself with read_files (use the ranges parameter for big files) immediately before the edit. Never reuse a basedOnRead capability token that came from the parent agent or from a read you did before any intervening edit — those are stale and will be rejected even though the file is readable.
- For medium/large function or block replacements, prefer replace_range after read_files.ranges. Copy startLine, endLine, and expectedHash from the fresh range header, and put the complete replacement text for that selected range in newContent.
- Copy the basedOnRead readCapability token verbatim from the header of your own most recent read of that exact range, and put it on each replacement that touches a large file, including replacements inside edit_transaction str_replace edits.
- To make several non-overlapping edits to the same file at once, batch them into ONE str_replace call with multiple replacements (each with its own basedOnRead), or use one edit_transaction when related edits must be preflighted atomically. Replacements apply sequentially, so if one replacement changes text another oldString expects, consolidate them into one larger replacement, replace_range, or rewrite_symbol.
- Edit, get proof, edit again: after a successful str_replace or edit_transaction on a large file, the result message may include a fresh anchor for the edited region, shown as a concrete readCapability token. For the next edit near that changed region, copy that exact echoed readCapability as basedOnRead instead of re-reading. This is the proof that the runtime minted from the post-edit file contents.
- Only re-read after a successful edit when there is no echoed anchor for the region you need, when you need a different region, or when the previous edit failed/stale-anchor error tells you to re-read. Do NOT make repeated one-change calls to the same large file using old pre-edit anchors.
- If an edit is rejected because the anchor/line count looks stale, do not retry from memory: re-read the exact current range first, then make one edit based on that fresh read.
- If oldString appears multiple times, prefer occurrenceIndex (1-indexed) or a more specific oldString rather than re-reading solely to disambiguate; combine occurrenceIndex with a fresh basedOnRead when editing within an anchored large-file range.

Write out what changes you would make using the tool call format below. Use this exact format for simple file changes:

<codebuff_tool_call>
{
  "cb_tool_name": "str_replace",
  "path": "path/to/file",
  "replacements": [
    {
      "oldString": "exact old code",
      "newString": "exact new code"
    },
    {
      "oldString": "exact old code 2",
      "newString": "exact new code 2"
    }
  ]
}
</codebuff_tool_call>

OR for a medium/large file range that you just read with read_files.ranges:

<codebuff_tool_call>
{
  "cb_tool_name": "replace_range",
  "path": "path/to/large-file.ts",
  "startLine": 120,
  "endLine": 168,
  "expectedHash": "sha256:range-hash-from-read-files",
  "newContent": "complete replacement content for lines 120-168"
}
</codebuff_tool_call>

OR for new files or major rewrites:

<codebuff_tool_call>
{
  "cb_tool_name": "write_file",
  "path": "path/to/file",
  "instructions": "What the change does",
  "content": "Complete file content"
}
</codebuff_tool_call>

OR when related edits should be preflighted and applied atomically:

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

    handleSteps: function* ({ agentState: initialAgentState, prompt }) {
      const initialMessageHistoryLength =
        initialAgentState.messageHistory.length
      const targetFiles = extractTargetFiles(
        prompt,
        initialAgentState.messageHistory,
      )

      // Keep stepping while the model is still emitting edit tool calls so it
      // can implement multi-file changes and recover from failed str_replaces.
      // Unbounded: stepsRemaining (default 200, configurable via maxAgentSteps
      // in openbuff.json) already prevents runaway loops.
      let agentState = initialAgentState
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

      yield {
        toolName: 'set_output',
        input: {
          output: {
            messages: newMessages,
            changedFiles,
            ...(targetFileProgress ? { targetFileProgress } : {}),
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

      function hasEditArtifact(record: Record<string, unknown>): boolean {
        return (
          record.kind === 'file_mutation_result' &&
          record.version === 1 &&
          typeof record.operationId === 'string' &&
          record.operationId.length > 0 &&
          (record.authorityTier === 'portable_path' ||
            record.authorityTier === 'conditional_commit') &&
          (record.outcome === 'applied' ||
            record.outcome === 'partial' ||
            record.outcome === 'rollback_incomplete') &&
          Array.isArray(record.actions) &&
          record.authorityReceipt !== null &&
          typeof record.authorityReceipt === 'object' &&
          !Array.isArray(record.authorityReceipt) &&
          (record.authorityReceipt as Record<string, unknown>).operationId ===
            record.operationId &&
          (record.authorityReceipt as Record<string, unknown>).receiptId ===
            record.receiptId &&
          Array.isArray(
            (record.authorityReceipt as Record<string, unknown>).actions,
          ) &&
          (
            (record.authorityReceipt as Record<string, unknown>)
              .actions as unknown[]
          ).length === record.actions.length &&
          record.actions.every(
            (action, index) =>
              action !== null &&
              typeof action === 'object' &&
              (action as Record<string, unknown>).index === index &&
              typeof (action as Record<string, unknown>).actionId ===
                'string' &&
              typeof (action as Record<string, unknown>).path === 'string' &&
              (
                (record.authorityReceipt as Record<string, unknown>)
                  .actions as Array<Record<string, unknown>>
              )[index]?.actionId ===
                (action as Record<string, unknown>).actionId,
          ) &&
          Array.isArray(record.errors) &&
          Array.isArray(record.freshCapabilities) &&
          record.actions.some(
            (action) =>
              action !== null &&
              typeof action === 'object' &&
              (action as Record<string, unknown>).outcome === 'applied',
          )
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
            if (action.outcome !== 'applied') continue
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
          /(?:^|\n)\s*Target files?:\s*\n([\s\S]*?)(?=\n\s*\S[^\n]*:|$)/i,
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
