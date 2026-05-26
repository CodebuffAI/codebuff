import { publisher } from '../../constants'

import type { AgentStepContext, ToolCall } from '../../types/agent-definition'
import type { SecretAgentDefinition } from '../../types/secret-agent-definition'

/**
 * Creates a multi-prompt editor agent that spawns one implementor per prompt.
 * Each prompt specifies a slightly different implementation strategy/approach.
 * Uses propose_* tools to draft changes, then applies the chosen implementation.
 */
export function createMultiPromptEditor(): Omit<SecretAgentDefinition, 'id'> {
  return {
    publisher,
    model: 'anthropic/claude-opus-4.7',
    providerOptions: {
      only: ['amazon-bedrock'],
    },
    displayName: 'Multi-Prompt Editor',
    spawnerPrompt:
      'Edits code by spawning multiple implementor agents with different strategy prompts, selects the best implementation, and applies the changes. It also returns further suggested improvements which you should take seriously and act on. Pass as input an array of short prompts specifying different implementation approaches or strategies. Make sure to read any files intended to be edited before spawning this agent.',

    includeMessageHistory: true,
    inheritParentSystemPrompt: true,

    toolNames: [
      'spawn_agents',
      'read_files',
      'code_search',
      'str_replace',
      'write_file',
      'set_messages',
      'set_output',
    ],
    spawnableAgents: [
      'best-of-n-selector2',
      'editor-implementor-proposal-1',
      'editor-implementor-proposal-2',
      'editor-implementor-proposal-3',
      'editor-implementor-proposal-4',
      'editor-implementor-proposal-5',
      'editor-implementor-opus',
      'editor-implementor-gpt-5',
    ],

    inputSchema: {
      params: {
        type: 'object',
        properties: {
          prompts: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Array of short prompts, each specifying a slightly different implementation strategy or approach. Example: ["use a cache for the data", "don\t cache anything", "make the minimal possible changes", "modularize your solution by creating new files"]',
          },
        },
        required: ['prompts'],
      },
    },
    outputMode: 'structured_output',

    handleSteps: handleStepsMultiPrompt,
  }
}

function* handleStepsMultiPrompt({
  agentState,
  params,
}: AgentStepContext): ReturnType<
  NonNullable<SecretAgentDefinition['handleSteps']>
> {
  const prompts = (params?.prompts as string[] | undefined) ?? []

  if (prompts.length === 0) {
    yield {
      toolName: 'set_output',
      input: {
        error: 'No prompts provided. Please pass an array of strategy prompts.',
      },
    } satisfies ToolCall<'set_output'>
    return
  }

  // Keep the parent task context, but remove this agent's own prompt/instruction
  // scaffolding plus stale internal best-of-N traces from previous attempts.
  const { messageHistory: initialMessageHistory } = agentState
  let userMessageIndex = initialMessageHistory.length

  while (userMessageIndex > 0) {
    const message = initialMessageHistory[userMessageIndex - 1]
    if (isTrailingScaffoldMessage(message)) {
      userMessageIndex--
    } else {
      break
    }
  }
  const updatedMessageHistory = removeInternalBestOfNMessages(
    initialMessageHistory.slice(0, userMessageIndex),
  )
  yield {
    toolName: 'set_messages',
    input: {
      messages: updatedMessageHistory,
    },
    includeToolCall: false,
  } satisfies ToolCall<'set_messages'>

  const proposalAgentTypes = [
    'editor-implementor-proposal-1',
    'editor-implementor-proposal-2',
    'editor-implementor-proposal-3',
    'editor-implementor-proposal-4',
    'editor-implementor-proposal-5',
  ] as const

  type ProposedToolCall = { toolName: string; input: any }
  type ProposalResult = {
    toolCalls: ProposedToolCall[]
    toolResults?: any[]
    unifiedDiffs?: string
    errorMessage?: string
    stopReason?: string
    proposalBudget?: {
      maxProposalSteps: number
      maxReadOnlyOnlySteps: number
      maxBundleProposalTurns?: number
      expectedTouchedFileCount?: number
      complexity: string
      hasPrefetchedContext: boolean
      evidence: string[]
    }
  }
  type ProposalFailure = {
    errorMessage?: string
    error?: string
    message?: string
    type?: string
  }
  type Implementation = {
    id: string
    strategy: string
    content: string
    toolCalls: ProposedToolCall[]
    stopReason?: string
    proposalBudget?: ProposalResult['proposalBudget']
    partial?: boolean
  }

  // Spawn proposal implementors sequentially. The parallel batch was fast with
  // the hosted backend, but local OpenAI-compatible/OAuth providers often have
  // low per-account concurrency; when one stream stalls the whole Promise.all
  // batch waits forever. Sequential spawning is slower but much more reliable,
  // and the per-proposal retry below prevents one flaky model call from losing
  // the entire best-of-N run.
  const spawnedImplementations: ProposalResult[] = []
  const maxProposalAttempts = 3
  const prefetchedContextMessages = yield* gatherProposalContextMessages({
    messageHistory: updatedMessageHistory,
    prompts,
  })
  const proposalMessageHistory =
    prefetchedContextMessages.length > 0
      ? [...updatedMessageHistory, ...prefetchedContextMessages]
      : updatedMessageHistory
  const proposalRequestContext = buildProposalRequestContext({
    messageHistory: proposalMessageHistory,
    prompts,
  })
  const proposalRequirements =
    'Produce a complete multi-file implementation proposal using the supplied proposalContext/current file context. If exact current code is missing, you may use read_files, code_search, glob, or list_directory for bounded read-only context gathering only. Then emit all required propose_str_replace/propose_write_file calls as one complete proposal bundle; use one propose_* call per edited file when needed. After every required edit has been proposed, write the exact marker PROPOSAL_BUNDLE_COMPLETE. Do not write that marker if any requested edit is missing. Never call write_file, str_replace, spawn_agents, set_output, or any other mutating/control tool. Keep visible narration short; use your reasoning internally. Use exact current text for propose_str_replace oldString values only when present in supplied/read context. If exact replacements are brittle or full target file content is available, use propose_write_file with complete updated file content.'

  for (const [index, prompt] of prompts.entries()) {
    const agentType =
      proposalAgentTypes[index] ??
      proposalAgentTypes[proposalAgentTypes.length - 1]
    let lastResult: ProposalResult | ProposalFailure | undefined

    for (let attempt = 0; attempt < maxProposalAttempts; attempt++) {
      const { toolResult: implementorResults } = yield {
        toolName: 'spawn_agents',
        input: {
          agents: [
            {
              agent_type: agentType,
              prompt: buildProposalPrompt({
                strategy: prompt,
                attempt,
              }),
              params: buildProposalParams({
                strategy: prompt,
                requestContext: proposalRequestContext,
                attempt,
                lastResult,
              }),
            },
          ],
        },
        includeToolCall: false,
      } satisfies ToolCall<'spawn_agents'>

      lastResult = extractSpawnResults<ProposalResult | ProposalFailure>(
        implementorResults,
      )[0]

      if (isUsableProposal(lastResult)) {
        break
      }

      if (shouldStopProposalRetries(lastResult)) {
        break
      }
    }

    spawnedImplementations.push(
      isUsableProposal(lastResult)
        ? {
            toolCalls: getUsableProposalToolCalls(lastResult),
            toolResults: getUsableProposalToolResultsFromResult(lastResult),
            unifiedDiffs:
              typeof lastResult.unifiedDiffs === 'string'
                ? lastResult.unifiedDiffs
                : '',
            stopReason: lastResult.stopReason,
            proposalBudget: lastResult.proposalBudget,
          }
        : {
            toolCalls: [],
            toolResults: [],
            errorMessage:
              summarizeProposalFailure(lastResult) ||
              'Proposal failed to return a usable implementation',
            unifiedDiffs:
              summarizeProposalFailure(lastResult) ||
              'Error: proposal failed to return a usable implementation',
          },
    )
  }

  // Build implementations for selector using the unified diffs
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  const implementations: Implementation[] = spawnedImplementations.map(
    (result, index) => {
      const toolCalls = getUsableProposalToolCalls(result)
      const hasUsableEdits = toolCalls.length > 0
      const proposalStatus = formatProposalStatus(result)

      return {
        id: letters[index],
        strategy: prompts[index] ?? 'unknown',
        content: hasUsableEdits
          ? [
              result.unifiedDiffs || summarizeProposalToolCalls(toolCalls),
              proposalStatus,
            ]
              .filter(Boolean)
              .join('\n\n')
          : `Unusable proposal: ${
              summarizeProposalFailure(result) ||
              'No applicable edit tool calls were produced.'
            }`,
        toolCalls,
        stopReason: result.stopReason,
        proposalBudget: result.proposalBudget,
        partial: isPartialProposalResult(result),
      }
    },
  )

  const usableImplementations = rankImplementationsForSelection(
    implementations.filter(isUsableImplementation),
  )

  if (usableImplementations.length === 0) {
    yield {
      toolName: 'set_output',
      input: {
        error: buildNoUsableProposalError(implementations),
      },
      includeToolCall: false,
    } satisfies ToolCall<'set_output'>
    return
  }
  const selectorImplementations =
    getSelectorCandidateImplementations(usableImplementations)
  const selectorRequestContext = buildSelectorRequestContext({
    messageHistory: proposalMessageHistory,
    prompts,
  })
  const selectorPresentation = buildSelectorPresentation({
    implementations: selectorImplementations,
    requestContext: selectorRequestContext,
  })

  // Spawn selector with implementations (showing unified diffs for review).
  // Retry the selector once if the first attempt fails to return a valid
  // implementationId. The selector model (gpt-5.5) can occasionally produce
  // output that fails schema validation, and a single retry is cheap compared
  // to losing the entire best-of-N run.
  const maxSelectorAttempts = 2
  let selectorOutput:
    | {
        implementationId: string
        reason: string
        suggestedImprovements: string
      }
    | undefined

  for (
    let selectorAttempt = 0;
    selectorAttempt < maxSelectorAttempts;
    selectorAttempt++
  ) {
    const { toolResult: selectorResult } = yield {
      toolName: 'spawn_agents',
      input: {
        agents: [
          {
            agent_type: 'best-of-n-selector2',
            params: {
              requestContext: selectorRequestContext,
              implementations: selectorPresentation.implementations.map(
                ({ selectorId, implementation }) => ({
                  id: selectorId,
                  strategy: implementation.strategy,
                  content: implementation.content,
                }),
              ),
            },
          },
        ],
      },
      includeToolCall: false,
    } satisfies ToolCall<'spawn_agents'>

    const candidate = extractSpawnResults<{
      implementationId: string
      reason: string
      suggestedImprovements: string
    }>(selectorResult)[0]

    if (isObject(candidate) && typeof candidate.implementationId === 'string') {
      selectorOutput = {
        implementationId: candidate.implementationId,
        reason:
          typeof candidate.reason === 'string'
            ? candidate.reason
            : 'Selector returned a valid implementation id.',
        suggestedImprovements:
          typeof candidate.suggestedImprovements === 'string'
            ? candidate.suggestedImprovements
            : '',
      }
      break
    }
  }

  const fallbackImplementation = selectorImplementations[0]

  if (!selectorOutput) {
    yield* applyImplementation({
      chosenImplementation: fallbackImplementation,
      reason:
        `Selector failed to return an implementation; applied the highest-ranked usable proposal (${fallbackImplementation.id}) instead.`,
      suggestedImprovements:
        'The selector model failed. Check its provider quota/credentials or route editor-selector to a local/OpenAI-compatible model.',
    })
    return
  }

  const { implementationId } = selectorOutput
  const selectedImplementationId =
    selectorPresentation.idMap.get(implementationId) ?? implementationId
  let chosenImplementation = selectorImplementations.find(
    (implementation) => implementation.id === selectedImplementationId,
  )

  if (!chosenImplementation) {
    yield* applyImplementation({
      chosenImplementation: fallbackImplementation,
      reason: `Selector chose unknown, unusable, or filtered implementation ${implementationId}; applied the highest-ranked usable proposal (${fallbackImplementation.id}) instead.`,
      suggestedImprovements: selectorOutput.suggestedImprovements,
    })
    return
  }

  // Extract suggested improvements from selector output
  const { reason, suggestedImprovements } = selectorOutput

  const implementationToApply =
    (yield* maybeRefineSelectedImplementation({
      chosenImplementation,
      reason,
      suggestedImprovements,
    })) ?? chosenImplementation

  yield* applyImplementation({
    chosenImplementation: implementationToApply,
    reason:
      chosenImplementation.id === selectedImplementationId
        ? reason
        : `${reason}\n\nSelector chose an unusable implementation, so the first usable proposal was applied instead.`,
    suggestedImprovements,
  })

  function* maybeRefineSelectedImplementation(params: {
    chosenImplementation: Implementation
    reason: string
    suggestedImprovements: string
  }): Generator<ToolCall<'spawn_agents'>, Implementation | undefined, any> {
    const { chosenImplementation, reason, suggestedImprovements } = params
    if (
      !shouldRefineSelectedImplementation(
        chosenImplementation,
        suggestedImprovements,
      )
    ) {
      return undefined
    }

    const { toolResult: synthesisResults } = yield {
      toolName: 'spawn_agents',
      input: {
        agents: [
          {
            agent_type: 'editor-implementor-proposal-1',
            prompt: 'Synthesis: selected proposal plus selector improvements',
            params: {
              proposalStrategy:
                'Synthesize the selected proposal with useful ideas from the selector review.',
              proposalContext: buildSynthesisProposalContext({
                chosenImplementation,
                reason,
                suggestedImprovements,
              }),
              proposalRequirements:
                'Return one complete, self-contained proposal that incorporates the selected implementation and any concrete selector improvements that are truly useful. Use the supplied proposalContext/current file context; if exact current code is missing, use bounded read-only tools only. Then emit one complete proposal bundle with all required propose_str_replace/propose_write_file calls, and write PROPOSAL_BUNDLE_COMPLETE only when every requested edit is covered. Never call write_file, str_replace, spawn_agents, set_output, or any other mutating/control tool.',
              previousFailure:
                'This is a synthesis pass, not a retry. Re-emit the complete final edit proposal; do not assume earlier proposal tool calls will be applied.',
              allowReadOnlyTools: true,
              proposalBundleMode: true,
              proposalTimeoutMs: getProposalTimeoutMsForContext(
                buildSynthesisProposalContext({
                  chosenImplementation,
                  reason,
                  suggestedImprovements,
                }),
              ),
            },
          },
        ],
      },
      includeToolCall: false,
    } satisfies ToolCall<'spawn_agents'>

    const synthesisResult = extractSpawnResults<
      ProposalResult | ProposalFailure
    >(synthesisResults)[0]

    if (!isUsableProposal(synthesisResult)) {
      return undefined
    }

    return {
      id: `${chosenImplementation.id}+S`,
      strategy: `${chosenImplementation.strategy} (selector-refined)`,
      content: synthesisResult.unifiedDiffs || chosenImplementation.content,
      toolCalls: getUsableProposalToolCalls(synthesisResult),
      stopReason: synthesisResult.stopReason,
      proposalBudget: synthesisResult.proposalBudget,
      partial: isPartialProposalResult(synthesisResult),
    }
  }

  function shouldRefineSelectedImplementation(
    chosenImplementation: Implementation,
    suggestedImprovements: string,
  ): boolean {
    return (
      isUsableImplementation(chosenImplementation) &&
      suggestedImprovements.trim().length > 0
    )
  }

  function buildSynthesisProposalContext(params: {
    chosenImplementation: Implementation
    reason: string
    suggestedImprovements: string
  }): string {
    const { chosenImplementation, reason, suggestedImprovements } = params
    const alternateImplementations = implementations
      .filter(
        (implementation) =>
          implementation.id !== chosenImplementation.id &&
          isUsableImplementation(implementation),
      )
      .map(
        (implementation) =>
          `Implementation ${implementation.id} (${implementation.strategy}):\n${truncateText(
            implementation.content,
            8_000,
          )}`,
      )
      .join('\n\n')

    return truncateText(
      [
        'Original request and file/search context:',
        proposalRequestContext,
        '',
        `Selected implementation ${chosenImplementation.id} (${chosenImplementation.strategy}):`,
        truncateText(chosenImplementation.content, 16_000),
        '',
        'Selector reason:',
        reason,
        '',
        'Selector suggested improvements to incorporate when concrete and correct:',
        suggestedImprovements,
        '',
        alternateImplementations
          ? `Other usable proposal diffs for useful ideas:\n${alternateImplementations}`
          : '',
      ]
        .filter(Boolean)
        .join('\n'),
      80_000,
    )
  }

  /**
   * Extracts the array of subagent results from spawn_agents tool output.
   * When a subagent's structured output is null/undefined (e.g. set_output
   * validation failed or was never called), returns an error sentinel object
   * instead of silently dropping the result.
   */
  function extractSpawnResults<T>(results: any[] | undefined): T[] {
    if (!results || results.length === 0) return []

    const rawValues = results.flatMap((result) =>
      isJsonToolResultPart(result) ? [result.value] : [result],
    )

    return rawValues.flatMap((rawValue) => {
      const spawnedResults = Array.isArray(rawValue) ? rawValue : [rawValue]
      return spawnedResults.map((spawnedResult: any) => {
        const unwrapped = unwrapSpawnResult(spawnedResult)
        return (unwrapped ?? {
          errorMessage: 'Agent did not produce output',
        }) as T
      })
    })
  }

  function unwrapSpawnResult(result: any): any {
    let current = result
    for (let depth = 0; depth < 4; depth++) {
      if (!isObject(current) || !isSpawnResultWrapper(current)) {
        return current
      }
      current = current.value
    }
    return current
  }

  function isSpawnResultWrapper(value: Record<string, any>): boolean {
    if (!('value' in value)) return false
    if (isJsonToolResultPart(value)) return true
    if (isSpawnAgentReport(value)) return true
    if (value.type === 'structuredOutput') return true
    if (value.type === 'lastMessage') return true
    return Object.keys(value).every((key) => key === 'value')
  }

  function isSpawnAgentReport(value: Record<string, any>): boolean {
    return (
      typeof value.agentName === 'string' || typeof value.agentType === 'string'
    )
  }

  function isJsonToolResultPart(
    value: unknown,
  ): value is { type: 'json'; value: any } {
    return isObject(value) && value.type === 'json' && 'value' in value
  }

  function isObject(value: unknown): value is Record<string, any> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
  }

  function isUsableProposal(
    result: ProposalResult | ProposalFailure | undefined,
  ): result is ProposalResult {
    if (
      !isObject(result) ||
      !('toolCalls' in result) ||
      !Array.isArray(result.toolCalls) ||
      result.toolCalls.length === 0
    ) {
      return false
    }

    const usableToolCalls = getUsableProposalToolCalls(result)
    if (usableToolCalls.length === 0) {
      return false
    }

    // Accept proposals that have a valid unified diff, even when individual
    // toolResults are missing. XML-parsed tool calls can produce a valid
    // unifiedDiffs string without populating the toolResults array. The tool
    // calls still must be applyable; a diff alone cannot be applied by the
    // parent workflow.
    const hasValidDiffs =
      typeof result.unifiedDiffs === 'string' &&
      result.unifiedDiffs.trim().length > 0

    const proposalToolResults = getUsableProposalToolResultsFromResult(result)
    const failedToolResults = proposalToolResults.filter(isFailedEditResult)
    if (failedToolResults.length > 0) {
      return false
    }

    const successfulToolResults = proposalToolResults.filter(
      isSuccessfulEditResult,
    )
    const hasSuccessfulToolResults = successfulToolResults.length > 0

    return hasValidDiffs || hasSuccessfulToolResults || usableToolCalls.length > 0
  }

  function getUsableProposalToolCalls(
    result: ProposalResult | ProposalFailure | undefined,
  ): ProposedToolCall[] {
    if (
      !isObject(result) ||
      !('toolCalls' in result) ||
      !Array.isArray(result.toolCalls)
    ) {
      return []
    }

    const toolCalls = result.toolCalls.filter(isProposalEditToolCall)
    return sanitizeProposalToolCallsForRecoverableFailures({
      toolCalls,
      rawToolResults: getProposalResultToolResults(result),
    }).filter(isProposalEditToolCall)
  }

  function isUsableImplementation(implementation: Implementation): boolean {
    return implementation.toolCalls.some(isProposalEditToolCall)
  }

  function getSelectorCandidateImplementations(
    implementations: Implementation[],
  ): Implementation[] {
    const cleanImplementations = implementations.filter(
      (implementation) => !isPartialImplementation(implementation),
    )
    return cleanImplementations.length > 0
      ? cleanImplementations
      : implementations
  }

  function buildSelectorPresentation(params: {
    implementations: Implementation[]
    requestContext: string
  }): {
    implementations: Array<{
      selectorId: string
      implementation: Implementation
    }>
    idMap: Map<string, string>
  } {
    const implementations = orderImplementationsForSelectorPresentation(
      params.implementations,
      params.requestContext,
    ).map((implementation, index) => ({
      selectorId: `candidate-${index + 1}`,
      implementation,
    }))

    return {
      implementations,
      idMap: new Map(
        implementations.map(({ selectorId, implementation }) => [
          selectorId,
          implementation.id,
        ]),
      ),
    }
  }

  function orderImplementationsForSelectorPresentation(
    implementations: Implementation[],
    requestContext: string,
  ): Implementation[] {
    if (implementations.length <= 1) {
      return implementations
    }

    const ordered = implementations
      .map((implementation, index) => ({
        implementation,
        index,
        hash: hashSelectorPresentationSeed(
          [
            requestContext,
            implementation.id,
            implementation.strategy,
            implementation.content.slice(0, 4_000),
          ].join('\n'),
        ),
      }))
      .sort((a, b) => a.hash - b.hash || a.index - b.index)
      .map(({ implementation }) => implementation)

    // Keep the ranked implementation order for fallback, but do not let the
    // selector see the highest-ranked candidate first on every run. This
    // reduces "first item"/"A" anchoring for weaker selector models while
    // preserving deterministic behavior for a given set of proposals.
    if (ordered[0] === implementations[0]) {
      return [...ordered.slice(1), ordered[0]]
    }

    return ordered
  }

  function hashSelectorPresentationSeed(value: string): number {
    let hash = 2166136261
    for (let index = 0; index < value.length; index++) {
      hash ^= value.charCodeAt(index)
      hash = Math.imul(hash, 16777619)
    }
    return hash >>> 0
  }

  function rankImplementationsForSelection(
    implementations: Implementation[],
  ): Implementation[] {
    return implementations
      .map((implementation, index) => ({
        implementation,
        index,
        score: scoreImplementationForSelection(implementation),
      }))
      .sort((a, b) => b.score - a.score || a.index - b.index)
      .map(({ implementation }) => implementation)
  }

  function scoreImplementationForSelection(
    implementation: Implementation,
  ): number {
    const changedFileCount = new Set(
      extractImplementationFilePaths(implementation),
    ).size
    const editCallCount = implementation.toolCalls.filter(
      isProposalEditToolCall,
    ).length
    const contentScore = Math.min(implementation.content.length, 20_000) / 100

    return (
      (isPartialImplementation(implementation) ? -10_000 : 10_000) +
      (implementation.stopReason === 'cleanProposal' ? 1_000 : 0) +
      changedFileCount * 200 +
      editCallCount * 25 +
      contentScore
    )
  }

  function isPartialProposalResult(result: ProposalResult): boolean {
    return isPartialStopReason(result.stopReason)
  }

  function isPartialImplementation(implementation: Implementation): boolean {
    return (
      implementation.partial === true ||
      isPartialStopReason(implementation.stopReason)
    )
  }

  function isPartialStopReason(stopReason: unknown): boolean {
    return (
      stopReason === 'bundleCap' ||
      stopReason === 'stepBudget' ||
      stopReason === 'noCompletionSignal'
    )
  }

  function formatProposalStatus(result: ProposalResult): string {
    const stopReason =
      typeof result.stopReason === 'string' ? result.stopReason : ''
    if (!isPartialStopReason(stopReason)) {
      return ''
    }

    const budget = result.proposalBudget
    const budgetText = budget
      ? ` (${[
          `maxProposalSteps=${budget.maxProposalSteps}`,
          `maxBundleProposalTurns=${budget.maxBundleProposalTurns ?? 'n/a'}`,
          `expectedTouchedFileCount=${budget.expectedTouchedFileCount ?? 'n/a'}`,
          `complexity=${budget.complexity}`,
        ].join(', ')})`
      : ''
    return `Proposal status: partial; stopped by ${stopReason}${budgetText}. Do not apply directly. Complete or repair this proposal first.`
  }

  function shouldStopProposalRetries(
    result: ProposalResult | ProposalFailure | undefined,
  ): boolean {
    const failure = summarizeProposalFailure(result).toLowerCase()
    return (
      failure.includes('timed out') ||
      failure.includes('run cancelled by user') ||
      failure.includes('aborted')
    )
  }

  function isProposalEditToolCall(toolCall: ProposedToolCall): boolean {
    if (!isObject(toolCall) || !isObject(toolCall.input)) return false
    if (toolCall.toolName === 'propose_str_replace') {
      return (
        typeof toolCall.input.path === 'string' &&
        Array.isArray(toolCall.input.replacements) &&
        toolCall.input.replacements.length > 0
      )
    }
    if (toolCall.toolName === 'propose_write_file') {
      return (
        typeof toolCall.input.path === 'string' &&
        typeof toolCall.input.content === 'string'
      )
    }
    return false
  }

  function getProposalResultToolResults(
    result: ProposalResult | ProposalFailure | undefined,
  ): any[] {
    if (!isObject(result) || !('toolResults' in result)) return []
    return flattenToolResultValues(
      Array.isArray(result.toolResults)
        ? result.toolResults
        : [result.toolResults],
    )
  }

  function getUsableProposalToolResultsFromResult(
    result: ProposalResult | ProposalFailure | undefined,
  ): any[] {
    return filterIgnorableNoOpEditFailures(
      sanitizeRecoverableMixedEditResults(getProposalResultToolResults(result)),
    )
  }

  function isSuccessfulEditResult(result: any): boolean {
    return Boolean(
      result &&
      typeof result === 'object' &&
      typeof result.unifiedDiff === 'string' &&
      result.unifiedDiff.trim().length > 0 &&
      !getEditResultFailureMessage(result),
    )
  }

  function isFailedEditResult(result: any): boolean {
    return Boolean(getEditResultFailureMessage(result))
  }

  function getEditResultFailureMessage(result: any): string {
    if (!result || typeof result !== 'object') return ''
    if (
      typeof result.errorMessage === 'string' &&
      result.errorMessage.trim().length > 0
    ) {
      return result.errorMessage.trim()
    }
    if (typeof result.error === 'string' && result.error.trim().length > 0) {
      return result.error.trim()
    }
    if (
      typeof result.message === 'string' &&
      isFailureLikeEditResultMessage(result.message)
    ) {
      return result.message.trim()
    }
    return ''
  }

  function isFailureLikeEditResultMessage(message: string): boolean {
    return /(?:old string[\s\S]*not found|was not found|no change to the file|skipping|found \d+ occurrences|failed|error|does not exist|same as the old content)/i.test(
      message,
    )
  }

  function filterIgnorableNoOpEditFailures(results: any[]): any[] {
    const successfulPaths = new Set(
      results
        .filter(isSuccessfulEditResultForNoOpFiltering)
        .map(getEditResultPath)
        .filter(Boolean),
    )
    if (successfulPaths.size === 0) return results

    return results.filter(
      (result) => !isIgnorableNoOpEditFailure(result, successfulPaths),
    )
  }

  function isIgnorableNoOpEditFailure(
    result: any,
    successfulPaths: Set<string>,
  ): boolean {
    const failureMessage = getEditResultFailureMessage(result)
    if (!isNoOpEditFailureMessage(failureMessage)) return false

    const path = getEditResultPath(result)
    return Boolean(path && successfulPaths.has(path))
  }

  function isNoOpEditFailureMessage(message: string): boolean {
    return /(?:no change to the file|same as the old content)/i.test(message)
  }

  function getEditResultPath(result: any): string {
    if (!result || typeof result !== 'object') return ''
    if (typeof result.file === 'string') return result.file
    return typeof result.path === 'string' ? result.path : ''
  }

  function isSuccessfulEditResultForNoOpFiltering(result: any): boolean {
    return Boolean(
      result &&
        typeof result === 'object' &&
        getEditResultPath(result) &&
        !getEditResultFailureMessage(result),
    )
  }

  function sanitizeRecoverableMixedEditResults(results: any[]): any[] {
    return results.map((result) =>
      isRecoverableMixedEditFailure(result)
        ? {
            ...result,
            message:
              'Proposed string replacement; unmatched replacement omitted from proposal.',
          }
        : result,
    )
  }

  function isRecoverableMixedEditFailure(result: any): boolean {
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
    toolCalls: ProposedToolCall[]
    rawToolResults: any[]
  }): ProposedToolCall[] {
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
      .filter((toolCall): toolCall is ProposedToolCall => Boolean(toolCall))
  }

  function sanitizeProposalToolCallForRecoverableFailures(
    toolCall: ProposedToolCall,
    failedOldStringsByPath: Map<string, Set<string>>,
  ): ProposedToolCall | undefined {
    if (toolCall.toolName !== 'propose_str_replace') return toolCall

    const path =
      isObject(toolCall.input) && typeof toolCall.input.path === 'string'
        ? toolCall.input.path
        : ''
    const failedOldStrings = failedOldStringsByPath.get(path)
    if (!failedOldStrings || !Array.isArray(toolCall.input.replacements)) {
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
      if (!isRecoverableMixedEditFailure(result)) continue

      const path = getEditResultPath(result)
      if (!path) continue

      const failedOldStrings = getFailedReplacementOldStrings(result.message)
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
    if (typeof replacement.oldString === 'string') return replacement.oldString
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

  function buildProposalPrompt(params: {
    strategy: string
    attempt: number
  }): string {
    const { strategy, attempt } = params

    // Keep this prompt short because the CLI renders it in the proposal card.
    // Full task/file context is passed through params.proposalContext, which the
    // model still receives but the UI does not display as the card subtitle.
    return `${attempt === 0 ? 'Strategy' : 'Retry Strategy'}: ${strategy}`
  }

  function buildProposalParams(params: {
    strategy: string
    requestContext: string
    attempt: number
    lastResult: ProposalResult | ProposalFailure | undefined
  }): Record<string, any> {
    const { strategy, requestContext, attempt, lastResult } = params
    const previousFailure =
      attempt > 0
        ? summarizeProposalFailure(lastResult) ||
          'The previous proposal attempt did not return a usable diff.'
        : ''

    return {
      proposalStrategy: strategy,
      proposalContext: requestContext,
      proposalRequirements,
      allowReadOnlyTools: true,
      proposalBundleMode: true,
      proposalTimeoutMs: getProposalTimeoutMsForContext(requestContext),
      ...(previousFailure && { previousFailure }),
    }
  }

  function getProposalTimeoutMsForContext(context: string): number {
    const referencedFileCount = extractLikelyFilePaths([context]).length
    if (referencedFileCount >= 5 || context.length > 60_000) {
      return 300_000
    }
    if (referencedFileCount >= 2 || context.length > 20_000) {
      return 240_000
    }
    return 180_000
  }

  function* gatherProposalContextMessages(params: {
    messageHistory: any[]
    prompts: string[]
  }): Generator<ToolCall<'read_files'> | ToolCall<'code_search'>, any[], any> {
    const { messageHistory, prompts } = params
    const seedTexts = [
      ...prompts,
      ...messageHistory
        .filter(
          (message) =>
            message?.role === 'user' && !isInternalBestOfNMessage(message),
        )
        .map((message) => formatUserRequest(message, 12_000)),
    ].filter((text) => typeof text === 'string' && text.trim().length > 0)

    if (seedTexts.length === 0) return []

    const contextMessages: any[] = []
    const readPaths = new Set<string>()
    const directPaths = extractLikelyFilePaths(seedTexts).slice(0, 12)

    if (directPaths.length > 0) {
      const { toolResult } = yield {
        toolName: 'read_files',
        input: { paths: directPaths },
        includeToolCall: false,
      } satisfies ToolCall<'read_files'>
      appendToolContextMessage(contextMessages, 'read_files', toolResult)
      directPaths.forEach((path) => readPaths.add(path))
    }

    const discoveredPaths: string[] = []
    for (const pattern of extractLikelySearchPatterns(seedTexts).slice(0, 6)) {
      const { toolResult } = yield {
        toolName: 'code_search',
        input: {
          pattern: escapeRipgrepLiteral(pattern),
          flags:
            '-n -g *.ts -g *.tsx -g *.js -g *.jsx -g *.json -g *.md -g *.mdx -g !node_modules -g !debug -g !dist -g !.git',
          maxResults: 8,
        },
        includeToolCall: false,
      } satisfies ToolCall<'code_search'>
      appendToolContextMessage(contextMessages, 'code_search', toolResult)
      discoveredPaths.push(...extractFilePathsFromCodeSearchResult(toolResult))
    }

    const discoveredReadPaths = dedupeStrings(discoveredPaths)
      .filter((path) => !readPaths.has(path))
      .filter(shouldPrefetchPath)
      .slice(0, 8)

    if (discoveredReadPaths.length > 0) {
      const { toolResult } = yield {
        toolName: 'read_files',
        input: { paths: discoveredReadPaths },
        includeToolCall: false,
      } satisfies ToolCall<'read_files'>
      appendToolContextMessage(contextMessages, 'read_files', toolResult)
    }

    return contextMessages
  }

  function appendToolContextMessage(
    messages: any[],
    toolName: string,
    toolResult: any,
  ): void {
    if (Array.isArray(toolResult) && toolResult.length > 0) {
      messages.push({
        role: 'tool',
        toolName,
        content: toolResult,
      })
    }
  }

  function extractLikelyFilePaths(texts: string[]): string[] {
    const paths: string[] = []
    const pathPattern =
      /(?:^|[\s`"'([{])((?:\.\/|\.\.\/)?[A-Za-z0-9_.@-]+(?:\/[A-Za-z0-9_.@-]+)+\.(?:ts|tsx|js|jsx|mjs|cjs|json|md|mdx|css|scss|yml|yaml|toml|txt))(?:$|[\s`"',;:)\]}])/g

    for (const text of texts) {
      for (const match of text.matchAll(pathPattern)) {
        const path = normalizePrefetchPath(match[1])
        if (path && shouldPrefetchPath(path)) {
          paths.push(path)
        }
      }
    }

    return dedupeStrings(paths)
  }

  function extractLikelySearchPatterns(texts: string[]): string[] {
    const patterns: string[] = []
    const stopWords = new Set([
      'Phase',
      'Openbuff',
      'Provider',
      'Custom',
      'Existing',
      'Requirements',
      'Strategy',
      'Retry',
      'Use',
      'Preserve',
      'Alternative',
    ])

    for (const text of texts) {
      for (const match of text.matchAll(/`([^`\n]{2,80})`/g)) {
        const candidate = normalizeSearchPattern(match[1])
        if (candidate) patterns.push(candidate)
      }

      for (const match of text.matchAll(
        /\b[A-Z][A-Za-z0-9]*[A-Z][A-Za-z0-9]*\b/g,
      )) {
        const candidate = normalizeSearchPattern(match[0])
        if (candidate && !stopWords.has(candidate)) patterns.push(candidate)
      }

      for (const match of text.matchAll(
        /\b[a-z][A-Za-z0-9]*[A-Z][A-Za-z0-9]*\b/g,
      )) {
        const candidate = normalizeSearchPattern(match[0])
        if (candidate && !stopWords.has(candidate)) patterns.push(candidate)
      }

      for (const match of text.matchAll(/\b[A-Z][A-Z0-9_]{3,}\b/g)) {
        const candidate = normalizeSearchPattern(match[0])
        if (candidate && !stopWords.has(candidate)) patterns.push(candidate)
      }
    }

    return dedupeStrings(patterns).filter((pattern) => {
      if (pattern.length < 3 || pattern.length > 80) return false
      if (shouldPrefetchPath(pattern)) return false
      if (/^[0-9.]+$/.test(pattern)) return false
      return true
    })
  }

  function normalizeSearchPattern(value: string): string {
    const trimmed = value.trim().replace(/^['"]|['"]$/g, '')
    if (!trimmed) return ''
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) return ''
    if (/\n/.test(trimmed)) return ''
    if (trimmed.includes('/') && shouldPrefetchPath(trimmed)) return ''
    return trimmed
  }

  function extractFilePathsFromCodeSearchResult(toolResult: any): string[] {
    const texts = collectToolResultStrings(toolResult)
    const paths: string[] = []
    const fileLinePattern =
      /(?:^|\n)(?:\.\/)?([A-Za-z0-9_.@-]+(?:\/[A-Za-z0-9_.@-]+)+\.(?:ts|tsx|js|jsx|mjs|cjs|json|md|mdx|css|scss|yml|yaml|toml|txt)):/g

    for (const text of texts) {
      for (const match of text.matchAll(fileLinePattern)) {
        const path = normalizePrefetchPath(match[1])
        if (path && shouldPrefetchPath(path)) paths.push(path)
      }
    }

    return dedupeStrings(paths)
  }

  function collectToolResultStrings(value: any): string[] {
    if (typeof value === 'string') return [value]
    if (Array.isArray(value)) return value.flatMap(collectToolResultStrings)
    if (!value || typeof value !== 'object') return []
    if (value.type === 'json' && 'value' in value) {
      return collectToolResultStrings(value.value)
    }

    const strings: string[] = []
    for (const key of ['stdout', 'stderr', 'message']) {
      if (typeof value[key] === 'string') strings.push(value[key])
    }
    return strings
  }

  function normalizePrefetchPath(value: string | undefined): string {
    if (!value) return ''
    return value
      .trim()
      .replace(/^['"`]+|['"`]+$/g, '')
      .replace(/\\/g, '/')
      .replace(/^\.\//, '')
  }

  function shouldPrefetchPath(path: string): boolean {
    if (!path || path.startsWith('/') || path.startsWith('../')) return false
    return ![
      '.git/',
      '.omx/',
      'debug/',
      'dist/',
      'node_modules/',
      'coverage/',
      'e2e-traces/',
    ].some((prefix) => path.startsWith(prefix))
  }

  function escapeRipgrepLiteral(pattern: string): string {
    return pattern.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&')
  }

  function dedupeStrings(items: string[]): string[] {
    const seen = new Set<string>()
    const deduped: string[] = []
    for (const item of items) {
      const key = item.trim()
      if (!key || seen.has(key)) continue
      seen.add(key)
      deduped.push(key)
    }
    return deduped
  }

  function summarizeProposalToolCalls(toolCalls: ProposedToolCall[]): string {
    if (toolCalls.length === 0) return 'No changes proposed'

    return [
      'Proposal tool calls were returned without generated diffs:',
      ...toolCalls.map((toolCall, index) => {
        const input = isObject(toolCall.input) ? toolCall.input : {}
        const path =
          typeof input.path === 'string' ? input.path : 'unknown path'
        if (toolCall.toolName === 'propose_str_replace') {
          const replacementCount = Array.isArray(input.replacements)
            ? input.replacements.length
            : 0
          return `${index + 1}. propose_str_replace ${path} (${replacementCount} replacement${replacementCount === 1 ? '' : 's'})`
        }
        if (toolCall.toolName === 'propose_write_file') {
          const instructions =
            typeof input.instructions === 'string'
              ? ` - ${truncateText(input.instructions, 160)}`
              : ''
          return `${index + 1}. propose_write_file ${path}${instructions}`
        }
        return `${index + 1}. ${toolCall.toolName} ${path}`
      }),
    ].join('\n')
  }

  function buildNoUsableProposalError(
    implementations: Implementation[],
  ): string {
    const proposalSummaries = implementations
      .map(
        (implementation) =>
          `${implementation.id} (${implementation.strategy}): ${truncateText(
            implementation.content || 'No changes proposed',
            500,
          )}`,
      )
      .join('\n\n')

    return `No proposal returned usable edit tool calls. Proposal results:\n${proposalSummaries}`
  }

  function summarizeProposalFailure(
    result: ProposalResult | ProposalFailure | undefined,
  ): string {
    if (!isObject(result)) return ''
    if ('errorMessage' in result && typeof result.errorMessage === 'string') {
      return result.errorMessage
    }
    if ('error' in result && typeof result.error === 'string') {
      return result.error
    }
    if (
      'type' in result &&
      result.type === 'error' &&
      'message' in result &&
      typeof result.message === 'string'
    ) {
      return result.message
    }
    if (!('toolCalls' in result) && typeof result.message === 'string') {
      return result.message
    }
    const resultErrors = getUsableProposalToolResultsFromResult(result)
      .map((toolResult) =>
        toolResult && typeof toolResult === 'object'
          ? getEditResultFailureMessage(toolResult)
          : '',
      )
      .filter(Boolean)
      .join('\n\n')
    if (resultErrors) return resultErrors
    if (!('unifiedDiffs' in result) || !result.unifiedDiffs?.trim()) {
      return 'No unified diff was produced.'
    }
    if (result.unifiedDiffs.trim().startsWith('Error:')) {
      return result.unifiedDiffs.trim()
    }
    return ''
  }

  function isTrailingScaffoldMessage(message: any): boolean {
    if (message?.role !== 'user') return false

    const tags = getMessageTags(message)
    if (
      tags.some((tag) =>
        ['INSTRUCTIONS_PROMPT', 'STEP_PROMPT', 'SUBAGENT_SPAWN'].includes(tag),
      )
    ) {
      return true
    }

    // The editor-multi-prompt spawn params are injected as a USER_PROMPT. The
    // real user request is also tagged USER_PROMPT in parent history, so only
    // strip the params-shaped prompt that contains the strategy list.
    if (tags.includes('USER_PROMPT')) {
      const text = normalizeMessageText(getMessageText(message))
      return text.startsWith('{') && text.includes('"prompts"')
    }

    return false
  }

  function removeInternalBestOfNMessages(messageHistory: any[]): any[] {
    return messageHistory.filter(
      (message) => !isInternalBestOfNMessage(message),
    )
  }

  function isInternalBestOfNMessage(message: any): boolean {
    const tags = getMessageTags(message)
    if (
      tags.some((tag) =>
        [
          'INSTRUCTIONS_PROMPT',
          'STEP_PROMPT',
          'SUBAGENT_SPAWN',
          'PROPOSAL_RETRY',
          'TOOL_CALL_ERROR',
        ].includes(tag),
      )
    ) {
      return true
    }

    const searchText = getMessageSearchText(message)
    return [
      'editor-multi-prompt',
      'editor-implementor-proposal',
      'best-of-n-selector2',
      'propose_str_replace',
      'propose_write_file',
      'Selector failed to return an implementation',
    ].some((marker) => searchText.includes(marker))
  }

  function buildSelectorRequestContext(params: {
    messageHistory: any[]
    prompts: string[]
  }): string {
    const { messageHistory, prompts } = params
    const maxContextChars = 10_000
    const requestContext = buildCleanRequestContext({
      messageHistory,
      maxContextChars: 8_000,
      maxUserChars: 1_500,
      maxToolChars: 5_000,
    })

    const contextParts = [
      'Original request and relevant context for selecting the best implementation:',
      requestContext,
      '',
      'Strategy prompts used for proposals:',
      ...prompts.map((prompt, index) => `${index + 1}. ${prompt}`),
    ]

    return truncateText(contextParts.join('\n'), maxContextChars)
  }

  function buildProposalRequestContext(params: {
    messageHistory: any[]
    prompts: string[]
  }): string {
    const { messageHistory, prompts } = params
    const maxContextChars = 80_000
    const requestContext = buildCleanRequestContext({
      messageHistory,
      maxContextChars: 72_000,
      maxUserChars: 4_000,
      maxToolChars: 60_000,
    })

    const contextParts = [
      'Original request and current file context for drafting an implementation proposal:',
      requestContext,
      '',
      'All proposal strategies in this best-of-N run:',
      ...prompts.map((prompt, index) => `${index + 1}. ${prompt}`),
    ]

    return truncateText(contextParts.join('\n'), maxContextChars)
  }

  function buildCleanRequestContext(params: {
    messageHistory: any[]
    maxContextChars: number
    maxUserChars: number
    maxToolChars: number
  }): string {
    const { messageHistory, maxContextChars, maxUserChars, maxToolChars } =
      params

    const userRequests = dedupePreservingLast(
      messageHistory
        .filter(
          (message) =>
            message?.role === 'user' && !isInternalBestOfNMessage(message),
        )
        .map((message) => formatUserRequest(message, maxUserChars))
        .filter((text) => text.trim().length > 0),
    ).slice(-5)

    const toolContexts = messageHistory
      .filter(
        (message) =>
          message?.role === 'tool' && !isInternalBestOfNMessage(message),
      )
      .map((message) => formatToolContext(message, maxToolChars))
      .filter((text) => text.trim().length > 0)

    const parts = [
      userRequests.length > 0
        ? ['User requests:', ...userRequests.map((text) => `- ${text}`)].join(
            '\n',
          )
        : '',
      toolContexts.length > 0
        ? [
            'Current file/search context already gathered by the parent agent:',
            ...takeFromEndWithinBudget(toolContexts, maxToolChars),
          ].join('\n\n')
        : '',
    ].filter(Boolean)

    return parts.length > 0
      ? truncateText(parts.join('\n\n'), maxContextChars)
      : 'No parent request or file context was available. Use the strategy and propose the smallest safe edit.'
  }

  function formatUserRequest(message: any, maxChars: number): string {
    const text = stripSpawnParamsJson(
      normalizeMessageText(getMessageText(message)),
    )

    if (!text.trim()) return ''
    return truncateText(text, maxChars)
  }

  function formatToolContext(message: any, maxChars: number): string {
    if (message.toolName === 'read_files') {
      return formatReadFilesToolContext(message, maxChars)
    }

    if (
      ['code_search', 'glob', 'list_directory'].includes(
        String(message.toolName),
      )
    ) {
      const text = normalizeMessageText(getMessageText(message))
      return text.trim()
        ? truncateText(
            `Tool result from ${message.toolName}:\n${text}`,
            maxChars,
          )
        : ''
    }

    return ''
  }

  function formatReadFilesToolContext(message: any, maxChars: number): string {
    const files = extractJsonPartValues(message)
      .flatMap(flattenReadFileEntries)
      .filter(
        (entry): entry is { path: string; content: string } =>
          typeof entry?.path === 'string' && typeof entry?.content === 'string',
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

  function flattenReadFileEntries(value: any): any[] {
    if (Array.isArray(value)) return value.flatMap(flattenReadFileEntries)
    if (value && typeof value === 'object' && 'value' in value) {
      return flattenReadFileEntries(value.value)
    }
    return [value]
  }

  function extractJsonPartValues(message: any): any[] {
    if (!Array.isArray(message?.content)) return []
    return message.content
      .filter((part: any) => part?.type === 'json' && part.value)
      .map((part: any) => part.value)
  }

  function dedupePreservingLast(items: string[]): string[] {
    const seen = new Set<string>()
    const deduped: string[] = []

    for (const item of [...items].reverse()) {
      const key = item.replace(/\s+/g, ' ').trim()
      if (seen.has(key)) continue
      seen.add(key)
      deduped.unshift(item)
    }

    return deduped
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

  function getMessageTags(message: any): string[] {
    return Array.isArray(message?.tags)
      ? message.tags.filter(
          (tag: unknown): tag is string => typeof tag === 'string',
        )
      : []
  }

  function getMessageText(message: any): string {
    const content = message?.content
    if (typeof content === 'string') return content
    if (!Array.isArray(content)) return ''

    return content
      .map((part) => {
        if (typeof part === 'string') return part
        if (part?.type === 'text' && typeof part.text === 'string') {
          return part.text
        }
        return JSON.stringify(part)
      })
      .join('\n')
  }

  function getMessageSearchText(message: any): string {
    const parts = [
      typeof message?.toolName === 'string' ? message.toolName : '',
      getMessageText(message),
    ]
    return parts.join('\n')
  }

  function normalizeMessageText(text: string): string {
    return text
      .replace(/<user_message>/g, '')
      .replace(/<\/user_message>/g, '')
      .replace(/<system>/g, '')
      .replace(/<\/system>/g, '')
      .trim()
  }

  function stripSpawnParamsJson(text: string): string {
    const spawnParamsStart = text.search(
      /\n\s*\{\s*"(command|prompts|proposalContext|proposalStrategy)"\s*:/,
    )

    if (spawnParamsStart === -1) {
      return text
    }

    const possibleJson = text.slice(spawnParamsStart)
    if (
      possibleJson.includes('"prompts"') ||
      possibleJson.includes('"proposalContext"') ||
      possibleJson.includes('"proposalStrategy"')
    ) {
      return text.slice(0, spawnParamsStart).trim()
    }

    return text
  }

  function truncateText(text: string, maxChars: number): string {
    if (text.length <= maxChars) return text

    const headChars = Math.floor(maxChars * 0.6)
    const tailChars = Math.max(0, maxChars - headChars - 32)
    return `${text.slice(0, headChars)}\n...[truncated]...\n${text.slice(-tailChars)}`
  }

  function* applyImplementation(params: {
    chosenImplementation: Implementation
    reason: string
    suggestedImprovements: string
  }): ReturnType<NonNullable<SecretAgentDefinition['handleSteps']>> {
    const { chosenImplementation, reason, suggestedImprovements } = params

    const candidates = [
      chosenImplementation,
      ...usableImplementations.filter(
        (implementation) =>
          implementation.id !== chosenImplementation.id &&
          isUsableImplementation(implementation),
      ),
    ]
    const applyFailures: string[] = []

    for (const candidate of candidates) {
      const candidateToApply = isPartialImplementation(candidate)
        ? yield* completePartialImplementation(candidate)
        : candidate
      if (!candidateToApply) {
        applyFailures.push(
          `${candidate.id}: proposal was partial and completion pass did not return a clean complete proposal.`,
        )
        continue
      }

      const appliedToolResults = yield* applyImplementationEdits(
        candidateToApply,
      )
      if (hasCleanSuccessfulAppliedEdit(appliedToolResults)) {
        yield {
          toolName: 'set_output',
          input: {
            chosenStrategy: candidateToApply.strategy,
            reason: buildAppliedReason({
              appliedImplementation: candidateToApply,
              chosenImplementation,
              reason,
            }),
            toolResults: getCleanAppliedToolResults(appliedToolResults),
            suggestedImprovements,
          },
          includeToolCall: false,
        } satisfies ToolCall<'set_output'>
        return
      }

      applyFailures.push(
        `${candidateToApply.id}: ${summarizeAppliedToolResults(
          appliedToolResults,
        )}`,
      )

      const repairedImplementation = yield* repairFailedImplementation({
        failedImplementation: candidateToApply,
        appliedToolResults,
      })
      if (!repairedImplementation) {
        continue
      }

      const repairedToolResults = yield* applyImplementationEdits(
        repairedImplementation,
      )
      if (hasCleanSuccessfulAppliedEdit(repairedToolResults)) {
        yield {
          toolName: 'set_output',
          input: {
            chosenStrategy: repairedImplementation.strategy,
            reason: buildAppliedReason({
              appliedImplementation: repairedImplementation,
              chosenImplementation,
              reason,
            }),
            toolResults: getCleanAppliedToolResults(repairedToolResults),
            suggestedImprovements,
          },
          includeToolCall: false,
        } satisfies ToolCall<'set_output'>
        return
      }

      applyFailures.push(
        `${repairedImplementation.id}: ${summarizeAppliedToolResults(
          repairedToolResults,
        )}`,
      )
    }

    yield {
      toolName: 'set_output',
      input: {
        error:
          'No proposed implementation applied cleanly. Apply failures:\n' +
          applyFailures.join('\n\n'),
      },
      includeToolCall: false,
    } satisfies ToolCall<'set_output'>
  }

  function* completePartialImplementation(
    partialImplementation: Implementation,
  ): Generator<
    ToolCall<'read_files'> | ToolCall<'spawn_agents'>,
    Implementation | undefined,
    any
  > {
    const currentFileContext = yield* readRepairFileContext({
      failedImplementation: partialImplementation,
      appliedToolResults: [],
    })

    const { toolResult: completionResults } = yield {
      toolName: 'spawn_agents',
      input: {
        agents: [
          {
            agent_type: 'editor-implementor-proposal-1',
            prompt: `Complete partial implementation ${partialImplementation.id}`,
            params: {
              proposalStrategy: `Complete partial implementation ${partialImplementation.id}; re-emit one full proposal bundle.`,
              proposalContext: buildCompletionProposalContext({
                partialImplementation,
                currentFileContext,
              }),
              proposalRequirements:
                'Return one complete corrected proposal for the whole task. Include the useful captured edits from the partial proposal and add any missing edits. Use supplied current file context; if exact current code is still missing, use bounded read-only tools only. Emit one complete proposal bundle with all required propose_str_replace/propose_write_file calls, then write PROPOSAL_BUNDLE_COMPLETE only when every requested edit is covered. Never call write_file, str_replace, spawn_agents, set_output, or any other mutating/control tool.',
              previousFailure:
                'The previous proposal was marked partial by the proposal collector. Do not assume it will be applied. Re-emit the complete final edit proposal.',
              allowReadOnlyTools: true,
              proposalBundleMode: true,
              proposalTimeoutMs: getProposalTimeoutMsForContext(
                buildCompletionProposalContext({
                  partialImplementation,
                  currentFileContext,
                }),
              ),
            },
          },
        ],
      },
      includeToolCall: false,
    } satisfies ToolCall<'spawn_agents'>

    const completionResult = extractSpawnResults<
      ProposalResult | ProposalFailure
    >(completionResults)[0]

    if (
      !isUsableProposal(completionResult) ||
      isPartialProposalResult(completionResult)
    ) {
      return undefined
    }

    return {
      id: `${partialImplementation.id}-complete`,
      strategy: `${partialImplementation.strategy} (completed after partial proposal)`,
      content: completionResult.unifiedDiffs || partialImplementation.content,
      toolCalls: getUsableProposalToolCalls(completionResult),
      stopReason: completionResult.stopReason,
      proposalBudget: completionResult.proposalBudget,
      partial: false,
    }
  }

  function* applyImplementationEdits(
    chosenImplementation: Implementation,
  ): Generator<ToolCall<'str_replace'> | ToolCall<'write_file'>, any[], any> {
    // Apply the chosen implementation's tool calls as real edits
    const appliedToolResults: any[] = []
    for (const toolCall of chosenImplementation.toolCalls) {
      // Convert propose_* tool calls to real edit tool calls
      const realToolName =
        toolCall.toolName === 'propose_str_replace'
          ? 'str_replace'
          : toolCall.toolName === 'propose_write_file'
            ? 'write_file'
            : toolCall.toolName

      if (realToolName === 'str_replace' || realToolName === 'write_file') {
        const { toolResult } = yield {
          toolName: realToolName,
          input: toolCall.input,
          includeToolCall: true,
        } satisfies ToolCall<'str_replace'> | ToolCall<'write_file'>

        appliedToolResults.push(toolResult)
      }
    }

    return appliedToolResults
  }

  function* repairFailedImplementation(params: {
    failedImplementation: Implementation
    appliedToolResults: any[]
  }): Generator<
    ToolCall<'read_files'> | ToolCall<'spawn_agents'>,
    Implementation | undefined,
    any
  > {
    const { failedImplementation, appliedToolResults } = params
    const failureSummary = summarizeAppliedToolResults(appliedToolResults)
    const currentFileContext = yield* readRepairFileContext({
      failedImplementation,
      appliedToolResults,
    })

    const { toolResult: repairResults } = yield {
      toolName: 'spawn_agents',
      input: {
        agents: [
          {
            agent_type: 'editor-implementor-proposal-1',
            prompt: `Repair implementation ${failedImplementation.id}`,
            params: {
              proposalStrategy: `Repair implementation ${failedImplementation.id} after apply failure.`,
              proposalContext: buildRepairProposalContext({
                failedImplementation,
                failureSummary,
                currentFileContext,
              }),
              proposalRequirements:
                'Return a complete corrected proposal for the failed implementation using the supplied current file context. If exact current code is still missing, use bounded read-only tools only. Then emit one complete proposal bundle with all required propose_str_replace/propose_write_file calls, and write PROPOSAL_BUNDLE_COMPLETE only when every requested edit is covered. Never call write_file, str_replace, spawn_agents, set_output, or any other mutating/control tool.',
              previousFailure: failureSummary,
              allowReadOnlyTools: true,
              proposalBundleMode: true,
              proposalTimeoutMs: getProposalTimeoutMsForContext(
                buildRepairProposalContext({
                  failedImplementation,
                  failureSummary,
                  currentFileContext,
                }),
              ),
            },
          },
        ],
      },
      includeToolCall: false,
    } satisfies ToolCall<'spawn_agents'>

    const repairResult = extractSpawnResults<ProposalResult | ProposalFailure>(
      repairResults,
    )[0]

    if (!isUsableProposal(repairResult) || isPartialProposalResult(repairResult)) {
      return undefined
    }

    return {
      id: `${failedImplementation.id}-repair`,
      strategy: `${failedImplementation.strategy} (repaired after apply failure)`,
      content: repairResult.unifiedDiffs || failedImplementation.content,
      toolCalls: getUsableProposalToolCalls(repairResult),
      stopReason: repairResult.stopReason,
      proposalBudget: repairResult.proposalBudget,
      partial: false,
    }
  }

  function buildRepairProposalContext(params: {
    failedImplementation: Implementation
    failureSummary: string
    currentFileContext: string
  }): string {
    const { failedImplementation, failureSummary, currentFileContext } = params
    return truncateText(
      [
        'Original request and file/search context:',
        proposalRequestContext,
        '',
        currentFileContext
          ? `Fresh current file context after apply failure:\n${currentFileContext}`
          : '',
        '',
        `Failed implementation ${failedImplementation.id} (${failedImplementation.strategy}):`,
        truncateText(failedImplementation.content, 16_000),
        '',
        'Failed proposal tool calls:',
        truncateText(safeJsonStringify(failedImplementation.toolCalls), 16_000),
        '',
        'Apply failure details:',
        failureSummary,
        '',
        'Repair goal: re-emit the complete corrected edit proposal against the supplied current files.',
      ]
        .filter((part) => part !== '')
        .join('\n'),
      80_000,
    )
  }

  function buildCompletionProposalContext(params: {
    partialImplementation: Implementation
    currentFileContext: string
  }): string {
    const { partialImplementation, currentFileContext } = params
    return truncateText(
      [
        'Original request and file/search context:',
        proposalRequestContext,
        '',
        currentFileContext
          ? `Fresh current file context for completing the partial proposal:\n${currentFileContext}`
          : '',
        '',
        `Partial implementation ${partialImplementation.id} (${partialImplementation.strategy}):`,
        truncateText(partialImplementation.content, 20_000),
        '',
        'Partial proposal tool calls captured so far:',
        truncateText(safeJsonStringify(partialImplementation.toolCalls), 20_000),
        '',
        `Partial stop reason: ${partialImplementation.stopReason ?? 'unknown'}`,
        partialImplementation.proposalBudget
          ? `Proposal budget metadata: ${safeJsonStringify(
              partialImplementation.proposalBudget,
            )}`
          : '',
        '',
        'Completion goal: re-emit one complete final proposal for the whole task, including already captured useful edits plus any missing edits. End with PROPOSAL_BUNDLE_COMPLETE only if complete.',
      ]
        .filter((part) => part !== '')
        .join('\n'),
      90_000,
    )
  }

  function* readRepairFileContext(params: {
    failedImplementation: Implementation
    appliedToolResults: any[]
  }): Generator<ToolCall<'read_files'>, string, any> {
    const { failedImplementation, appliedToolResults } = params
    const paths = dedupeStrings([
      ...extractImplementationFilePaths(failedImplementation),
      ...extractAppliedEditFilePaths(appliedToolResults),
    ])
      .filter(shouldPrefetchPath)
      .slice(0, 8)

    if (paths.length === 0) return ''

    const { toolResult } = yield {
      toolName: 'read_files',
      input: { paths },
      includeToolCall: false,
    } satisfies ToolCall<'read_files'>

    return formatReadFilesToolContext(
      {
        toolName: 'read_files',
        content: Array.isArray(toolResult) ? toolResult : [],
      },
      30_000,
    )
  }

  function extractImplementationFilePaths(
    implementation: Implementation,
  ): string[] {
    return implementation.toolCalls
      .map((toolCall) =>
        isObject(toolCall.input) && typeof toolCall.input.path === 'string'
          ? toolCall.input.path
          : '',
      )
      .filter(Boolean)
  }

  function extractAppliedEditFilePaths(appliedToolResults: any[]): string[] {
    return flattenToolResultValues(appliedToolResults)
      .map((result) =>
        isObject(result) && typeof result.file === 'string' ? result.file : '',
      )
      .filter(Boolean)
  }

  function buildAppliedReason(params: {
    appliedImplementation: Implementation
    chosenImplementation: Implementation
    reason: string
  }): string {
    const { appliedImplementation, chosenImplementation, reason } = params
    if (appliedImplementation.id === chosenImplementation.id) {
      return reason
    }
    if (appliedImplementation.id === `${chosenImplementation.id}-complete`) {
      return `${reason}\n\nThe selected proposal was partial, so it was completed into a clean full proposal before applying.`
    }
    if (appliedImplementation.id === `${chosenImplementation.id}-repair`) {
      return `${reason}\n\nThe selected implementation failed to apply cleanly, so it was repaired against current file context before applying.`
    }
    return `${reason}\n\nThe originally selected implementation failed to apply cleanly, so implementation ${appliedImplementation.id} was applied instead.`
  }

  function hasCleanSuccessfulAppliedEdit(appliedToolResults: any[]): boolean {
    const values = getCleanAppliedToolResults(appliedToolResults)
    return (
      values.length > 0 &&
      values.some(isSuccessfulAppliedEditResult) &&
      !values.some(isFailedEditResult)
    )
  }

  function isSuccessfulAppliedEditResult(result: any): boolean {
    return Boolean(
      result &&
      typeof result === 'object' &&
      !getEditResultFailureMessage(result),
    )
  }

  function summarizeAppliedToolResults(appliedToolResults: any[]): string {
    const values = getCleanAppliedToolResults(appliedToolResults)
    const errors = values
      .map((result) =>
        result && typeof result === 'object'
          ? getEditResultFailureMessage(result)
          : '',
      )
      .filter(Boolean)

    return errors.length > 0
      ? errors.join('\n')
      : 'No successful edit result was returned.'
  }

  function getCleanAppliedToolResults(appliedToolResults: any[]): any[] {
    return filterIgnorableNoOpEditFailures(
      flattenToolResultValues(appliedToolResults),
    )
  }

  function flattenToolResultValues(toolResults: any[]): any[] {
    return toolResults.flatMap((toolResult) =>
      flattenToolResultValue(toolResult),
    )
  }

  function flattenToolResultValue(toolResult: any): any[] {
    if (Array.isArray(toolResult)) {
      return toolResult.flatMap((part) => flattenToolResultValue(part))
    }
    if (isJsonToolResultPart(toolResult)) {
      return flattenToolResultValue(toolResult.value)
    }
    return toolResult === undefined || toolResult === null ? [] : [toolResult]
  }

  function safeJsonStringify(value: any): string {
    try {
      return JSON.stringify(value, null, 2)
    } catch {
      return String(value)
    }
  }
}

const definition = {
  ...createMultiPromptEditor(),
  id: 'editor-multi-prompt',
}
export default definition
