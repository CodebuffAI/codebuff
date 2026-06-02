import { publisher } from '../../constants'

import type {
  AllToolNames,
  SecretAgentDefinition,
} from '../../types/secret-agent-definition'

export const createBestOfNImplementor = (options: {
  model: 'sonnet' | 'opus' | 'gpt-5' | 'gemini'
  allowReadOnlyTools?: boolean
}): Omit<SecretAgentDefinition, 'id'> => {
  const { model, allowReadOnlyTools = true } = options
  const isSonnet = model === 'sonnet'
  const isOpus = model === 'opus'
  const isGpt5 = model === 'gpt-5'
  const isGemini = model === 'gemini'
  const readOnlyToolNames: AllToolNames[] = [
    'read_files',
    'read_proposal_workspace',
    'code_search',
    'glob',
    'list_directory',
  ]
  const proposalToolNames: AllToolNames[] = [
    'propose_write_file',
    'propose_str_replace',
    'propose_edit_transaction',
  ]
  const toolNames: AllToolNames[] = [
    ...(allowReadOnlyTools ? readOnlyToolNames : []),
    ...proposalToolNames,
  ]

  return {
    publisher,
    model: isSonnet
      ? 'anthropic/claude-sonnet-4.5'
      : isOpus
        ? 'anthropic/claude-opus-4.7'
        : isGemini
          ? 'google/gemini-3-pro-preview'
          : 'openai/gpt-5.5',
    ...(isGpt5 && {
      reasoningOptions: {
        effort: 'low',
      },
    }),
    displayName: 'Implementation Generator',
    spawnerPrompt:
      'Generates a complete implementation using propose_* tools that draft changes without applying them',

    includeMessageHistory: false,
    inheritParentSystemPrompt: false,
    systemPrompt: allowReadOnlyTools
      ? `You are a strict implementation proposal generator.

You may use read_files, code_search, glob, and list_directory only to gather exact current context.
After you have proposed any edit to a file, use read_proposal_workspace (NOT read_files) to re-read that file: it returns your own proposed changes for files you already edited, and the real disk content only for files you have not touched yet. This is how you avoid recreating edits you already made.
You draft edits only with propose_str_replace and propose_write_file.
Never call write_file, str_replace, spawn_agents, set_output, or any other mutating/control tool.
If the supplied prompt already includes enough exact file content, propose the edits immediately. If the task is complex, multi-file, or exact oldString values are uncertain, first inspect with read-only tools, then emit complete propose_* tool calls. Prefer propose_write_file with complete updated file content when exact replacements would be brittle.
For large-file propose_str_replace work, determinism matters: read the exact current target ranges yourself immediately before proposing edits, never reuse parent/old readCapability tokens in narration, and bundle all replacements for the same file into one propose_str_replace call so the parent can validate/apply them against one pre-edit file state.`
      : `You are a strict implementation proposal generator.

You do not have repository exploration tools in this phase because the parent only uses this mode after supplying exact current file context.
Use the supplied proposalContext/current file context and draft edits only with propose_str_replace and propose_write_file.
Never call read_files, code_search, glob, list_directory, write_file, str_replace, spawn_agents, set_output, or any other mutating/control tool.
Emit complete propose_* tool calls immediately. If exact replacement text is not available, prefer propose_write_file with complete file content from the supplied context over guessing stale oldString values. If the supplied context is insufficient for an existing-file edit, emit no proposal call rather than fabricating paths or oldString values.`,

    toolNames,
    spawnableAgents: [],

    inputSchema: {},
    outputMode: 'structured_output',

    instructionsPrompt: `You are an expert code editor with deep understanding of software engineering principles. You were spawned to generate an implementation for the user's request.
    
Your task is to write out ALL the code changes needed to complete the user's request.

IMPORTANT: Your response must progress toward at least one propose_str_replace or propose_write_file tool call. Use those tools to draft edits without actually applying them - they will be reviewed first. ${
      allowReadOnlyTools
        ? 'You may first use read_files, code_search, glob, or list_directory when exact current context is missing.'
        : 'You do not have read-only tools here; use the supplied proposalContext/current file context and emit proposal tool calls immediately only when that context is sufficient.'
    } DO NOT use any mutating/control tools such as write_file, str_replace, spawn_agents, or set_output. Use your reasoning internally, keep visible narration short, and emit all needed proposal tool calls as soon as you have enough context. For existing-file edits, never guess stale oldString values; use propose_write_file when full file content is available, or withhold the proposal if context is insufficient.

For multi-file implementations, return a complete proposal bundle. Use multiple propose_* tool calls when needed, one per file or one propose_str_replace with multiple replacements for the same file. Do not stop after the first file if the requested implementation needs additional files.
After you have emitted every required proposal tool call, write the exact marker PROPOSAL_BUNDLE_COMPLETE. If you cannot finish, do not write that marker.
The proposal collector tracks progress and completion, so emit all known file edits in the same response whenever possible instead of adding one file per turn indefinitely.

Deterministic large-file proposal rules:
- If you need to edit a large file, use read_files.ranges to read the exact current region yourself immediately before emitting the propose_str_replace. Do not rely on parent-provided snippets, old conversation reads, or copied basedOnRead tokens from another agent.
- Do not include basedOnRead tokens in explanatory prose. If the proposal tool supports basedOnRead, copy only the fresh token from your own latest read into the replacement object; otherwise emit exact oldString/newString only and let the parent re-anchor during application.
- Batch all replacements for the same file into one propose_str_replace call. Do not emit repeated one-change calls to the same large file; a successful earlier edit changes the file and makes later anchors/stale oldStrings fail.
- After any proposal failure for a file, re-read the exact current range before proposing the repair. Never retry from memory.

When using text/XML tool calling, every proposal must be a valid JSON object inside <codebuff_tool_call>...</codebuff_tool_call>. Do not wrap the JSON in markdown fences. Do not use trailing commas.

You can make multiple tool calls across multiple steps to complete the implementation. Only the file changes will be passed on, so you can say whatever you want to help you think. Do not write any final summary as that would be a waste of tokens because no one is reading it.
<codebuff_tool_call>
{
  "cb_tool_name": "propose_str_replace",
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

OR for new files or major rewrites:

<codebuff_tool_call>
{
  "cb_tool_name": "propose_write_file",
  "path": "path/to/file",
  "instructions": "What the change does",
  "content": "Complete file content"
}
</codebuff_tool_call>
${
  isGpt5 || isGemini
    ? ``
    : `
IMPORTANT: Before you start writing your implementation, you should use <think> tags to think about the best way to implement the changes. You should think really really hard to make sure you implement the changes in the best way possible. Take as much time as you to think through all the cases to produce the best changes.

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
}

After the edit tool calls, write PROPOSAL_BUNDLE_COMPLETE only if the proposal covers every requested change. You can optionally mention any follow-up steps to take, like deleting a file, or a specific way to validate the changes. There's no need to use the set_output tool as your entire response will be included in the output.

Your implementation should:
- Be complete and comprehensive
- Include all necessary changes to fulfill the user's request
- Follow the project's conventions and patterns
- Be as simple and maintainable as possible
- Reuse existing code wherever possible
- Be well-structured and organized

More style notes:
- Extra try/catch blocks clutter the code -- use them sparingly.
- Optional arguments are code smell and worse than required arguments.
- New components often should be added to a new file, not added to an existing file.

Write out your complete implementation now. Do not write any final summary.`,

    handleSteps: function* ({ agentState: initialAgentState, params }) {
      const canUseReadOnlyTools = getCanUseReadOnlyTools({
        params,
        agentState: initialAgentState,
      })

      let agentState = initialAgentState
      let readOnlyOnlySteps = 0
      let stopReason:
        | 'cleanProposal'
        | 'bundleCap'
        | 'stepBudget'
        | 'noCompletionSignal'
        | 'noProposal'
        | undefined
      const proposalBudget = getAdaptiveProposalBudget({
        params,
        messageHistory: initialAgentState.messageHistory,
      })
      const { maxProposalSteps, maxReadOnlyOnlySteps, maxBundleProposalTurns } =
        proposalBudget
      const collectProposalBundle = shouldCollectProposalBundle(params)
      let lastProposalSignalCount = 0
      let bundleProposalTurns = 0
      let completedProposalSteps = 0

      for (let step = 0; step < maxProposalSteps; step++) {
        const result = yield 'STEP'
        completedProposalSteps = step + 1
        agentState = result.agentState

        // Source of truth: the runtime-recorded ledger for the CURRENT attempt.
        // No message-history scanning, no accumulators, no dedup/sanitize stack.
        const summary = summarizeLedger(getLedgerArtifacts(agentState))
        const latestProposalToolCalls = summary.toolCalls
        const proposalToolResults = summary.toolResults
        const hasSuccessfulProposalToolResult = summary.successfulCount > 0
        const hasFailedProposalToolResult = summary.failedOnlyCount > 0

        // Mixed result: real diffs were produced AND some file failed outright.
        // Preserve the captured successful bundle and let the parent run its
        // normal completion/repair path rather than feeding a retry that could
        // erase or duplicate the good work.
        if (hasSuccessfulProposalToolResult && hasFailedProposalToolResult) {
          stopReason = 'noCompletionSignal'
          break
        }

        if (hasSuccessfulProposalToolResult && !hasFailedProposalToolResult) {
          const proposalSignalCount =
            latestProposalToolCalls.length + proposalToolResults.length
          if (
            shouldStopAfterProposalSignal({
              proposalSignalCount,
              step,
              proposedFileCount: summary.proposedFiles.length,
              hasAnyProposal: summary.successfulCount > 0,
              completionSignalSeen: hasProposalCompletionSignal(
                agentState.messageHistory ?? [],
              ),
              stepsComplete: result.stepsComplete === true,
              hasReadOnlyActivityThisStep: hasCurrentReadOnlyToolResult(
                result.toolResult,
              ),
            })
          ) {
            break
          }
          readOnlyOnlySteps = 0
          continue
        }

        if (step === maxProposalSteps - 1) {
          stopReason = 'stepBudget'
          break
        }

        // Read-only exploration is allowed so weaker/OpenAI-compatible proposal
        // models can recover from context starvation. If this step only
        // gathered context (no proposal artifacts at all), let the model take
        // another normal step instead of injecting a "you failed" retry.
        if (
          canUseReadOnlyTools &&
          !hasSuccessfulProposalToolResult &&
          !hasFailedProposalToolResult &&
          summary.toolResults.length === 0 &&
          hasReadOnlyToolActivity(
            agentState.messageHistory ?? [],
            result.toolResult,
          )
        ) {
          readOnlyOnlySteps++
          if (readOnlyOnlySteps > maxReadOnlyOnlySteps) {
            stopReason = 'noProposal'
            break
          }
          if (readOnlyOnlySteps === maxReadOnlyOnlySteps) {
            // PROPOSAL_RETRY resets the ledger attempt at the runtime layer, so
            // stale failed artifacts can never leak into the next attempt.
            yield buildProposalRetryToolCall({
              messageHistory: agentState.messageHistory ?? [],
              text: buildStopExploringPrompt(),
            })
          }
          continue
        }
        readOnlyOnlySteps = 0

        // Pure failure (no usable diff anywhere): retry. The runtime starts a
        // fresh ledger attempt when it applies this PROPOSAL_RETRY message.
        yield buildProposalRetryToolCall({
          messageHistory: agentState.messageHistory ?? [],
          text: buildProposalRetryPrompt(proposalToolResults),
        })
      }

      const finalSummary = summarizeLedger(getLedgerArtifacts(agentState))
      const toolCalls = finalSummary.toolCalls
      const toolResults = finalSummary.toolResults
      const unifiedDiffs = finalSummary.unifiedDiffs

      const finalStopReason =
        stopReason ??
        (finalSummary.failedOnlyCount > 0 &&
        (toolCalls.length > 0 || unifiedDiffs.length > 0)
          ? 'noCompletionSignal'
          : undefined) ??
        inferProposalStopReason({
          toolCalls,
          summary: finalSummary,
          unifiedDiffs,
          messageHistory: agentState.messageHistory ?? [],
        })

      yield {
        toolName: 'set_output',
        input: {
          toolCalls,
          toolResults,
          unifiedDiffs,
          readOnlyContext: buildReadOnlyContextFromMessages(
            agentState.messageHistory ?? [],
          ),
          proposalBudget,
          proposalProgress: buildProposalProgressTelemetry({
            messageHistory: agentState.messageHistory ?? [],
            summary: finalSummary,
            stopReason: finalStopReason,
            stepsTaken: completedProposalSteps,
          }),
          stopReason: finalStopReason,
          ...(toolCalls.length === 0 && !unifiedDiffs
            ? {
                errorMessage: buildNoProposalErrorMessage(
                  agentState.messageHistory ?? [],
                ),
              }
            : {}),
        },
        includeToolCall: false,
      }

      // ====================================================================
      // Deterministic ledger access — the single source of proposal artifacts.
      // ====================================================================

      function getLedgerArtifacts(state: any): LedgerArtifact[] {
        const ledger = state?.proposalLedger
        return Array.isArray(ledger) ? (ledger as LedgerArtifact[]) : []
      }

      // Collapse multiple successful edits to the SAME file into the minimal
      // deterministic set the parent can apply against disk, regardless of how
      // many calls or files the attempt produced. When artifacts carry
      // finalContent and are independent of a transaction, the last successful
      // artifact for that file is the resolved proposed-content overlay state,
      // so applying earlier intermediate edits is unnecessary and can
      // reintroduce anchor staleness. Files touched by propose_edit_transaction
      // keep their ordered artifacts so the transaction fallback and any later
      // same-file edits replay consistently.
      function reconcileSuccessfulArtifactsByFile(
        successfulInOrder: LedgerArtifact[],
      ): LedgerArtifact[] {
        const transactionTouchedFiles = new Set(
          successfulInOrder
            .filter((artifact) => artifact.toolName === 'propose_edit_transaction')
            .map((artifact) => artifact.result.file)
            .filter(Boolean),
        )
        const keptByFile = new Map<string, LedgerArtifact[]>()
        for (const artifact of successfulInOrder) {
          const file = artifact.result.file
          if (!file) continue
          if (
            typeof artifact.result.finalContent === 'string' &&
            !transactionTouchedFiles.has(file)
          ) {
            keptByFile.set(file, [artifact])
            continue
          }
          if (artifact.toolName === 'propose_write_file') {
            if (transactionTouchedFiles.has(file)) {
              const existing = keptByFile.get(file)
              const artifactForOrderedReplay = stripProposalFinalContentMetadata(artifact)
              if (existing) {
                existing.push(artifactForOrderedReplay)
              } else {
                keptByFile.set(file, [artifactForOrderedReplay])
              }
            } else {
              // Full rewrite resets this file's accumulated legacy edits.
              keptByFile.set(file, [artifact])
            }
            continue
          }
          const existing = keptByFile.get(file)
          if (existing) {
            existing.push(artifact)
          } else {
            keptByFile.set(file, [artifact])
          }
        }
        // Preserve first-seen file order, then per-file edit order.
        const seen = new Set<string>()
        const ordered: LedgerArtifact[] = []
        for (const artifact of successfulInOrder) {
          const file = artifact.result.file
          if (!file || seen.has(file)) continue
          seen.add(file)
          ordered.push(...(keptByFile.get(file) ?? []))
        }
        return ordered
      }

      function stripProposalFinalContentMetadata(
        artifact: LedgerArtifact,
      ): LedgerArtifact {
        if (typeof artifact.result.finalContent !== 'string') return artifact
        const { finalContent: _finalContent, ...result } = artifact.result
        return { ...artifact, result }
      }

      function summarizeLedger(ledger: LedgerArtifact[]): LedgerSummary {
        const successful = reconcileSuccessfulArtifactsByFile(
          ledger.filter(isSuccessfulArtifact),
        )
        const successfulFiles = new Set(
          successful.map((artifact) => artifact.result.file).filter(Boolean),
        )

        // A failed artifact only counts as a real failure when no later success
        // covered the same file in this attempt (the model fixed it itself).
        const failedOnly = ledger.filter(
          (artifact) =>
            !isSuccessfulArtifact(artifact) &&
            !(
              artifact.result.file &&
              successfulFiles.has(artifact.result.file)
            ),
        )

        // propose_edit_transaction records ONE ledger artifact per changed
        // file, each carrying the SAME full transaction input. The parent
        // applies one real edit_transaction per tool call, so emitting one tool
        // call per file would re-apply the same transaction N times — the first
        // applies cleanly and the rest fail against the already-changed files
        // (diffs appear generated, then lost, while the proposal still
        // completes). Collapse duplicate transaction artifacts to one apply
        // tool call. str_replace/write_file artifacts are intentionally NOT
        // deduped: per-file str_replace edits chain in order and each is a
        // distinct apply step.
        const toolCalls = dedupeTransactionToolCalls(
          successful.map((artifact) => ({
            toolName: artifact.toolName,
            input: buildApplyableProposalInput(artifact),
          })),
        )

        // Drop failures on files that ultimately succeeded; keep genuine
        // failures as telemetry for the parent's completion/repair path.
        const toolResults = ledger
          .filter(
            (artifact) =>
              isSuccessfulArtifact(artifact) ||
              !(
                artifact.result.file &&
                successfulFiles.has(artifact.result.file)
              ),
          )
          .map(toToolResult)

        const unifiedDiffs = successful
          .map(
            (artifact) =>
              `--- ${artifact.result.file} ---\n${artifact.result.unifiedDiff}`,
          )
          .join('\n\n')

        const proposedFiles = [
          ...new Set(
            [...successful, ...failedOnly]
              .map((artifact) => artifact.result.file)
              .filter(Boolean),
          ),
        ]

        return {
          toolCalls,
          toolResults,
          unifiedDiffs,
          successfulCount: successful.length,
          failedOnlyCount: failedOnly.length,
          proposedFiles,
        }
      }

      function isSuccessfulArtifact(artifact: LedgerArtifact): boolean {
        return (
          artifact?.result?.ok === true &&
          typeof artifact.result.unifiedDiff === 'string' &&
          artifact.result.unifiedDiff.trim().length > 0
        )
      }

      function buildApplyableProposalInput(artifact: LedgerArtifact): any {
        const result = artifact.result
        return {
          ...artifact.input,
          ...(result.file ? { __proposalFile: result.file } : {}),
          ...(typeof result.finalContent === 'string'
            ? { __proposalFinalContent: result.finalContent }
            : {}),
          ...('baseContentHash' in result
            ? { __proposalBaseContentHash: result.baseContentHash ?? null }
            : {}),
          ...('baseContent' in result
            ? { __proposalBaseContent: result.baseContent ?? null }
            : {}),
        }
      }

      function toToolResult(artifact: LedgerArtifact): any {
        const { file, unifiedDiff, message, errorMessage } = artifact.result
        return {
          file,
          ...(unifiedDiff ? { unifiedDiff } : {}),
          ...(message ? { message } : {}),
          ...(errorMessage ? { errorMessage } : {}),
        }
      }

      // Collapse the per-file duplicates a single propose_edit_transaction
      // records (one ledger artifact per changed file, all sharing the same
      // transaction input) down to one apply tool call per unique transaction,
      // preserving first-seen order. propose_str_replace/propose_write_file
      // calls are passed through untouched because their per-file ordering is
      // load-bearing for sequential apply.
      function dedupeTransactionToolCalls(
        toolCalls: { toolName: string; input: any }[],
      ): { toolName: string; input: any }[] {
        const seenTransactionSignatures = new Set<string>()
        const deduped: { toolName: string; input: any }[] = []
        for (const toolCall of toolCalls) {
          if (toolCall.toolName !== 'propose_edit_transaction') {
            deduped.push(toolCall)
            continue
          }
          let signature: string
          try {
            signature = JSON.stringify(sanitizeProposalMetadata(toolCall.input))
          } catch {
            // Non-serializable input can't be safely deduped; keep it as-is.
            deduped.push(toolCall)
            continue
          }
          if (seenTransactionSignatures.has(signature)) continue
          seenTransactionSignatures.add(signature)
          deduped.push(toolCall)
        }
        return deduped
      }

      function sanitizeProposalMetadata(input: any): any {
        if (!input || typeof input !== 'object' || Array.isArray(input)) {
          return input
        }
        const {
          __proposalFile: _proposalFile,
          __proposalFinalContent: _finalContent,
          __proposalBaseContentHash: _baseContentHash,
          __proposalBaseContent: _baseContent,
          ...rest
        } = input
        return rest
      }

      // ====================================================================
      // Stop / coverage policy (decides WHEN to stop; never WHAT survives).
      // ====================================================================

      function getAdaptiveProposalBudget(params: {
        params: Record<string, any> | undefined
        messageHistory: any[]
      }): {
        maxProposalSteps: number
        maxReadOnlyOnlySteps: number
        maxBundleProposalTurns: number
        expectedTouchedFileCount: number
        hasExplicitExpectedTouchedFileCount: boolean
        expectsMultipleFiles: boolean
        complexity: 'simple' | 'standard' | 'complex'
        hasPrefetchedContext: boolean
        evidence: string[]
      } {
        const text = collectBudgetText(params.params, params.messageHistory)
        const taskText = collectBudgetTaskText(
          params.params,
          params.messageHistory,
        )
        const hasPrefetchedContext = hasProposalPrefetchedContext(text)
        const evidence: string[] = []

        const explicitTaskFilePathCount = countUniqueMatches(
          taskText,
          getFilePathPattern(),
        )
        const explicitBareTaskFileNameCount =
          countLikelyBareFileNames(taskText)
        const numericTouchedFileCount =
          inferExpectedTouchedFileCountFromText(taskText)
        const contextFileHeaderCount = countContextFileHeaders(text)
        // The parent (editor-multi-prompt) computes an authoritative
        // orchestrationPlan.expectedTouchedFileCount and passes it through as an
        // explicit param. Honor it as a FLOOR over the fragile text-regex
        // inference, which under-counts paths the implementor's own prompt does
        // not spell out (e.g. leading-dot directories like .codebuff-smoke/...).
        const explicitParamFileCount = coerceExplicitFileCount(
          params.params?.expectedTouchedFileCount,
        )
        const regexDerivedFilePathCount = Math.max(
          numericTouchedFileCount,
          explicitTaskFilePathCount,
          explicitBareTaskFileNameCount,
        )
        const explicitFilePathCount = Math.min(
          20,
          Math.max(regexDerivedFilePathCount, explicitParamFileCount),
        )
        const expectedTouchedFileCount = Math.min(20, explicitFilePathCount)
        if (
          explicitParamFileCount > regexDerivedFilePathCount &&
          explicitParamFileCount > 1
        ) {
          evidence.push(`paramFileCount:${explicitParamFileCount}`)
        }
        if (numericTouchedFileCount > 1) {
          evidence.push(`numericFileCount:${numericTouchedFileCount}`)
        }
        if (explicitFilePathCount > 1) {
          evidence.push(`filePaths:${explicitFilePathCount}`)
        }
        if (explicitBareTaskFileNameCount > 1) {
          evidence.push(`bareTaskFiles:${explicitBareTaskFileNameCount}`)
        }
        if (contextFileHeaderCount > 1) {
          evidence.push(`contextFiles:${Math.min(contextFileHeaderCount, 12)}`)
        }

        const hasExplicitMultiFileParam =
          coerceExplicitBoolean(params.params?.expectsMultipleFiles) ||
          explicitParamFileCount > 1
        const hasExplicitMultiFileSignal =
          hasExplicitMultiFileParam ||
          numericTouchedFileCount > 1 ||
          /\b(multi[- ]file|multiple files|cross[- ]file|several files|many files|few files|multiple pages|several pages|many pages|few pages|multiple screens|several screens)\b/i.test(
            taskText,
          )

        const complexSignals = [
          /\b(multi[- ]file|multiple files|cross[- ]file|several files|many files|few files|multiple pages|several pages|many pages|few pages|multiple screens|several screens)\b/i,
          /\b(create|add|wire|integrate|refactor|implement)\b/i,
          /\b(component|screen|overlay|command|registry|schema|provider|routing|test|tests)\b/i,
          /\bphase\s+\d+\b/i,
          /\bfull[- ]screen\b/i,
        ].filter((pattern) => pattern.test(text)).length

        if (complexSignals > 0) {
          evidence.push(`complexSignals:${complexSignals}`)
        }
        if (hasPrefetchedContext) {
          evidence.push('prefetchedContext')
        }

        const simpleTask =
          text.length < 4_000 &&
          explicitFilePathCount <= 1 &&
          complexSignals <= 1 &&
          /\b(replace|rename|typo|one[- ]line|minimal exact|small exact|change .* to )\b/i.test(
            text,
          )

        const complexMultiFileTask =
          explicitFilePathCount > 1 ||
          complexSignals >= 3 ||
          text.length > 8_000

        const baseMaxProposalSteps = simpleTask
          ? 6
          : hasPrefetchedContext
            ? 10
            : complexMultiFileTask
              ? 14
              : 10
        const complexity = simpleTask
          ? 'simple'
          : complexMultiFileTask
            ? 'complex'
            : 'standard'
        const maxBundleProposalTurns = shouldCollectProposalBundle(
          params.params,
        )
          ? getMaxBundleProposalTurns({
              params: params.params,
              complexity,
              hasPrefetchedContext,
              expectedTouchedFileCount,
            })
          : 0
        const maxProposalSteps = Math.max(
          baseMaxProposalSteps,
          maxBundleProposalTurns + (canUseReadOnlyTools ? 4 : 2),
        )
        const expectsMultipleFiles =
          explicitFilePathCount > 1 || hasExplicitMultiFileSignal

        return {
          maxProposalSteps,
          maxReadOnlyOnlySteps: canUseReadOnlyTools ? 3 : 0,
          maxBundleProposalTurns,
          expectedTouchedFileCount,
          hasExplicitExpectedTouchedFileCount: explicitParamFileCount > 0,
          expectsMultipleFiles,
          complexity,
          hasPrefetchedContext,
          evidence,
        }
      }

      function shouldCollectProposalBundle(
        params: Record<string, any> | undefined,
      ): boolean {
        const value = params?.proposalBundleMode
        return value === true || value === 'true'
      }

      // Coerce an explicit expected-file-count param to a safe positive integer.
      // Returns 0 when absent/invalid so it only ever raises the regex floor.
      function coerceExplicitFileCount(value: unknown): number {
        const n = Number(value)
        if (!Number.isFinite(n) || n <= 0) return 0
        return Math.min(20, Math.floor(n))
      }

      function coerceExplicitBoolean(value: unknown): boolean {
        return value === true || value === 'true'
      }

      function getMaxBundleProposalTurns(input: {
        params: Record<string, any> | undefined
        complexity: 'simple' | 'standard' | 'complex'
        hasPrefetchedContext: boolean
        expectedTouchedFileCount: number
      }): number {
        const {
          params,
          complexity,
          hasPrefetchedContext,
          expectedTouchedFileCount,
        } = input
        const raw = Number(params?.maxBundleProposalTurns)
        if (Number.isFinite(raw) && raw > 0) {
          return Math.max(1, Math.min(24, Math.floor(raw)))
        }
        if (expectedTouchedFileCount > 0) {
          return Math.min(
            24,
            Math.max(
              expectedTouchedFileCount + 3,
              complexity === 'complex' ? 8 : 5,
            ),
          )
        }
        if (complexity === 'complex') {
          return hasPrefetchedContext ? 8 : 10
        }
        if (complexity === 'standard') {
          return 5
        }
        return 3
      }

      function shouldStopAfterProposalSignal(input: {
        proposalSignalCount: number
        step: number
        proposedFileCount: number
        hasAnyProposal: boolean
        completionSignalSeen: boolean
        stepsComplete: boolean
        hasReadOnlyActivityThisStep: boolean
      }): boolean {
        const {
          proposalSignalCount,
          step,
          proposedFileCount,
          hasAnyProposal,
          completionSignalSeen,
          stepsComplete,
          hasReadOnlyActivityThisStep,
        } = input
        const hasNewProposalSignal =
          proposalSignalCount > lastProposalSignalCount
        const coverage = getProposalCoverageAssessment({
          proposedFileCount,
          hasAnyProposal,
        })

        if (!collectProposalBundle) {
          stopReason = 'cleanProposal'
          return true
        }
        if (completionSignalSeen) {
          stopReason = 'cleanProposal'
          return true
        }

        if (
          hasNewProposalSignal &&
          shouldStopAfterCoveredProposalSignal({
            coverage,
            stepsComplete,
          })
        ) {
          stopReason = 'cleanProposal'
          return true
        }

        if (step === maxProposalSteps - 1) {
          stopReason = coverage.canCleanAfterQuiescence
            ? 'cleanProposal'
            : 'stepBudget'
          return true
        }

        if (!hasNewProposalSignal) {
          if (hasReadOnlyActivityThisStep) {
            return false
          }
          stopReason = coverage.canCleanAfterQuiescence
            ? 'cleanProposal'
            : 'noCompletionSignal'
          return true
        }

        lastProposalSignalCount = proposalSignalCount
        bundleProposalTurns++

        // Multi-file proposals should be bundled, but weak/OpenAI-compatible
        // models often emit one more proposal call every turn forever. Stop
        // after an adaptive number of proposal-bearing turns; the current
        // turn's edits are already captured in the ledger and will be returned
        // to the selector instead of letting one candidate block the run.
        if (bundleProposalTurns >= maxBundleProposalTurns) {
          stopReason = coverage.canCleanAfterQuiescence
            ? 'cleanProposal'
            : 'bundleCap'
          return true
        }
        return false
      }

      function inferProposalStopReason(input: {
        toolCalls: { toolName: string; input: any }[]
        summary: LedgerSummary
        unifiedDiffs: string
        messageHistory: any[]
      }):
        | 'cleanProposal'
        | 'bundleCap'
        | 'stepBudget'
        | 'noCompletionSignal'
        | 'noProposal' {
        const { toolCalls, summary, unifiedDiffs, messageHistory } = input
        if (toolCalls.length === 0 && !unifiedDiffs) {
          return 'noProposal'
        }
        if (!collectProposalBundle) {
          return 'cleanProposal'
        }
        if (hasProposalCompletionSignal(messageHistory)) {
          return 'cleanProposal'
        }
        return getProposalCoverageAssessment({
          proposedFileCount: summary.proposedFiles.length,
          hasAnyProposal: summary.successfulCount > 0,
        }).canCleanAfterQuiescence
          ? 'cleanProposal'
          : 'noCompletionSignal'
      }

      function shouldStopAfterCoveredProposalSignal(input: {
        coverage: ReturnType<typeof getProposalCoverageAssessment>
        stepsComplete: boolean
      }): boolean {
        const { coverage, stepsComplete } = input
        if (!coverage.hasAnyProposal) return false

        // If the task told us the expected scope (explicit paths/count, or an
        // explicit multi-file signal), stop as soon as that scope is covered.
        if (coverage.satisfiesKnownScope) return true

        // If the model has not completed its turn/generation, do not cut it off
        // unless the known required scope above is already covered.
        if (!stepsComplete) return false

        // Simple one-file work should not pay an extra model turn just to prove
        // there are no more files.
        if (coverage.satisfiesSimpleScope) return true

        // Ambiguous standard tasks can still finish cleanly when the provider
        // naturally completes a multi-file bundle in the same step.
        return coverage.proposedFileCount > 1 && coverage.canCleanAfterQuiescence
      }

      function getProposalCoverageAssessment(input: {
        proposedFileCount: number
        hasAnyProposal: boolean
      }): {
        proposedFileCount: number
        requiredFileCount: number
        hasAnyProposal: boolean
        satisfiesKnownScope: boolean
        satisfiesSimpleScope: boolean
        canCleanAfterQuiescence: boolean
      } {
        const proposedFileCount = input.proposedFileCount
        const requiredFileCount = getKnownRequiredProposalFileCount()
        const hasAnyProposal = input.hasAnyProposal
        const satisfiesKnownScope =
          requiredFileCount > 0 && proposedFileCount >= requiredFileCount
        const satisfiesSimpleScope =
          requiredFileCount === 0 &&
          proposalBudget.complexity === 'simple' &&
          proposedFileCount >= 1
        const satisfiesUnknownQuiescentScope =
          requiredFileCount === 0 &&
          proposedFileCount >= (proposalBudget.expectsMultipleFiles ? 2 : 1)
        const canCleanAfterQuiescence =
          satisfiesKnownScope ||
          satisfiesSimpleScope ||
          satisfiesUnknownQuiescentScope

        return {
          proposedFileCount,
          requiredFileCount,
          hasAnyProposal,
          satisfiesKnownScope,
          satisfiesSimpleScope,
          canCleanAfterQuiescence,
        }
      }

      function getKnownRequiredProposalFileCount(): number {
        if (proposalBudget.expectedTouchedFileCount > 1) {
          return proposalBudget.expectedTouchedFileCount
        }
        if (proposalBudget.expectedTouchedFileCount === 1) {
          return proposalBudget.hasExplicitExpectedTouchedFileCount ||
            proposalBudget.complexity === 'simple'
            ? 1
            : 0
        }
        if (proposalBudget.expectsMultipleFiles) {
          return 2
        }
        return 0
      }

      function buildProposalRetryToolCall(input: {
        messageHistory: any[]
        text: string
      }): any {
        return {
          toolName: 'set_messages',
          input: {
            messages: [
              ...input.messageHistory,
              {
                role: 'user',
                content: [
                  {
                    type: 'text',
                    text: input.text,
                  },
                ],
                tags: ['PROPOSAL_RETRY'],
              },
            ],
          },
          includeToolCall: false,
        }
      }

      function buildProposalProgressTelemetry(input: {
        messageHistory: any[]
        summary: LedgerSummary
        stopReason: string
        stepsTaken: number
      }): Record<string, any> {
        const { messageHistory, summary, stepsTaken } = input
        return {
          stepsTaken,
          readOnlyToolCallCount: countToolCallsInMessages(
            messageHistory,
            isReadOnlyToolName,
          ),
          proposalToolCallCount: summary.toolCalls.length,
          successfulProposalResultCount: summary.successfulCount,
          failedProposalResultCount: summary.failedOnlyCount,
          proposedFileCount: summary.proposedFiles.length,
          proposedFiles: summary.proposedFiles.slice(0, 20),
          completionSignalSeen: hasProposalCompletionSignal(messageHistory),
          stopReason: input.stopReason,
          ...(summary.failedOnlyCount
            ? { droppedFailedProposalResultCount: summary.failedOnlyCount }
            : {}),
        }
      }

      function countToolCallsInMessages(
        messages: any[],
        predicate: (toolName: any) => boolean,
      ): number {
        let count = 0
        for (const message of messages) {
          if (message.role !== 'assistant' || !Array.isArray(message.content)) {
            continue
          }
          for (const part of message.content) {
            if (part?.type === 'tool-call' && predicate(part.toolName)) {
              count++
            }
          }
        }
        return count
      }

      function hasProposalCompletionSignal(messages: any[]): boolean {
        return messages.some((message) =>
          getMessageText(message).includes('PROPOSAL_BUNDLE_COMPLETE'),
        )
      }

      function collectBudgetText(
        params: Record<string, any> | undefined,
        messageHistory: any[],
      ): string {
        const paramText = [
          params?.proposalStrategy,
          params?.proposalContext,
          params?.previousFailure,
        ]
          .filter((value): value is string => typeof value === 'string')
          .join('\n')

        const historyText = messageHistory
          .map(getMessageText)
          .filter((text) => text.trim().length > 0)
          .slice(-4)
          .join('\n')

        return `${paramText}\n${historyText}`.trim()
      }

      function collectBudgetTaskText(
        params: Record<string, any> | undefined,
        messageHistory: any[],
      ): string {
        const paramText = [
          params?.proposalStrategy,
          extractTaskFacingProposalContext(params?.proposalContext),
          params?.previousFailure,
        ]
          .filter((value): value is string => typeof value === 'string')
          .join('\n')

        if (paramText.trim()) {
          return paramText
        }

        return messageHistory
          .map((message) =>
            extractTaskFacingProposalContext(getMessageText(message)),
          )
          .filter((text) => text.trim().length > 0)
          .slice(-4)
          .join('\n')
      }

      function extractTaskFacingProposalContext(value: unknown): string {
        if (typeof value !== 'string') return ''
        const contextMarker =
          '\nCurrent file/search context already gathered by the parent agent:'
        const markerIndex = value.indexOf(contextMarker)
        return markerIndex === -1 ? value : value.slice(0, markerIndex)
      }

      function hasProposalPrefetchedContext(text: string): boolean {
        return /(?:^|\n)(?:File: |Tool result from |Current file\/search context already gathered)/.test(
          text,
        )
      }

      function countUniqueMatches(text: string, pattern: RegExp): number {
        return new Set(Array.from(text.matchAll(pattern), (match) => match[0]))
          .size
      }

      function inferExpectedTouchedFileCountFromText(text: string): number {
        const counts: number[] = []
        const unit = String.raw`(?:files?|pages?|screens?|components?|modules?)`
        const patterns: Array<{ pattern: RegExp; offset: number }> = [
          {
            pattern: new RegExp(
              String.raw`\b(?:more\s+than|over)\s*(\d+)\s*${unit}\b`,
              'gi',
            ),
            offset: 1,
          },
          {
            pattern: new RegExp(
              String.raw`\b(?:at\s+least|minimum\s+of)\s*(\d+)\s*${unit}\b`,
              'gi',
            ),
            offset: 0,
          },
          {
            pattern: new RegExp(String.raw`\b(\d+)\s*\+\s*${unit}\b`, 'gi'),
            offset: 0,
          },
          {
            pattern: new RegExp(
              String.raw`\b(\d+)\s*${unit}(?:\s+or\s+more)?\b`,
              'gi',
            ),
            offset: 0,
          },
        ]

        for (const { pattern, offset } of patterns) {
          for (const match of text.matchAll(pattern)) {
            const parsed = Number(match[1])
            if (Number.isFinite(parsed) && parsed > 0) {
              counts.push(Math.min(20, Math.floor(parsed) + offset))
            }
          }
        }

        return counts.length === 0 ? 0 : Math.max(...counts)
      }

      function countContextFileHeaders(text: string): number {
        return new Set(
          Array.from(
            text.matchAll(
              /(?:^|\n)(?:File:\s+|\.\/)([A-Za-z0-9_.@-]+(?:\/[A-Za-z0-9_.@-]+)+\.(?:ts|tsx|js|jsx|mjs|cjs|json|md|mdx|css|scss|yml|yaml|toml|txt|py|go|rs|java|kt|kts|cs|php|rb|swift|scala|lua|ex|exs|erl|clj|cljs|sh|bash|zsh))(?::)?/g,
            ),
            (match) => match[1],
          ),
        ).size
      }

      function getFilePathPattern(): RegExp {
        return /\b(?:\.\/)?[A-Za-z0-9_.@-]+(?:\/[A-Za-z0-9_.@-]+)+\.(?:ts|tsx|js|jsx|mjs|cjs|json|md|mdx|css|scss|yml|yaml|toml|txt|py|go|rs|java|kt|kts|cs|php|rb|swift|scala|lua|ex|exs|erl|clj|cljs|sh|bash|zsh)\b/g
      }

      function countLikelyBareFileNames(text: string): number {
        const fileNames = new Set<string>()
        const pattern =
          /(?:^|[\s`"'([{])([A-Za-z0-9_.@-]+\.(?:ts|tsx|js|jsx|mjs|cjs|json|md|mdx|css|scss|yml|yaml|toml|txt|py|go|rs|java|kt|kts|cs|php|rb|swift|scala|lua|ex|exs|erl|clj|cljs|sh|bash|zsh))(?:$|[\s`"',;:)\]}])/g

        for (const match of text.matchAll(pattern)) {
          const fileName = match[1]
          if (fileName && !fileName.includes('/') && !/\.mdx?$/.test(fileName)) {
            fileNames.add(fileName)
          }
        }

        return fileNames.size
      }

      function getMessageText(message: any): string {
        const content = message?.content
        if (typeof content === 'string') return content
        if (!Array.isArray(content)) return ''

        return content
          .map((part: any) => {
            if (typeof part === 'string') return part
            if (part?.type === 'text' && typeof part.text === 'string') {
              return part.text
            }
            if (part?.type === 'json') {
              try {
                return JSON.stringify(part.value)
              } catch {
                return ''
              }
            }
            return ''
          })
          .join('\n')
      }

      function hasReadOnlyToolActivity(
        messages: any[],
        toolResult: any,
      ): boolean {
        if (getReadOnlyToolResultValues(toolResult).length > 0) return true

        return messages.some((message) => {
          if (message.role === 'tool') {
            return isReadOnlyToolName(message.toolName)
          }
          if (message.role !== 'assistant' || !Array.isArray(message.content)) {
            return false
          }
          return message.content.some(
            (part: any) =>
              part?.type === 'tool-call' && isReadOnlyToolName(part.toolName),
          )
        })
      }

      function getReadOnlyToolResultValues(toolResult: any): any[] {
        if (!Array.isArray(toolResult)) return []
        return toolResult.flatMap((part) => {
          const toolName = part?.toolName ?? part?.name
          return part?.type === 'json' && isReadOnlyToolName(toolName)
            ? flattenToolResultValues(part.value)
            : []
        })
      }

      function hasCurrentReadOnlyToolResult(toolResult: any): boolean {
        return getReadOnlyToolResultValues(toolResult).length > 0
      }

      function isReadOnlyToolName(toolName: any): boolean {
        return (
          toolName === 'read_files' ||
          toolName === 'read_proposal_workspace' ||
          toolName === 'code_search' ||
          toolName === 'glob' ||
          toolName === 'list_directory'
        )
      }

      function flattenToolResultValues(value: any): any[] {
        if (Array.isArray(value)) {
          return value.flatMap(flattenToolResultValues)
        }
        if (
          value &&
          typeof value === 'object' &&
          value.type === 'json' &&
          'value' in value
        ) {
          return flattenToolResultValues(value.value)
        }
        return value === undefined || value === null ? [] : [value]
      }

      function buildProposalRetryPrompt(proposalToolResults: any[]): string {
        const failureDetails = proposalToolResults
          .map((result) =>
            result && typeof result === 'object'
              ? typeof result.errorMessage === 'string'
                ? result.errorMessage
                : ''
              : '',
          )
          .filter(Boolean)
          .join('\n\n')

        const contextInstruction = canUseReadOnlyTools
          ? 'Immediately gather exact context with read_files/code_search/glob/list_directory if needed, then emit every required file edit as valid XML proposal tool calls.'
          : 'Do not try to gather more context. Use the supplied proposalContext/current file context and emit every required file edit as valid XML proposal tool calls.'
        const staleTextInstruction = canUseReadOnlyTools
          ? 'If a propose_str_replace oldString failed, inspect the current file/range and use exact current text. For large files, re-read the exact range immediately before the repaired proposal and batch all replacements for that file into one propose_str_replace call. If the full target file content is available and exact replacement remains brittle, use propose_write_file with the complete updated file content.'
          : 'If a propose_str_replace oldString failed, use exact current text only when it appears in the supplied context. For large files, do not reuse old/parent readCapability tokens or stale snippets; if exact replacement remains brittle, use propose_write_file with complete updated file content from the supplied context.'

        return `Your previous response did not produce a clean proposal diff.${
          failureDetails
            ? ` The proposal tool reported:\n\n${failureDetails}\n\n`
            : ' '
        }${contextInstruction} Do not call write_file, str_replace, spawn_agents, set_output, or any other mutating/control tool.

${staleTextInstruction}

For multi-file implementations, emit a complete proposal bundle with one propose_* call per edited file when needed. After every required edit has been proposed, write the exact marker PROPOSAL_BUNDLE_COMPLETE. Do not write that marker if you still need more context or still have missing edits.

Use this exact shape with valid JSON and no markdown fences:
<codebuff_tool_call>
{"cb_tool_name":"propose_str_replace","path":"path/to/file","replacements":[{"oldString":"exact old code","newString":"exact new code"}]}
</codebuff_tool_call>

Or:
<codebuff_tool_call>
{"cb_tool_name":"propose_write_file","path":"path/to/file","instructions":"what changed","content":"complete file content"}
</codebuff_tool_call>`
      }

      function buildStopExploringPrompt(): string {
        return `You have gathered enough context. Stop exploring now and emit the full proposal edit bundle in your next response.

Use propose_write_file for complete new files or major rewrites, and propose_str_replace only when you have exact current oldString text. The parent will validate/apply the proposal, so do not keep reading files unless a single exact oldString is still missing.

If the implementation needs multiple files, emit multiple proposal tool calls before stopping. After every required edit has been proposed, write the exact marker PROPOSAL_BUNDLE_COMPLETE. Do not write that marker if any requested edit is still missing.

Emit valid XML proposal tool calls with no markdown fences:
<codebuff_tool_call>
{"cb_tool_name":"propose_write_file","path":"path/to/file","instructions":"what changed","content":"complete file content"}
</codebuff_tool_call>`
      }

      function buildReadOnlyContextFromMessages(messages: any[]): string {
        const contexts = messages
          .filter(
            (message) =>
              message?.role === 'tool' && isReadOnlyToolName(message.toolName),
          )
          .map(formatReadOnlyToolContext)
          .filter((text) => text.trim().length > 0)

        if (contexts.length === 0) return ''

        return truncateText(
          [
            'Read-only context gathered by previous proposal attempt:',
            ...takeFromEndWithinBudget(contexts, 60_000),
          ].join('\n\n'),
          60_000,
        )
      }

      function formatReadOnlyToolContext(message: any): string {
        if (message.toolName === 'read_files') {
          return formatReadFilesToolContext(message, 50_000)
        }

        const text = normalizeMessageText(getMessageText(message))
        return text.trim()
          ? truncateText(
              `Tool result from ${message.toolName}:\n${text}`,
              12_000,
            )
          : ''
      }

      function formatReadFilesToolContext(
        message: any,
        maxChars: number,
      ): string {
        const files = extractJsonPartValues(message)
          .flatMap(flattenReadFileEntries)
          .filter(
            (entry): entry is { path: string; content: string } =>
              typeof entry?.path === 'string' &&
              typeof entry?.content === 'string',
          )

        if (files.length === 0) return ''

        const perFileChars = Math.max(
          2_000,
          Math.floor(maxChars / Math.max(files.length, 1)),
        )
        return truncateText(
          files
            .map(
              (file) =>
                `File: ${file.path}\n${truncateText(file.content, perFileChars)}`,
            )
            .join('\n\n'),
          maxChars,
        )
      }

      function extractJsonPartValues(message: any): any[] {
        if (!Array.isArray(message?.content)) return []
        return message.content
          .filter((part: any) => part?.type === 'json' && part.value)
          .map((part: any) => part.value)
      }

      function flattenReadFileEntries(value: any): any[] {
        if (Array.isArray(value)) return value.flatMap(flattenReadFileEntries)
        if (value && typeof value === 'object' && 'value' in value) {
          return flattenReadFileEntries(value.value)
        }
        return [value]
      }

      function takeFromEndWithinBudget(
        messages: string[],
        maxChars: number,
      ): string[] {
        const selected: string[] = []
        let usedChars = 0

        for (const message of [...messages].reverse()) {
          const nextLength = message.length + 1
          if (selected.length > 0 && usedChars + nextLength > maxChars) {
            break
          }
          selected.unshift(message)
          usedChars += nextLength
        }

        return selected
      }

      function normalizeMessageText(text: string): string {
        return text
          .replace(/<user_message>/g, '')
          .replace(/<\/user_message>/g, '')
          .replace(/<system>/g, '')
          .replace(/<\/system>/g, '')
          .trim()
      }

      function truncateText(text: string, maxChars: number): string {
        if (text.length <= maxChars) return text
        if (maxChars <= 20) return text.slice(0, maxChars)
        return `${text.slice(0, maxChars - 20)}\n... [truncated]`
      }

      function buildNoProposalErrorMessage(messages: any[]): string {
        const readOnlyTools = new Set<string>()
        for (const message of messages) {
          if (message.role === 'tool' && isReadOnlyToolName(message.toolName)) {
            readOnlyTools.add(message.toolName)
          }
          if (message.role !== 'assistant' || !Array.isArray(message.content)) {
            continue
          }
          for (const part of message.content) {
            if (
              part?.type === 'tool-call' &&
              isReadOnlyToolName(part.toolName)
            ) {
              readOnlyTools.add(part.toolName)
            }
          }
        }

        return readOnlyTools.size > 0
          ? `Gathered context with ${[...readOnlyTools].join(
              ', ',
            )}, but did not emit propose_str_replace/propose_write_file before the proposal step budget.`
          : 'No propose_str_replace/propose_write_file call was produced.'
      }

      function getCanUseReadOnlyTools(input: {
        params: Record<string, any> | undefined
        agentState: any
      }): boolean {
        if (input.params?.allowReadOnlyTools === true) return true
        if (input.params?.allowReadOnlyTools === false) return false

        const toolDefinitions = input.agentState?.toolDefinitions
        return Boolean(
          toolDefinitions &&
          (toolDefinitions.read_files ||
            toolDefinitions.code_search ||
            toolDefinitions.glob ||
            toolDefinitions.list_directory),
        )
      }
    },
  }
}

/** A single recorded proposal artifact (mirrors ProposalLedgerArtifact). */
type LedgerArtifact = {
  seq: number
  attempt: number
  toolName:
    | 'propose_str_replace'
    | 'propose_write_file'
    | 'propose_edit_transaction'
  input: Record<string, any>
  result: {
    file: string
    ok: boolean
    unifiedDiff?: string
    message?: string
    errorMessage?: string
    finalContent?: string
    baseContentHash?: string | null
    baseContent?: string | null
  }
}

type LedgerSummary = {
  toolCalls: { toolName: string; input: any }[]
  toolResults: any[]
  unifiedDiffs: string
  successfulCount: number
  failedOnlyCount: number
  proposedFiles: string[]
}

const definition = {
  ...createBestOfNImplementor({ model: 'opus' }),
  id: 'editor-implementor',
}
export default definition
