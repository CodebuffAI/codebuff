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
    'code_search',
    'glob',
    'list_directory',
  ]
  const proposalToolNames: AllToolNames[] = [
    'propose_write_file',
    'propose_str_replace',
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
You draft edits only with propose_str_replace and propose_write_file.
Never call write_file, str_replace, spawn_agents, set_output, or any other mutating/control tool.
If the supplied prompt already includes enough exact file content, propose the edits immediately. If the task is complex, multi-file, or exact oldString values are uncertain, first inspect with read-only tools, then emit complete propose_* tool calls.`
      : `You are a strict implementation proposal generator.

You do not have repository exploration tools in this phase.
Use the supplied proposalContext/current file context and draft edits only with propose_str_replace and propose_write_file.
Never call read_files, code_search, glob, list_directory, write_file, str_replace, spawn_agents, set_output, or any other mutating/control tool.
Emit complete propose_* tool calls immediately. If exact replacement text is not available, prefer propose_write_file with complete file content from the supplied context over guessing stale oldString values.`,

    toolNames,
    spawnableAgents: [],

    inputSchema: {},
    outputMode: 'structured_output',

    instructionsPrompt: `You are an expert code editor with deep understanding of software engineering principles. You were spawned to generate an implementation for the user's request.
    
Your task is to write out ALL the code changes needed to complete the user's request.

IMPORTANT: Your response must progress toward at least one propose_str_replace or propose_write_file tool call. Use those tools to draft edits without actually applying them - they will be reviewed first. ${
      allowReadOnlyTools
        ? 'You may first use read_files, code_search, glob, or list_directory when exact current context is missing.'
        : 'You do not have read-only tools here; use the supplied proposalContext/current file context and emit proposal tool calls immediately.'
    } DO NOT use any mutating/control tools such as write_file, str_replace, spawn_agents, or set_output. Use your reasoning internally, keep visible narration short, and emit all needed proposal tool calls as soon as you have enough context.

For multi-file implementations, return a complete proposal bundle. Use multiple propose_* tool calls when needed, one per file or one propose_str_replace with multiple replacements for the same file. Do not stop after the first file if the requested implementation needs additional files.
After you have emitted every required proposal tool call, write the exact marker PROPOSAL_BUNDLE_COMPLETE. If you cannot finish, do not write that marker.
The proposal collector tracks progress and completion, so emit all known file edits in the same response whenever possible instead of adding one file per turn indefinitely.

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
      const initialMessageHistoryLength =
        initialAgentState.messageHistory.length
      const canUseReadOnlyTools = getCanUseReadOnlyTools({
        params,
        agentState: initialAgentState,
      })

      let agentState = initialAgentState
      let accumulatedProposalToolResults: any[] = []
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

        const postMessages = agentState.messageHistory.slice(
          initialMessageHistoryLength,
        )
        const latestAttemptMessages =
          getMessagesSinceLastProposalRetry(postMessages)
        const rawLatestProposalToolCalls = getProposalToolCallsFromMessages(
          latestAttemptMessages,
        )
        const rawProposalToolResults = dedupeProposalToolResults([
          ...getProposalToolResults(latestAttemptMessages),
          ...getProposalToolResultValues(result.toolResult),
          ...accumulatedProposalToolResults,
        ])
        const proposalArtifacts = sanitizeProposalArtifactsForCapturedBundle({
          toolCalls: rawLatestProposalToolCalls,
          rawToolResults: rawProposalToolResults,
        })
        const latestProposalToolCalls = proposalArtifacts.toolCalls
        const proposalToolResults = proposalArtifacts.toolResults
        accumulatedProposalToolResults = proposalToolResults
        const hasSuccessfulProposalToolResult = proposalToolResults.some(
          isSuccessfulProposalToolResult,
        )
        const hasFailedProposalToolResult = proposalToolResults.some(
          isFailedProposalToolResult,
        )

        // If the model produced real proposal diffs and then made a bad extra
        // proposal edit, preserve the useful captured bundle instead of
        // feeding it a retry prompt that can erase or duplicate the work. The
        // parent will treat this as partial and run the normal completion/
        // repair path before applying anything.
        if (
          hasSuccessfulProposalToolResult &&
          proposalArtifacts.droppedFailedProposalResultCount > 0
        ) {
          stopReason = 'noCompletionSignal'
          break
        }

        // Proposal agents need to draft edits, not apply them. In bundle mode,
        // the completion marker is preferred, but it cannot be the only success
        // signal: weaker/OpenAI-compatible models often emit a valid multi-file
        // bundle and then finish without the exact marker. Keep collecting
        // while proposal progress continues; once the proposal stream quiesces
        // or the provider reports a complete multi-file step, classify the
        // captured edit bundle from evidence instead of timing out forever.
        if (hasSuccessfulProposalToolResult && !hasFailedProposalToolResult) {
          const proposalSignalCount =
            latestProposalToolCalls.length + proposalToolResults.length
          if (
            shouldStopAfterProposalSignal({
              proposalSignalCount,
              step,
              latestAttemptMessages,
              latestProposalToolCalls,
              proposalToolResults,
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

        // Some OpenAI-compatible providers/models do not consistently execute
        // XML/text tool calls as native tool results. If the model emitted a
        // syntactically valid proposal call and no proposal tool reported a
        // failure, return that call to the parent so the real apply step can
        // validate it instead of looping until the proposal budget is gone.
        if (
          latestProposalToolCalls.length > 0 &&
          !hasFailedProposalToolResult
        ) {
          const proposalSignalCount =
            latestProposalToolCalls.length + proposalToolResults.length
          if (
            shouldStopAfterProposalSignal({
              proposalSignalCount,
              step,
              latestAttemptMessages,
              latestProposalToolCalls,
              proposalToolResults,
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

        // Read-only exploration is now allowed so weaker/OpenAI-compatible
        // proposal models can recover from context starvation. If this step
        // only gathered context, let the model take another normal step instead
        // of injecting an unnecessary "you failed" retry prompt.
        if (
          canUseReadOnlyTools &&
          !hasSuccessfulProposalToolResult &&
          !hasFailedProposalToolResult &&
          latestProposalToolCalls.length === 0 &&
          hasReadOnlyToolActivity(latestAttemptMessages, result.toolResult)
        ) {
          readOnlyOnlySteps++
          if (readOnlyOnlySteps > maxReadOnlyOnlySteps) {
            stopReason = 'noProposal'
            break
          }
          if (readOnlyOnlySteps === maxReadOnlyOnlySteps) {
            yield {
              toolName: 'set_messages',
              input: {
                messages: [
                  ...agentState.messageHistory,
                  {
                    role: 'user',
                    content: [
                      {
                        type: 'text',
                        text: buildStopExploringPrompt(),
                      },
                    ],
                    tags: ['PROPOSAL_RETRY'],
                  },
                ],
              },
              includeToolCall: false,
            }
          }
          continue
        }
        readOnlyOnlySteps = 0

        yield {
          toolName: 'set_messages',
          input: {
            messages: [
              ...agentState.messageHistory,
              {
                role: 'user',
                content: [
                  {
                    type: 'text',
                    text: buildProposalRetryPrompt(proposalToolResults),
                  },
                ],
                tags: ['PROPOSAL_RETRY'],
              },
            ],
          },
          includeToolCall: false,
        }
      }

      const postMessages = agentState.messageHistory.slice(
        initialMessageHistoryLength,
      )
      const latestAttemptMessages =
        getMessagesSinceLastProposalRetry(postMessages)

      // Extract tool calls from assistant messages (both native and XML-formatted)
      const rawToolCalls = getProposalToolCallsFromMessages(
        latestAttemptMessages,
      )

      // Extract tool results (unified diffs) from tool messages. Include the
      // latest STEP toolResult too: in the live runtime, a successful proposal
      // result can be available in the yielded STEP payload before it appears
      // in messageHistory. If we used it to stop, we must also emit it.
      const rawToolResults = dedupeProposalToolResults([
        ...getProposalToolResults(latestAttemptMessages),
        ...accumulatedProposalToolResults,
      ])
      const proposalArtifacts = sanitizeProposalArtifactsForCapturedBundle({
        toolCalls: rawToolCalls,
        rawToolResults,
      })
      const toolResults = proposalArtifacts.toolResults
      const toolCalls = proposalArtifacts.toolCalls

      // Concatenate all unified diffs for the selector to review
      const unifiedDiffs = toolResults
        .filter(isSuccessfulProposalToolResult)
        .map((result: any) => `--- ${result.file} ---\n${result.unifiedDiff}`)
        .join('\n\n')

      const finalStopReason =
        stopReason ??
        (proposalArtifacts.droppedFailedProposalResultCount > 0 &&
        (toolCalls.length > 0 || unifiedDiffs.length > 0)
          ? 'noCompletionSignal'
          : undefined) ??
        inferProposalStopReason({
          toolCalls,
          toolResults,
          unifiedDiffs,
          latestAttemptMessages,
        })

      yield {
        toolName: 'set_output',
        input: {
          toolCalls,
          toolResults,
          unifiedDiffs,
          readOnlyContext: buildReadOnlyContextFromMessages(postMessages),
          proposalBudget,
          proposalProgress: buildProposalProgressTelemetry({
            latestAttemptMessages,
            toolCalls,
            toolResults,
            stopReason: finalStopReason,
            stepsTaken: completedProposalSteps,
            droppedFailedProposalResultCount:
              proposalArtifacts.droppedFailedProposalResultCount,
          }),
          stopReason: finalStopReason,
          ...(toolCalls.length === 0 && !unifiedDiffs
            ? {
                errorMessage: buildNoProposalErrorMessage(
                  latestAttemptMessages,
                ),
              }
            : {}),
        },
        includeToolCall: false,
      }

      function getAdaptiveProposalBudget(params: {
        params: Record<string, any> | undefined
        messageHistory: any[]
      }): {
        maxProposalSteps: number
        maxReadOnlyOnlySteps: number
        maxBundleProposalTurns: number
        expectedTouchedFileCount: number
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
        const explicitFilePathCount = Math.min(
          20,
          Math.max(
            numericTouchedFileCount,
            explicitTaskFilePathCount,
            explicitBareTaskFileNameCount,
          ),
        )
        const expectedTouchedFileCount = Math.min(20, explicitFilePathCount)
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

        const hasExplicitMultiFileSignal =
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
        latestAttemptMessages: any[]
        latestProposalToolCalls: { toolName: string; input: any }[]
        proposalToolResults: any[]
        stepsComplete: boolean
        hasReadOnlyActivityThisStep: boolean
      }): boolean {
        const {
          proposalSignalCount,
          step,
          latestAttemptMessages,
          latestProposalToolCalls,
          proposalToolResults,
          stepsComplete,
          hasReadOnlyActivityThisStep,
        } = input
        const hasCompletionSignal = hasProposalCompletionSignal(
          latestAttemptMessages,
        )
        const hasNewProposalSignal =
          proposalSignalCount > lastProposalSignalCount
        const coverage = getProposalCoverageAssessment({
          toolCalls: latestProposalToolCalls,
          toolResults: proposalToolResults,
        })

        if (!collectProposalBundle) {
          stopReason = 'cleanProposal'
          return true
        }
        if (hasCompletionSignal) {
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
        // turn's edits are already captured and will be returned to the
        // selector instead of letting one candidate block the whole run.
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
        toolResults: any[]
        unifiedDiffs: string
        latestAttemptMessages: any[]
      }):
        | 'cleanProposal'
        | 'bundleCap'
        | 'stepBudget'
        | 'noCompletionSignal'
        | 'noProposal' {
        const { toolCalls, toolResults, unifiedDiffs, latestAttemptMessages } =
          input
        if (toolCalls.length === 0 && !unifiedDiffs) {
          return 'noProposal'
        }
        if (!collectProposalBundle) {
          return 'cleanProposal'
        }
        if (hasProposalCompletionSignal(latestAttemptMessages)) {
          return 'cleanProposal'
        }
        return getProposalCoverageAssessment({
          toolCalls,
          toolResults,
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
        // This is the key anti-hang path for local/OpenAI-compatible models
        // that emit the whole bundle and then stall before writing the marker.
        if (coverage.satisfiesKnownScope) return true

        // If the model has not completed its turn/generation, do not cut it off
        // unless the known required scope above is already covered.
        if (!stepsComplete) return false

        // Simple one-file work should not pay an extra model turn just to
        // prove there are no more files.
        if (coverage.satisfiesSimpleScope) return true

        // Ambiguous standard tasks can still finish cleanly when the provider
        // naturally completes a multi-file bundle in the same step. Avoid doing
        // this for complex/unknown tasks; those should either keep making
        // progress, emit the marker, or be marked partial for a completion pass.
        return (
          coverage.proposedFileCount > 1 &&
          coverage.canCleanAfterQuiescence
        )
      }

      function getProposalCoverageAssessment(input: {
        toolCalls: { toolName: string; input: any }[]
        toolResults: any[]
      }): {
        proposedFileCount: number
        requiredFileCount: number
        hasAnyProposal: boolean
        satisfiesKnownScope: boolean
        satisfiesSimpleScope: boolean
        canCleanAfterQuiescence: boolean
      } {
        const proposedFileCount = getUniqueProposedFilePaths(input).length
        const requiredFileCount = getKnownRequiredProposalFileCount()
        const hasAnyProposal = proposedFileCount > 0
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
        if (proposalBudget.expectedTouchedFileCount > 0) {
          return proposalBudget.expectedTouchedFileCount
        }
        if (proposalBudget.expectsMultipleFiles) {
          // The request says multi-file but not how many files. Require at
          // least two files before calling it clean; otherwise a one-file
          // proposal is useful but partial and should go through completion.
          return 2
        }
        return 0
      }

      function getUniqueProposedFilePaths(input: {
        toolCalls: { toolName: string; input: any }[]
        toolResults: any[]
      }): string[] {
        const paths = new Set<string>()
        for (const toolCall of input.toolCalls) {
          const path = getProposalToolCallPath(toolCall)
          if (path) paths.add(path)
        }
        for (const result of input.toolResults) {
          const path = getProposalToolResultPath(result)
          if (path) paths.add(path)
        }
        return [...paths]
      }

      function getProposalToolCallPath(toolCall: {
        toolName: string
        input: any
      }): string {
        return typeof toolCall.input?.path === 'string'
          ? toolCall.input.path
          : ''
      }

      function getProposalToolResultPath(result: any): string {
        if (!result || typeof result !== 'object') return ''
        if (typeof result.file === 'string') return result.file
        return typeof result.path === 'string' ? result.path : ''
      }

      function buildProposalProgressTelemetry(input: {
        latestAttemptMessages: any[]
        toolCalls: { toolName: string; input: any }[]
        toolResults: any[]
        stopReason: string
        stepsTaken: number
        droppedFailedProposalResultCount?: number
      }): Record<string, any> {
        const { latestAttemptMessages, toolCalls, toolResults, stepsTaken } =
          input
        const proposedFiles = getUniqueProposedFilePaths({
          toolCalls,
          toolResults,
        })
        return {
          stepsTaken,
          readOnlyToolCallCount: countToolCallsInMessages(
            latestAttemptMessages,
            isReadOnlyToolName,
          ),
          proposalToolCallCount: toolCalls.length,
          successfulProposalResultCount: toolResults.filter(
            isSuccessfulProposalToolResult,
          ).length,
          failedProposalResultCount: toolResults.filter(
            isFailedProposalToolResult,
          ).length,
          proposedFileCount: proposedFiles.length,
          proposedFiles: proposedFiles.slice(0, 20),
          completionSignalSeen: hasProposalCompletionSignal(
            latestAttemptMessages,
          ),
          stopReason: input.stopReason,
          ...(input.droppedFailedProposalResultCount
            ? {
                droppedFailedProposalResultCount:
                  input.droppedFailedProposalResultCount,
              }
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

      function sanitizeRecoverableMixedProposalResults(results: any[]): any[] {
        return results.map((result) =>
          isRecoverableMixedProposalFailure(result)
            ? {
                ...result,
                message:
                  'Proposed string replacement; unmatched replacement omitted from proposal.',
              }
            : result,
        )
      }

      function sanitizeProposalArtifactsForCapturedBundle(input: {
        toolCalls: { toolName: string; input: any }[]
        rawToolResults: any[]
      }): {
        toolCalls: { toolName: string; input: any }[]
        toolResults: any[]
        droppedFailedProposalResultCount: number
      } {
        const normalizedToolResults = filterIgnorableNoOpProposalFailures(
          dedupeProposalToolResults(
            sanitizeRecoverableMixedProposalResults(input.rawToolResults),
          ),
        )
        const successfulToolResults = normalizedToolResults.filter(
          isSuccessfulProposalToolResult,
        )
        const successfulPaths = new Set(
          successfulToolResults
            .map(getProposalToolResultPath)
            .filter(Boolean),
        )
        const failedToolResults = normalizedToolResults
          .filter(isFailedProposalToolResult)
          .filter((result) => {
            const path = getProposalToolResultPath(result)
            return !path || !successfulPaths.has(path)
          })
        const shouldCaptureSuccessfulSubset =
          successfulToolResults.length > 0 && failedToolResults.length > 0
        const toolResults = shouldCaptureSuccessfulSubset
          ? normalizedToolResults.filter(
              (result) => !isFailedProposalToolResult(result),
            )
          : normalizedToolResults

        const recoverableSanitizedToolCalls =
          sanitizeProposalToolCallsForRecoverableFailures({
            toolCalls: input.toolCalls,
            rawToolResults: input.rawToolResults,
          })
        const toolCalls = shouldCaptureSuccessfulSubset
          ? dropFailedOnlyProposalToolCalls({
              toolCalls: recoverableSanitizedToolCalls,
              successfulToolResults,
              failedToolResults,
            })
          : recoverableSanitizedToolCalls

        return {
          toolCalls,
          toolResults,
          droppedFailedProposalResultCount: shouldCaptureSuccessfulSubset
            ? failedToolResults.length
            : 0,
        }
      }

      function dropFailedOnlyProposalToolCalls(input: {
        toolCalls: { toolName: string; input: any }[]
        successfulToolResults: any[]
        failedToolResults: any[]
      }): { toolName: string; input: any }[] {
        const successfulPaths = new Set(
          input.successfulToolResults
            .map(getProposalToolResultPath)
            .filter(Boolean),
        )
        const failedOnlyPaths = new Set(
          input.failedToolResults
            .map(getProposalToolResultPath)
            .filter(
              (path): path is string =>
                Boolean(path) && !successfulPaths.has(path),
            ),
        )
        if (failedOnlyPaths.size === 0) return input.toolCalls

        return input.toolCalls.filter((toolCall) => {
          const path = getProposalToolCallPath(toolCall)
          return !path || !failedOnlyPaths.has(path)
        })
      }

      function isRecoverableMixedProposalFailure(result: any): boolean {
        return Boolean(
          result &&
          typeof result === 'object' &&
          typeof result.unifiedDiff === 'string' &&
          result.unifiedDiff.trim().length > 0 &&
          typeof result.message === 'string' &&
          getFailedReplacementOldStrings(result.message).length > 0,
        )
      }

      function sanitizeProposalToolCallsForRecoverableFailures(input: {
        toolCalls: { toolName: string; input: any }[]
        rawToolResults: any[]
      }): { toolName: string; input: any }[] {
        const failedOldStringsByPath = getRecoverableFailedOldStringsByPath(
          input.rawToolResults,
        )
        if (failedOldStringsByPath.size === 0) return input.toolCalls

        return input.toolCalls
          .map((toolCall) =>
            sanitizeProposalToolCallForRecoverableFailures(
              toolCall,
              failedOldStringsByPath,
            ),
          )
          .filter(
            (
              toolCall,
            ): toolCall is {
              toolName: string
              input: any
            } => Boolean(toolCall),
          )
      }

      function sanitizeProposalToolCallForRecoverableFailures(
        toolCall: { toolName: string; input: any },
        failedOldStringsByPath: Map<string, Set<string>>,
      ): { toolName: string; input: any } | undefined {
        if (toolCall.toolName !== 'propose_str_replace') return toolCall

        const path = getProposalToolCallPath(toolCall)
        const failedOldStrings = failedOldStringsByPath.get(path)
        if (!failedOldStrings || !Array.isArray(toolCall.input?.replacements)) {
          return toolCall
        }

        const replacements = toolCall.input.replacements.filter(
          (replacement: any) =>
            !replacementMatchesFailedOldString(replacement, failedOldStrings),
        )
        if (replacements.length === 0) return undefined
        if (replacements.length === toolCall.input.replacements.length) {
          return toolCall
        }

        return {
          ...toolCall,
          input: {
            ...toolCall.input,
            replacements,
          },
        }
      }

      function getRecoverableFailedOldStringsByPath(
        rawToolResults: any[],
      ): Map<string, Set<string>> {
        const byPath = new Map<string, Set<string>>()
        for (const result of rawToolResults) {
          if (!isRecoverableMixedProposalFailure(result)) continue

          const path = getProposalToolResultPath(result)
          if (!path) continue

          const failedOldStrings = getFailedReplacementOldStrings(
            result.message,
          )
          if (failedOldStrings.length === 0) continue

          const existing = byPath.get(path) ?? new Set<string>()
          for (const oldString of failedOldStrings) {
            existing.add(oldString)
          }
          byPath.set(path, existing)
        }
        return byPath
      }

      function replacementMatchesFailedOldString(
        replacement: any,
        failedOldStrings: Set<string>,
      ): boolean {
        const oldString = getReplacementOldString(replacement)
        return Boolean(oldString && failedOldStrings.has(oldString))
      }

      function getReplacementOldString(replacement: any): string {
        if (!replacement || typeof replacement !== 'object') return ''
        if (typeof replacement.oldString === 'string') {
          return replacement.oldString
        }
        return typeof replacement.old === 'string' ? replacement.old : ''
      }

      function getFailedReplacementOldStrings(message: string): string[] {
        const failedOldStrings = new Set<string>()
        const quotedPatterns = [
          /old string\s+("(?:\\.|[^"\\])*")\s+was not found/gi,
          /found \d+ occurrences of\s+("(?:\\.|[^"\\])*")/gi,
        ]

        for (const pattern of quotedPatterns) {
          for (const match of message.matchAll(pattern)) {
            const parsed = parseJsonQuotedString(match[1])
            if (parsed) failedOldStrings.add(parsed)
          }
        }

        return [...failedOldStrings]
      }

      function parseJsonQuotedString(value: string | undefined): string {
        if (!value) return ''
        try {
          const parsed = JSON.parse(value)
          return typeof parsed === 'string' ? parsed : ''
        } catch {
          return value.replace(/^"|"$/g, '')
        }
      }

      function filterIgnorableNoOpProposalFailures(results: any[]): any[] {
        const successfulPaths = new Set(
          results
            .filter(isSuccessfulProposalToolResult)
            .map(getProposalToolResultPath)
            .filter(Boolean),
        )
        if (successfulPaths.size === 0) return results

        return results.filter(
          (result) => !isIgnorableNoOpProposalFailure(result, successfulPaths),
        )
      }

      function isIgnorableNoOpProposalFailure(
        result: any,
        successfulPaths: Set<string>,
      ): boolean {
        const failureMessage = getProposalResultFailureMessage(result)
        if (!isNoOpProposalFailureMessage(failureMessage)) return false

        const path = getProposalToolResultPath(result)
        return Boolean(path && successfulPaths.has(path))
      }

      function isNoOpProposalFailureMessage(message: string): boolean {
        return /(?:no change to the file|same as the old content)/i.test(
          message,
        )
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

      function getProposalToolResults(messages: any[]): any[] {
        const results: any[] = []
        for (const message of messages) {
          if (
            message.role !== 'tool' ||
            !Array.isArray(message.content) ||
            (message.toolName !== 'propose_str_replace' &&
              message.toolName !== 'propose_write_file')
          ) {
            continue
          }

          results.push(...getProposalToolResultValues(message.content))
        }
        return results
      }

      function getProposalToolCallsFromMessages(
        messages: any[],
      ): { toolName: string; input: any }[] {
        const toolCalls: { toolName: string; input: any }[] = []
        for (const message of messages) {
          if (message.role !== 'assistant' || !Array.isArray(message.content)) {
            continue
          }
          for (const part of message.content) {
            if (part.type === 'tool-call') {
              if (isProposalToolName(part.toolName)) {
                toolCalls.push({
                  toolName: part.toolName,
                  input: part.input ?? (part as any).args ?? {},
                })
              }
            } else if (part.type === 'text' && typeof part.text === 'string') {
              // Extract XML-formatted <codebuff_tool_call> tool calls from text.
              // This is the compatibility path for OpenAI-compatible providers
              // that produce the documented XML form instead of native tool
              // calls/results.
              const matches = part.text.matchAll(
                /<codebuff_tool_call>([\s\S]*?)<\/codebuff_tool_call>/g,
              )
              for (const match of matches) {
                try {
                  const parsed = JSON.parse(match[1].trim())
                  const toolName = parsed.cb_tool_name
                  if (isProposalToolName(toolName)) {
                    const input = { ...parsed }
                    delete input.cb_tool_name
                    delete input.cb_easp
                    toolCalls.push({
                      toolName,
                      input,
                    })
                  }
                } catch {
                  // Ignore malformed JSON in codebuff_tool_call blocks.
                }
              }
            }
          }
        }
        return dedupeProposalToolCalls(toolCalls)
      }

      function getProposalToolResultValues(toolResult: any): any[] {
        if (!Array.isArray(toolResult)) return []
        const results: any[] = []
        for (const part of toolResult) {
          if (part?.type === 'json' && 'value' in part) {
            results.push(...flattenProposalToolResultValues(part.value))
          }
        }
        return results
      }

      function isSuccessfulProposalToolResult(result: any): boolean {
        return Boolean(
          result &&
          typeof result === 'object' &&
          'unifiedDiff' in result &&
          typeof result.unifiedDiff === 'string' &&
          result.unifiedDiff.trim().length > 0 &&
          !getProposalResultFailureMessage(result),
        )
      }

      function isFailedProposalToolResult(result: any): boolean {
        return Boolean(getProposalResultFailureMessage(result))
      }

      function getProposalResultFailureMessage(result: any): string {
        if (!result || typeof result !== 'object') return ''
        if (
          typeof result.errorMessage === 'string' &&
          result.errorMessage.trim().length > 0
        ) {
          return result.errorMessage.trim()
        }
        if (
          typeof result.error === 'string' &&
          result.error.trim().length > 0
        ) {
          return result.error.trim()
        }
        if (
          typeof result.message === 'string' &&
          isFailureLikeProposalMessage(result.message)
        ) {
          return result.message.trim()
        }
        return ''
      }

      function isFailureLikeProposalMessage(message: string): boolean {
        return /(?:old string[\s\S]*not found|was not found|no change to the file|skipping|found \d+ occurrences|failed|error|does not exist|same as the old content)/i.test(
          message,
        )
      }

      function getMessagesSinceLastProposalRetry(messages: any[]): any[] {
        const lastRetryIndex = messages.findLastIndex(
          (message) =>
            Array.isArray(message?.tags) &&
            message.tags.includes('PROPOSAL_RETRY'),
        )
        return lastRetryIndex === -1
          ? messages
          : messages.slice(lastRetryIndex + 1)
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
            ? flattenProposalToolResultValues(part.value)
            : []
        })
      }

      function hasCurrentReadOnlyToolResult(toolResult: any): boolean {
        return getReadOnlyToolResultValues(toolResult).length > 0
      }

      function isReadOnlyToolName(toolName: any): boolean {
        return (
          toolName === 'read_files' ||
          toolName === 'code_search' ||
          toolName === 'glob' ||
          toolName === 'list_directory'
        )
      }

      function isProposalToolName(toolName: any): boolean {
        return (
          toolName === 'propose_str_replace' ||
          toolName === 'propose_write_file'
        )
      }

      function dedupeProposalToolResults(results: any[]): any[] {
        const seen = new Set<string>()
        const deduped: any[] = []
        for (const result of results) {
          const key = getProposalToolResultKey(result)
          if (key && seen.has(key)) continue
          if (key) seen.add(key)
          deduped.push(result)
        }
        return deduped
      }

      function getProposalToolResultKey(result: any): string {
        if (!result || typeof result !== 'object') return ''
        const file = typeof result.file === 'string' ? result.file : ''
        const unifiedDiff =
          typeof result.unifiedDiff === 'string' ? result.unifiedDiff : ''
        const errorMessage =
          typeof result.errorMessage === 'string' ? result.errorMessage : ''
        const error = typeof result.error === 'string' ? result.error : ''
        const message = typeof result.message === 'string' ? result.message : ''
        if (!file && !unifiedDiff && !errorMessage && !error && !message) {
          return ''
        }
        return [file, unifiedDiff, errorMessage, error, message].join('\0')
      }

      function dedupeProposalToolCalls(
        toolCalls: { toolName: string; input: any }[],
      ): { toolName: string; input: any }[] {
        const seen = new Set<string>()
        const deduped: { toolName: string; input: any }[] = []
        for (const toolCall of toolCalls) {
          const key = getProposalToolCallKey(toolCall)
          if (key && seen.has(key)) continue
          if (key) seen.add(key)
          deduped.push(toolCall)
        }
        return deduped
      }

      function getProposalToolCallKey(toolCall: {
        toolName: string
        input: any
      }): string {
        try {
          return `${toolCall.toolName}\0${JSON.stringify(toolCall.input)}`
        } catch {
          return toolCall.toolName
        }
      }

      function flattenProposalToolResultValues(value: any): any[] {
        if (Array.isArray(value)) {
          return value.flatMap(flattenProposalToolResultValues)
        }
        if (
          value &&
          typeof value === 'object' &&
          value.type === 'json' &&
          'value' in value
        ) {
          return flattenProposalToolResultValues(value.value)
        }
        return value === undefined || value === null ? [] : [value]
      }

      function buildProposalRetryPrompt(proposalToolResults: any[]): string {
        const failureDetails = proposalToolResults
          .map((result) =>
            result && typeof result === 'object'
              ? getProposalResultFailureMessage(result)
              : '',
          )
          .filter(Boolean)
          .join('\n\n')

        const contextInstruction = canUseReadOnlyTools
          ? 'Immediately gather exact context with read_files/code_search/glob/list_directory if needed, then emit every required file edit as valid XML proposal tool calls.'
          : 'Do not try to gather more context. Use the supplied proposalContext/current file context and emit every required file edit as valid XML proposal tool calls.'
        const staleTextInstruction = canUseReadOnlyTools
          ? 'If a propose_str_replace oldString failed, inspect the current file and use exact current text. If the full target file content is available and exact replacement remains brittle, use propose_write_file with the complete updated file content.'
          : 'If a propose_str_replace oldString failed, use exact current text only when it appears in the supplied context. If exact replacement remains brittle, use propose_write_file with complete updated file content from the supplied context.'

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
const definition = {
  ...createBestOfNImplementor({ model: 'opus' }),
  id: 'editor-implementor',
}
export default definition
