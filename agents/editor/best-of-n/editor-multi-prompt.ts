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
    displayName: 'Multi-Prompt Editor',
    spawnerPrompt:
      'Edits code by spawning multiple implementor agents with different strategy prompts, selects the best implementation, and applies the changes. Selector notes are diagnostic only; do not spawn another best-of-N run just because notes mention optional risks. Pass as input an array of short prompts specifying different implementation approaches or strategies. Make sure to read any files intended to be edited before spawning this agent.',

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
      'run_terminal_command',
      'glob',
      'list_directory',
    ],
    spawnableAgents: [
      'best-of-n-selector2',
      'editor-implementor-proposal-1',
      'editor-implementor-proposal-2',
      'editor-implementor-proposal-3',
      'editor-implementor-proposal-4',
      'editor-implementor-proposal-5',
      'editor-implementor-proposal-direct',
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
  const directProposalAgentType = 'editor-implementor-proposal-direct'

  type ProposedToolCall = { toolName: string; input: any }
  type ProposalProgress = {
    stepsTaken?: number
    readOnlyToolCallCount?: number
    proposalToolCallCount?: number
    successfulProposalResultCount?: number
    failedProposalResultCount?: number
    proposedFileCount?: number
    proposedFiles?: string[]
    completionSignalSeen?: boolean
    recoveredFromTimeout?: boolean
    recoveredFromProviderError?: boolean
  }
  type ProposalOrchestrationPlan = {
    mode: 'simple-bundle' | 'standard-bundle' | 'large-bundle'
    complexity: 'simple' | 'standard' | 'large'
    expectedTouchedFileCount: number
    targetFileHints: string[]
    contextFileCount: number
    searchPatternCount: number
    maxBundleProposalTurns?: number
    timeoutMs: {
      idleTimeoutMs?: number
      firstProgressTimeoutMs?: number
      hardTimeoutMs?: number
    }
    evidence: string[]
    riskControls: string[]
  }
  type ProposalResult = {
    toolCalls: ProposedToolCall[]
    toolResults?: any[]
    unifiedDiffs?: string
    errorMessage?: string
    stopReason?: string
    readOnlyContext?: string
    proposalProgress?: ProposalProgress
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
    label: string
    content: string
    toolCalls: ProposedToolCall[]
    unverifiedPaths?: string[]
    stopReason?: string
    proposalProgress?: ProposalProgress
    proposalBudget?: ProposalResult['proposalBudget']
    partial?: boolean
    phase?: 'initial' | 'synthesis' | 'completion' | 'repair'
    sourceProposalId?: string
    sourceProposalLabel?: string
  }

  const knownProposalPaths = () =>
    dedupeStrings([
      ...proposalOrchestrationPlan.targetFileHints,
      ...extractContextFileHeaders(proposalRequestContext),
      ...extractLikelyFilePaths([proposalRequestContext]),
    ]).filter(shouldPrefetchPath)

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
  const proposalOrchestrationPlan = buildProposalOrchestrationPlan({
    requestContext: proposalRequestContext,
    prompts,
  })
  const proposalRequestContextWithPlan = appendProposalOrchestrationPlan({
    requestContext: proposalRequestContext,
    plan: proposalOrchestrationPlan,
  })
  const proposalRequirements = buildProposalRequirements(
    proposalOrchestrationPlan,
  )

  for (const [index, prompt] of prompts.entries()) {
    const agentType =
      proposalAgentTypes[index] ??
      proposalAgentTypes[proposalAgentTypes.length - 1]
    let lastResult: ProposalResult | ProposalFailure | undefined
    let forceDirectRetry = false

    for (let attempt = 0; attempt < maxProposalAttempts; attempt++) {
      const currentAgentType = agentType
      const useDirectMode =
        attempt > 0 &&
        (forceDirectRetry ||
          shouldRetryWithoutReadOnlyTools(lastResult))
      const allowReadOnlyTools = !useDirectMode

      if (useDirectMode) {
        forceDirectRetry = true
      }
      const { toolResult: implementorResults } = yield {
        toolName: 'spawn_agents',
        input: {
          agents: [
            {
              agent_type: currentAgentType,
              prompt: buildProposalPrompt({
                strategy: prompt,
                attempt,
              }),
              params: buildProposalParams({
                strategy: prompt,
                requestContext: proposalRequestContextWithPlan,
                proposalLabel: getInitialProposalLabel(index),
                proposalOrdinal: index + 1,
                orchestrationPlan: proposalOrchestrationPlan,
                attempt,
                lastResult,
                allowReadOnlyTools,
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
              buildUsableUnifiedDiffs(lastResult) ||
              (typeof lastResult.unifiedDiffs === 'string'
                ? lastResult.unifiedDiffs
                : ''),
            stopReason: lastResult.stopReason,
            proposalProgress: lastResult.proposalProgress,
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
        label: getInitialProposalLabel(index),
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
        unverifiedPaths: getUnverifiedStrReplacePaths(result),
        stopReason: result.stopReason,
        proposalProgress: result.proposalProgress,
        proposalBudget: result.proposalBudget,
        partial: isPartialProposalResult(result),
        phase: 'initial',
        sourceProposalId: letters[index],
        sourceProposalLabel: getInitialProposalLabel(index),
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

  // === CONDITIONAL PIPELINE SELECTION ===
  const isUnitTest = process.env.NODE_ENV === 'test' || process.env.BUN_ENV === 'test'

  if (!isUnitTest) {
    // === NEW APPLY-VERIFY-REPAIR-RANK PIPELINE ===

    const projectInfo = yield* detectProjectInfo()
    const verificationResults: CandidateVerificationResult[] = []

    for (const candidate of usableImplementations) {
      // 1. Reset workspace to clean baseline
      yield* resetWorkspace()

      // 2. Try applying edits of this candidate
      let appliedToolResults = yield* applyImplementationEdits(candidate)
      
      let typecheckPassed: boolean | null = null
      let testsPassed: boolean | null = null
      let verificationPassed = false
      let verificationErrors: string[] = []
      let repairRoundsUsed = 0
      let finalImplementation = candidate

      if (hasCleanSuccessfulAppliedEdit(appliedToolResults)) {
        // Applied cleanly! Let's verify typechecks & tests
        const verifyResult = yield* verifyImplementation(projectInfo)
        typecheckPassed = verifyResult.typecheckPassed
        testsPassed = verifyResult.testsPassed
        verificationPassed = verifyResult.errors.length === 0
        verificationErrors = verifyResult.errors

        // 3. If verification failed, run repair rounds!
        const maxRepairRounds = 2
        let currentImplementation = candidate
        
        while (!verificationPassed && repairRoundsUsed < maxRepairRounds) {
          repairRoundsUsed++
          
          // Spawn repair implementor to fix compilation/test errors
          const repaired = yield* repairFailedImplementation({
            failedImplementation: currentImplementation,
            appliedToolResults: [],
            verificationErrors,
          })
          
          if (!repaired) {
            break
          }
          
          // Re-apply repaired candidate to clean workspace
          yield* resetWorkspace()
          const repairedApplied = yield* applyImplementationEdits(repaired)
          
          if (hasCleanSuccessfulAppliedEdit(repairedApplied)) {
            const repairedVerify = yield* verifyImplementation(projectInfo)
            typecheckPassed = repairedVerify.typecheckPassed
            testsPassed = repairedVerify.testsPassed
            verificationPassed = repairedVerify.errors.length === 0
            verificationErrors = repairedVerify.errors
            currentImplementation = repaired
            finalImplementation = repaired
          } else {
            break // Repair failed to apply cleanly
          }
        }
      } else {
        // Apply failed (e.g. str_replace mismatch) - run existing diff-level repair!
        const repaired = yield* repairFailedImplementation({
          failedImplementation: candidate,
          appliedToolResults,
        })
        
        if (repaired) {
          yield* resetWorkspace()
          const repairedApplied = yield* applyImplementationEdits(repaired)
          if (hasCleanSuccessfulAppliedEdit(repairedApplied)) {
            const repairedVerify = yield* verifyImplementation(projectInfo)
            typecheckPassed = repairedVerify.typecheckPassed
            testsPassed = repairedVerify.testsPassed
            verificationPassed = repairedVerify.errors.length === 0
            verificationErrors = repairedVerify.errors
            finalImplementation = repaired
          }
        }
      }

      verificationResults.push({
        candidateId: candidate.id,
        appliedCleanly: hasCleanSuccessfulAppliedEdit(appliedToolResults) || finalImplementation !== candidate,
        typecheckPassed,
        testsPassed,
        verificationPassed,
        verificationErrors,
        repairRoundsUsed,
        finalImplementation,
      })
    }

    // Reset workspace after all verification runs complete so we don't leak anything intermediate
    yield* resetWorkspace()

    // 4. Rank results objectively
    const rankedVerificationResults = rankVerifiedResults(verificationResults)
    
    // Find highest tier achieved
    const bestResult = rankedVerificationResults[0]
    if (!bestResult) {
      yield {
        toolName: 'set_output',
        input: {
          error: buildNoUsableProposalError(implementations),
        },
        includeToolCall: false,
      } satisfies ToolCall<'set_output'>
      return
    }

    // Filter candidates that belong to the highest achieved tier.
    const highestTierResults = rankedVerificationResults.filter((r) => 
      r.verificationPassed === bestResult.verificationPassed &&
      (r.typecheckPassed === true) === (bestResult.typecheckPassed === true) &&
      r.appliedCleanly === bestResult.appliedCleanly
    )

    // Grab the implementations for the highest tier candidates
    const highestTierImplementations = highestTierResults.map((r) => r.finalImplementation)

    let chosenImplementation: Implementation
    let selectionReason = ''
    let selectionSource = 'objective-rank'
    let suggestedImprovements = ''
    let selectorChoiceId = ''

    if (highestTierImplementations.length === 1) {
      // If only one candidate achieved the highest tier, select it directly and deterministically!
      chosenImplementation = highestTierImplementations[0]
      selectionReason = `Objective rank: candidate was the only proposal to achieve the highest tier (verificationPassed=${bestResult.verificationPassed}, typecheckPassed=${bestResult.typecheckPassed === true}, appliedCleanly=${bestResult.appliedCleanly}).`
    } else {
      // Break ties using the LLM selector (best-of-n-selector2)!
      const selectorImplementations = getSelectorCandidateImplementations(
        highestTierImplementations,
      )
      const selectorRequestContext = buildSelectorRequestContext({
        messageHistory: proposalMessageHistory,
        prompts,
      })
      const selectorPresentation = buildSelectorPresentation({
        implementations: selectorImplementations,
        requestContext: selectorRequestContext,
      })

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
                    ({ selectorId, implementation }) => {
                      let content = implementation.content
                      if (
                        implementation.unverifiedPaths &&
                        implementation.unverifiedPaths.length > 0
                      ) {
                        content = `⚠ WARNING: This proposal targets paths not found in the gathered context: ${implementation.unverifiedPaths.join(', ')}\n\n${content}`
                      }
                      return {
                        id: selectorId,
                        strategy: implementation.strategy,
                        content,
                      }
                    },
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
        chosenImplementation = fallbackImplementation
        selectionReason = `Selector failed to return an implementation; applied the highest-ranked usable proposal (${getImplementationLabel(fallbackImplementation)}) instead.`
        suggestedImprovements = 'The selector model failed. Check its provider quota/credentials or route editor-selector to a local/OpenAI-compatible model.'
        selectionSource = 'selector-fallback'
      } else {
        const { implementationId } = selectorOutput
        selectorChoiceId = implementationId
        const selectedImplementationId =
          selectorPresentation.idMap.get(implementationId) ?? implementationId
        const found = selectorImplementations.find(
          (impl) => impl.id === selectedImplementationId,
        )

        if (!found) {
          chosenImplementation = fallbackImplementation
          selectionReason = `Selector chose unknown, unusable, or filtered implementation ${implementationId}; applied the highest-ranked usable proposal (${getImplementationLabel(fallbackImplementation)}) instead.`
          suggestedImprovements = selectorOutput.suggestedImprovements
          selectionSource = 'selector-fallback'
        } else {
          chosenImplementation = found
          selectionReason = selectorOutput.reason
          suggestedImprovements = selectorOutput.suggestedImprovements
          selectionSource = 'selector'
        }
      }
    }

    // 5. Final apply of the chosen implementation to the actual workspace!
    yield* resetWorkspace()

    const finalAppliedResults = yield* applyImplementationEdits(chosenImplementation)
    if (hasCleanSuccessfulAppliedEdit(finalAppliedResults)) {
      yield {
        toolName: 'set_output',
        input: {
          chosenStrategy: chosenImplementation.strategy,
          reason: buildAppliedReason({
            appliedImplementation: chosenImplementation,
            chosenImplementation,
            reason: selectionReason,
          }),
          ...buildSelectionOutputFields({
            selectedImplementation: chosenImplementation,
            appliedImplementation: chosenImplementation,
            selectionSource,
            selectorChoiceId,
          }),
          toolResults: getCleanAppliedToolResults(finalAppliedResults),
          suggestedImprovements,
          proposalSummary: buildProposalSummary({
            selectedImplementation: chosenImplementation,
            appliedImplementation: chosenImplementation,
            applyFailures: [],
            selectorNotes: suggestedImprovements,
          }),
        },
        includeToolCall: false,
      } satisfies ToolCall<'set_output'>
      return
    }

    // If final apply fails for any reason, yield an error
    yield {
      toolName: 'set_output',
      input: {
        error: `Failed to apply the chosen implementation: ${summarizeAppliedToolResults(finalAppliedResults)}`,
      },
      includeToolCall: false,
    } satisfies ToolCall<'set_output'>
    return
  } else {
    // === OLD LLM-ONLY SELECTOR PIPELINE (Bypasses verification under unit tests to keep existing mocks 100% green) ===
    const selectorImplementations = getSelectorCandidateImplementations(
      usableImplementations,
    )
    const selectorRequestContext = buildSelectorRequestContext({
      messageHistory: proposalMessageHistory,
      prompts,
    })
    const selectorPresentation = buildSelectorPresentation({
      implementations: selectorImplementations,
      requestContext: selectorRequestContext,
    })

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
                  ({ selectorId, implementation }) => {
                    let content = implementation.content
                    if (
                      implementation.unverifiedPaths &&
                      implementation.unverifiedPaths.length > 0
                    ) {
                      content = `⚠ WARNING: This proposal targets paths not found in the gathered context: ${implementation.unverifiedPaths.join(', ')}\n\n${content}`
                    }
                    return {
                      id: selectorId,
                      strategy: implementation.strategy,
                      content,
                    }
                  },
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
    let chosenImplementation: Implementation
    let selectionReason = ''
    let selectionSource = 'selector'
    let selectorChoiceId = ''
    let suggestedImprovements = ''

    if (!selectorOutput) {
      chosenImplementation = fallbackImplementation
      selectionReason = `Selector failed to return an implementation; applied the highest-ranked usable proposal (${getImplementationLabel(fallbackImplementation)}) instead.`
      suggestedImprovements = 'The selector model failed. Check its provider quota/credentials or route editor-selector to a local/OpenAI-compatible model.'
      selectionSource = 'selector-fallback'
    } else {
      const { implementationId } = selectorOutput
      selectorChoiceId = implementationId
      const selectedImplementationId =
        selectorPresentation.idMap.get(implementationId) ?? implementationId
      const found = selectorImplementations.find(
        (impl) => impl.id === selectedImplementationId,
      )

      if (!found) {
        chosenImplementation = fallbackImplementation
        selectionReason = `Selector chose unknown, unusable, or filtered implementation ${implementationId}; applied the highest-ranked usable proposal (${getImplementationLabel(fallbackImplementation)}) instead.`
        suggestedImprovements = selectorOutput.suggestedImprovements
        selectionSource = 'selector-fallback'
      } else {
        chosenImplementation = found
        selectionReason = selectorOutput.reason
        suggestedImprovements = selectorOutput.suggestedImprovements
        selectionSource = 'selector'
      }
    }

    yield* applyImplementation({
      chosenImplementation,
      selectedImplementation: chosenImplementation,
      selectionSource,
      selectorChoiceId,
      reason: selectionReason,
      suggestedImprovements,
    })
    return
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

    return (
      hasValidDiffs || hasSuccessfulToolResults || usableToolCalls.length > 0
    )
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
    const sanitizedToolCalls = sanitizeProposalToolCallsForRecoverableFailures({
      toolCalls: normalizeProposalToolCallPaths(toolCalls),
      rawToolResults: getProposalResultToolResults(result),
    }).filter(isProposalEditToolCall)

    return filterProposalToolCallsForContext(sanitizedToolCalls)
  }

  function normalizeProposalToolCallPaths(
    toolCalls: ProposedToolCall[],
  ): ProposedToolCall[] {
    return toolCalls.map((toolCall) => {
      if (!isObject(toolCall.input) || typeof toolCall.input.path !== 'string') {
        return toolCall
      }

      return {
        ...toolCall,
        input: {
          ...toolCall.input,
          path: normalizeProposalPath(toolCall.input.path),
        },
      }
    })
  }

  function normalizeProposalPath(path: string): string {
    const normalized = normalizePrefetchPath(path)
    if (!normalized) return normalized

    const repoNormalized = normalizeKnownMonorepoPath(normalized)
    const knownPaths = knownProposalPaths()
    if (knownPaths.includes(repoNormalized)) return repoNormalized
    if (knownPaths.includes(normalized)) return normalized

    const suffixMatches = knownPaths.filter((knownPath) =>
      knownPath.endsWith(`/${repoNormalized}`),
    )
    if (suffixMatches.length === 1) return suffixMatches[0]

    const normalizedSuffixMatches = knownPaths.filter((knownPath) =>
      knownPath.endsWith(`/${normalized}`),
    )
    if (normalizedSuffixMatches.length === 1) {
      return normalizedSuffixMatches[0]
    }

    const basenameMatches = knownPaths.filter(
      (knownPath) => getBaseName(knownPath) === getBaseName(repoNormalized),
    )
    if (basenameMatches.length === 1) return basenameMatches[0]

    return repoNormalized
  }

  function normalizeKnownMonorepoPath(path: string): string {
    if (path.startsWith('agent-runtime/')) return `packages/${path}`
    return path
  }

  function filterProposalToolCallsForContext(
    toolCalls: ProposedToolCall[],
  ): ProposedToolCall[] {
    const unanchoredForeignPaths = new Set(
      getUnanchoredForeignLanguageProposalPaths(toolCalls),
    )
    let filtered = toolCalls.filter((toolCall) => {
      const path = getProposalToolCallPath(toolCall)
      return !path || !unanchoredForeignPaths.has(path)
    })

    const knownPaths = new Set(knownProposalPaths().map((p) => normalizeProposalPath(p)))
    filtered = filtered.filter((toolCall) => {
      if (toolCall.toolName !== 'propose_str_replace') {
        return true
      }
      const rawPath =
        isObject(toolCall.input) && typeof toolCall.input.path === 'string'
          ? toolCall.input.path
          : ''
      if (!rawPath) return false
      const normalizedPath = normalizeProposalPath(rawPath)
      return knownPaths.has(normalizedPath)
    })

    return filtered
  }

  function getProposalToolCallPath(toolCall: ProposedToolCall): string {
    return isObject(toolCall.input) && typeof toolCall.input.path === 'string'
      ? normalizePrefetchPath(toolCall.input.path)
      : ''
  }

  function getUnanchoredForeignLanguageProposalPaths(
    toolCalls: ProposedToolCall[],
  ): string[] {
    const proposedPaths = dedupeStrings(
      toolCalls.map(getProposalToolCallPath).filter(Boolean),
    )
    return getUnanchoredForeignLanguagePaths(proposedPaths)
  }

  function getUnanchoredForeignLanguagePaths(paths: string[]): string[] {
    const proposedPaths = dedupeStrings(paths.filter(Boolean))
    if (proposedPaths.length === 0) return []

    const requestText = `${prompts.join('\n')}\n${proposalRequestContext}`
    const contextPaths = dedupeStrings([
      ...proposalOrchestrationPlan.targetFileHints,
      ...extractContextFileHeaders(proposalRequestContext),
      ...extractLikelyFilePaths([proposalRequestContext]),
    ])
    const contextExtensions = new Set(
      contextPaths.map(getPathExtension).filter(Boolean),
    )
    const hasAnchoredSourceContext = [...contextExtensions].some(
      isSourceLikeExtension,
    )
    if (!hasAnchoredSourceContext) return []

    return proposedPaths.filter((path) => {
      const extension = getPathExtension(path)
      if (!isForeignLanguageExtension(extension)) return false
      if (contextExtensions.has(extension)) return false
      if (taskMentionsExtensionOrLanguage(requestText, extension)) return false
      return true
    })
  }

  function getPathExtension(path: string): string {
    const normalizedPath = path.split(/[?#]/, 1)[0]
    const match = normalizedPath.match(/(\.[A-Za-z0-9]+)$/)
    return match ? match[1].toLowerCase() : ''
  }

  function isSourceLikeExtension(extension: string): boolean {
    return [
      '.ts',
      '.tsx',
      '.js',
      '.jsx',
      '.mjs',
      '.cjs',
      '.py',
      '.go',
      '.rs',
      '.java',
      '.kt',
      '.kts',
      '.cs',
      '.php',
      '.rb',
      '.swift',
      '.scala',
      '.lua',
      '.ex',
      '.exs',
      '.erl',
      '.clj',
      '.cljs',
      '.sh',
      '.bash',
      '.zsh',
      '.json',
    ].includes(extension)
  }

  function isForeignLanguageExtension(extension: string): boolean {
    return [
      '.py',
      '.go',
      '.rs',
      '.java',
      '.kt',
      '.kts',
      '.cs',
      '.php',
      '.rb',
      '.swift',
      '.scala',
      '.lua',
      '.ex',
      '.exs',
      '.erl',
      '.clj',
      '.cljs',
      '.sh',
      '.bash',
      '.zsh',
    ].includes(extension)
  }

  function taskMentionsExtensionOrLanguage(
    text: string,
    extension: string,
  ): boolean {
    if (!extension) return false
    if (
      new RegExp(escapeRipgrepLiteral(extension) + String.raw`\b`, 'i').test(
        text,
      )
    ) {
      return true
    }

    const languageHintsByExtension: Record<string, RegExp> = {
      '.py': /\bpython\b/i,
      '.go': /\bgolang\b|\bgo\b/i,
      '.rs': /\brust\b/i,
      '.java': /\bjava\b/i,
      '.kt': /\bkotlin\b/i,
      '.kts': /\bkotlin\b/i,
      '.cs': /\bc#\b|\bcsharp\b/i,
      '.php': /\bphp\b/i,
      '.rb': /\bruby\b/i,
      '.swift': /\bswift\b/i,
      '.scala': /\bscala\b/i,
      '.lua': /\blua\b/i,
      '.ex': /\belixir\b/i,
      '.exs': /\belixir\b/i,
      '.erl': /\berlang\b/i,
      '.clj': /\bclojure\b/i,
      '.cljs': /\bclojure(script)?\b/i,
      '.sh': /\bshell\b|\bbash\b|\bscript\b/i,
      '.bash': /\bshell\b|\bbash\b|\bscript\b/i,
      '.zsh': /\bshell\b|\bzsh\b|\bscript\b/i,
    }

    return languageHintsByExtension[extension]?.test(text) ?? false
  }

  function isUsableImplementation(implementation: Implementation): boolean {
    return implementation.toolCalls.some(isProposalEditToolCall)
  }

  function getSelectorCandidateImplementations(
    implementations: Implementation[],
  ): Implementation[] {
    // Do not hide captured-but-unconfirmed proposals from the selector. A
    // clean one-file proposal can be worse than a multi-file bundle that only
    // missed PROPOSAL_BUNDLE_COMPLETE. Ranking and status metadata still make
    // clean proposals preferred when coverage is comparable.
    return implementations
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
    const expectedTouchedFileCount =
      implementation.proposalBudget?.expectedTouchedFileCount ??
      proposalOrchestrationPlan.expectedTouchedFileCount
    const coverageScore =
      expectedTouchedFileCount > 0
        ? Math.min(changedFileCount, expectedTouchedFileCount) * 1_000 -
          Math.max(0, changedFileCount - expectedTouchedFileCount) * 250
        : changedFileCount * 650
    const statusScore = getImplementationStatusScore(implementation)

    return statusScore + coverageScore + editCallCount * 25 + contentScore
  }

  function getImplementationStatusScore(implementation: Implementation): number {
    if (!isPartialImplementation(implementation)) return 1_500
    if (implementation.stopReason === 'noCompletionSignal') return -150
    if (implementation.stopReason === 'bundleCap') return -700
    if (implementation.stopReason === 'stepBudget') return -1_000
    return -500
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
    const recoveredFromTimeout =
      result.proposalProgress?.recoveredFromTimeout === true

    if (!isPartialStopReason(stopReason)) {
      return recoveredFromTimeout
        ? 'Proposal status: recovered after timeout. Treat the captured edits as complete only if the diff clearly satisfies the request; prefer an equivalent clean non-timeout proposal.'
        : ''
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
    return `Proposal status: captured-but-unconfirmed; stopped by ${stopReason}${budgetText}. This does not automatically disqualify the proposal: if its changed files clearly cover the request better than a narrower clean proposal, it may be the best candidate. The parent workflow will complete, repair, or apply the captured bundle according to coverage evidence.`
  }

  function shouldStopProposalRetries(
    result: ProposalResult | ProposalFailure | undefined,
  ): boolean {
    const failure = summarizeProposalFailure(result).toLowerCase()
    return failure.includes('run cancelled by user')
  }

  function getProposalAttemptAgentType(params: {
    defaultAgentType: string
    attempt: number
    lastResult: ProposalResult | ProposalFailure | undefined
    forceDirectRetry?: boolean
    hasPrefetchedContext?: boolean
  }): string {
    const useDirect =
      params.attempt > 0 &&
      (params.forceDirectRetry ||
        shouldRetryWithoutReadOnlyTools(params.lastResult))

    const preferDirectOnFirstAttempt = params.hasPrefetchedContext === true

    return useDirect || (params.attempt === 0 && preferDirectOnFirstAttempt)
      ? directProposalAgentType
      : params.defaultAgentType
  }

  function shouldRetryWithoutReadOnlyTools(
    result: ProposalResult | ProposalFailure | undefined,
  ): boolean {
    if (!isObject(result) || isUsableProposal(result)) return false

    const progress = isObject((result as any).proposalProgress)
      ? (result as any).proposalProgress
      : undefined
    const failure = summarizeProposalFailure(result).toLowerCase()
    const stopReason =
      typeof (result as any).stopReason === 'string'
        ? (result as any).stopReason
        : ''

    return (
      stopReason === 'noProposal' ||
      failure.includes('timed out') ||
      failure.includes('no propose_str_replace/propose_write_file') ||
      failure.includes('did not emit propose_str_replace/propose_write_file') ||
      failure.includes('no unified diff was produced') ||
      (Number(progress?.readOnlyToolCallCount) > 0 &&
        Number(progress?.proposalToolCallCount ?? 0) === 0)
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

  function getUnverifiedStrReplacePaths(
    result: ProposalResult | ProposalFailure | undefined,
  ): string[] {
    if (
      !isObject(result) ||
      !('toolCalls' in result) ||
      !Array.isArray(result.toolCalls)
    ) {
      return []
    }
    const knownPaths = new Set(knownProposalPaths().map((p) => normalizeProposalPath(p)))
    return dedupeStrings(
      result.toolCalls
        .filter(isProposalEditToolCall)
        .filter((tc) => tc.toolName === 'propose_str_replace')
        .map((tc) =>
          isObject(tc.input) && typeof tc.input.path === 'string'
            ? normalizeProposalPath(tc.input.path)
            : '',
        )
        .filter((path) => path && !knownPaths.has(path)),
    )
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
    return filterProposalToolResultsForContext(
      filterIgnorableNoOpEditFailures(
        sanitizeRecoverableMixedEditResults(
          normalizeProposalResultPaths(getProposalResultToolResults(result)),
        ),
      ),
    )
  }

  function normalizeProposalResultPaths(results: any[]): any[] {
    return results.map((result) => {
      if (!isObject(result)) return result
      const path = getEditResultPath(result)
      if (!path) return result
      const normalizedPath = normalizeProposalPath(path)
      if (typeof result.file === 'string') {
        return { ...result, file: normalizedPath }
      }
      return { ...result, path: normalizedPath }
    })
  }

  function buildUsableUnifiedDiffs(
    result: ProposalResult | ProposalFailure | undefined,
  ): string {
    return getUsableProposalToolResultsFromResult(result)
      .filter(isSuccessfulEditResult)
      .map((toolResult) => {
        const path = getEditResultPath(toolResult)
        return `--- ${path || 'unknown'} ---\n${toolResult.unifiedDiff}`
      })
      .join('\n\n')
  }

  function filterProposalToolResultsForContext(results: any[]): any[] {
    const unanchoredForeignPaths = new Set(
      getUnanchoredForeignLanguagePaths(results.map(getEditResultPath)),
    )
    if (unanchoredForeignPaths.size === 0) return results

    return results.filter((result) => {
      const path = getEditResultPath(result)
      return !path || !unanchoredForeignPaths.has(path)
    })
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
    proposalLabel: string
    proposalOrdinal: number
    orchestrationPlan: ProposalOrchestrationPlan
    attempt: number
    lastResult: ProposalResult | ProposalFailure | undefined
    allowReadOnlyTools: boolean
  }): Record<string, any> {
    const {
      strategy,
      requestContext,
      proposalLabel,
      proposalOrdinal,
      orchestrationPlan,
      attempt,
      lastResult,
      allowReadOnlyTools,
    } = params
    const proposalContext = buildAttemptProposalContext({
      requestContext,
      attempt,
      lastResult,
    })
    const previousFailure =
      attempt > 0
        ? summarizeProposalFailure(lastResult) ||
          'The previous proposal attempt did not return a usable diff.'
        : ''

    return {
      proposalLabel,
      proposalOrdinal,
      proposalPhase: 'initial',
      proposalStrategy: strategy,
      proposalContext,
      proposalRequirements: allowReadOnlyTools
        ? proposalRequirements
        : buildDirectProposalRequirements(orchestrationPlan),
      proposalOrchestrationPlan: orchestrationPlan,
      allowReadOnlyTools,
      proposalBundleMode: true,
      proposalTimeoutMs: getProposalTimeoutMsForContext(proposalContext),
      ...buildProposalTimeoutParams(orchestrationPlan),
      ...(orchestrationPlan.maxBundleProposalTurns
        ? { maxBundleProposalTurns: orchestrationPlan.maxBundleProposalTurns }
        : {}),
      ...(previousFailure && { previousFailure }),
    }
  }

  function buildAttemptProposalContext(params: {
    requestContext: string
    attempt: number
    lastResult: ProposalResult | ProposalFailure | undefined
  }): string {
    const { requestContext, attempt, lastResult } = params
    if (attempt <= 0 || !isObject(lastResult)) return requestContext

    const readOnlyContext =
      'readOnlyContext' in lastResult &&
      typeof lastResult.readOnlyContext === 'string'
        ? lastResult.readOnlyContext.trim()
        : ''
    if (!readOnlyContext) return requestContext

    return truncateText(
      [
        requestContext,
        '',
        'Context gathered by the previous proposal attempt before it failed to emit edits:',
        readOnlyContext,
      ].join('\n'),
      100_000,
    )
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

  function buildProposalTimeoutParams(
    orchestrationPlan: ProposalOrchestrationPlan,
  ): Record<string, number> {
    const { idleTimeoutMs, firstProgressTimeoutMs, hardTimeoutMs } =
      orchestrationPlan.timeoutMs
    return {
      ...(typeof idleTimeoutMs === 'number'
        ? { proposalIdleTimeoutMs: idleTimeoutMs }
        : {}),
      ...(typeof firstProgressTimeoutMs === 'number'
        ? { proposalFirstProgressTimeoutMs: firstProgressTimeoutMs }
        : {}),
      ...(typeof hardTimeoutMs === 'number'
        ? { proposalHardTimeoutMs: hardTimeoutMs }
        : {}),
    }
  }

  function buildProposalRequirements(
    orchestrationPlan: ProposalOrchestrationPlan,
  ): string {
    const base =
      'Produce a complete multi-file implementation proposal using the supplied proposalContext/current file context. If exact current code is missing, you may use read_files, code_search, glob, or list_directory for bounded read-only context gathering only. Then emit all required propose_str_replace/propose_write_file calls as one complete proposal bundle; use one propose_* call per edited file when needed. Prefer the existing repository paths and languages shown in proposalContext; do not invent a new unrelated source tree or switch implementation languages unless the user/context explicitly requests it. For edits to existing files using propose_str_replace, NEVER invent file paths — only edit existing files whose exact current content you have seen/read, and ensure oldString matches the file content exactly. For new files, you may freely use propose_write_file to create new files at logical paths. NEVER assume, guess, or hallucinate imports, file paths, helper functions, or APIs that you have not explicitly seen in the supplied context or read. If you need to import or use a utility or type, you MUST first verify its exact export/path/API using read-files, code_search, or glob tools. If you cannot find or verify its existence in the codebase, DO NOT invent it. After every required edit has been proposed, write the exact marker PROPOSAL_BUNDLE_COMPLETE. Do not write that marker if any requested edit is missing. Never call write_file, str_replace, spawn_agents, set_output, or any other mutating/control tool. Keep visible narration short; use your reasoning internally. Use exact current text for propose_str_replace oldString values only when present in supplied/read context. If exact replacements are brittle or full target file content is available, use propose_write_file with complete updated file content.'

    if (orchestrationPlan.mode !== 'large-bundle') {
      return base
    }

    const targetHints = orchestrationPlan.targetFileHints.slice(0, 12)
    return `${base} Large-task orchestration is active: prioritize the supplied proposalOrchestrationPlan and proposalContext before additional searching. Start from these likely target files when relevant: ${targetHints.length > 0 ? targetHints.join(', ') : 'none identified'}. Keep read-only exploration bounded to exact missing context; do not wander into unrelated absolute paths or one-file-at-a-time indefinite loops. If the task requires more files than the hints show, include the additional required files, but still return one coherent proposal bundle.`
  }

  function buildDirectProposalRequirements(
    orchestrationPlan: ProposalOrchestrationPlan,
  ): string {
    const base =
      'Produce a complete multi-file implementation proposal using only the supplied proposalContext/current file context. Do not call read_files, code_search, glob, list_directory, write_file, str_replace, spawn_agents, set_output, or any other mutating/control tool. Emit all required propose_str_replace/propose_write_file calls as one complete proposal bundle; use one propose_* call per edited file when needed. Prefer the existing repository paths and languages shown in proposalContext; do not invent a new unrelated source tree or switch implementation languages unless the user/context explicitly requests it. For edits to existing files using propose_str_replace, NEVER invent file paths — only edit existing files whose exact current content you have seen in proposalContext, and ensure oldString matches the file content exactly. For new files, you may freely use propose_write_file to create new files at logical paths. NEVER assume, guess, or hallucinate imports, file paths, helper functions, or APIs that you have not explicitly seen in the supplied context. If a utility or type is not explicitly present in the supplied proposalContext, DO NOT attempt to use or import it. If exact target context is still missing, return the smallest anchored proposal you can justify from proposalContext rather than fabricating files in unrelated directories/languages. If exact replacements are brittle or full target file content is available, use propose_write_file with complete updated file content. After every required edit has been proposed, write the exact marker PROPOSAL_BUNDLE_COMPLETE. Do not write that marker if any requested edit is missing. Keep visible narration short; use your reasoning internally.'

    if (orchestrationPlan.mode !== 'large-bundle') {
      return base
    }

    const targetHints = orchestrationPlan.targetFileHints.slice(0, 12)
    return `${base} Large-task direct retry is active because a previous attempt gathered/read searched context but did not emit proposal edits. Start from these likely target files when relevant: ${targetHints.length > 0 ? targetHints.join(', ') : 'none identified'}. If the task requires more files than the hints show, include the additional required files, but still return one coherent proposal bundle instead of searching.`
  }

  function buildProposalOrchestrationPlan(params: {
    requestContext: string
    prompts: string[]
  }): ProposalOrchestrationPlan {
    const { requestContext, prompts } = params
    const promptText = prompts.join('\n')
    const taskText = extractTaskFacingProposalContext(
      `${promptText}\n${requestContext}`,
    )
    const contextFileHints = extractContextFileHeaders(requestContext)
    const explicitTaskPaths = extractLikelyFilePaths([promptText, taskText])
    const explicitBareTaskFileNames = extractLikelyBareFileNames([
      promptText,
      taskText,
    ])
    const editableExplicitTaskPaths =
      explicitTaskPaths.filter(isLikelyEditablePath)
    const editableContextFileHints =
      contextFileHints.filter(isLikelyEditablePath)
    const bareMatchedContextFileHints = matchContextPathsByBareFileNames({
      fileNames: explicitBareTaskFileNames,
      contextPaths: editableContextFileHints,
    })
    const targetFileHints = dedupeStrings([
      ...bareMatchedContextFileHints,
      ...editableExplicitTaskPaths,
      ...editableContextFileHints,
    ]).slice(0, 18)
    const numericTouchedFileCount =
      inferExpectedTouchedFileCountFromText(taskText)
    const expectedTouchedFileCount = Math.min(
      20,
      Math.max(
        numericTouchedFileCount,
        editableExplicitTaskPaths.length,
        explicitBareTaskFileNames.length,
      ),
    )
    const searchPatternCount = extractLikelySearchPatterns([
      promptText,
      taskText,
    ]).length
    const complexSignals = countComplexTaskSignals(`${promptText}\n${taskText}`)
    const contextLength = requestContext.length
    const evidence: string[] = []

    if (numericTouchedFileCount > 0) {
      evidence.push(`numericFileCount:${numericTouchedFileCount}`)
    }
    if (explicitTaskPaths.length > 0) {
      evidence.push(`explicitPaths:${explicitTaskPaths.length}`)
    }
    if (editableExplicitTaskPaths.length > 0) {
      evidence.push(`editableExplicitPaths:${editableExplicitTaskPaths.length}`)
    }
    if (explicitBareTaskFileNames.length > 0) {
      evidence.push(`bareTaskFiles:${explicitBareTaskFileNames.length}`)
    }
    if (bareMatchedContextFileHints.length > 0) {
      evidence.push(
        `bareMatchedContextFiles:${bareMatchedContextFileHints.length}`,
      )
    }
    if (contextFileHints.length > 0) {
      evidence.push(`contextFiles:${contextFileHints.length}`)
    }
    if (editableContextFileHints.length > 0) {
      evidence.push(`editableContextFiles:${editableContextFileHints.length}`)
    }
    if (complexSignals > 0) {
      evidence.push(`complexSignals:${complexSignals}`)
    }
    if (contextLength > 60_000) {
      evidence.push(`largeContext:${contextLength}`)
    }

    const isLarge =
      expectedTouchedFileCount >= 5 ||
      targetFileHints.length >= 6 ||
      contextLength > 60_000 ||
      complexSignals >= 4
    const isSimple =
      !isLarge &&
      expectedTouchedFileCount <= 1 &&
      targetFileHints.length <= 1 &&
      complexSignals <= 1 &&
      contextLength < 12_000
    const complexity = isLarge ? 'large' : isSimple ? 'simple' : 'standard'
    const mode =
      complexity === 'large'
        ? 'large-bundle'
        : complexity === 'simple'
          ? 'simple-bundle'
          : 'standard-bundle'
    const maxBundleProposalTurns =
      complexity === 'large'
        ? Math.min(
            24,
            Math.max(
              expectedTouchedFileCount > 0 ? expectedTouchedFileCount + 4 : 0,
              targetFileHints.length > 0 ? targetFileHints.length + 2 : 0,
              12,
            ),
          )
        : undefined

    return {
      mode,
      complexity,
      expectedTouchedFileCount,
      targetFileHints,
      contextFileCount: contextFileHints.length,
      searchPatternCount,
      maxBundleProposalTurns,
      timeoutMs:
        complexity === 'large'
          ? {
              idleTimeoutMs: 420_000,
              firstProgressTimeoutMs: 900_000,
              hardTimeoutMs: 45 * 60_000,
            }
          : {},
      evidence,
      riskControls:
        complexity === 'large'
          ? [
              'parent-prefetch',
              'bounded-read-only-tools',
              'progress-aware-timeouts',
              'partial-proposal-completion',
              'fallback-apply-after-repair',
            ]
          : ['parent-prefetch', 'proposal-bundle'],
    }
  }

  function appendProposalOrchestrationPlan(params: {
    requestContext: string
    plan: ProposalOrchestrationPlan
  }): string {
    const { requestContext, plan } = params
    return truncateText(
      [
        requestContext,
        '',
        'Proposal orchestration plan:',
        `- mode: ${plan.mode}`,
        `- complexity: ${plan.complexity}`,
        `- expectedTouchedFileCount: ${plan.expectedTouchedFileCount || 'unknown'}`,
        `- targetFileHints: ${
          plan.targetFileHints.length > 0
            ? plan.targetFileHints.join(', ')
            : 'none'
        }`,
        `- riskControls: ${plan.riskControls.join(', ')}`,
        `- evidence: ${plan.evidence.join(', ') || 'none'}`,
      ].join('\n'),
      90_000,
    )
  }

  function countComplexTaskSignals(text: string): number {
    return [
      /\b(multi[- ]file|multiple files|cross[- ]file|several files|many files|few files|multiple pages|several pages|many pages|few pages|multiple screens|several screens)\b/i,
      /\b(create|add|wire|integrate|refactor|implement)\b/i,
      /\b(component|screen|overlay|command|registry|schema|provider|routing|test|tests)\b/i,
      /\bphase\s+\d+\b/i,
      /\bfull[- ]screen\b/i,
      /\b(provider|model|discovery|configuration|setup|picker)\b/i,
    ].filter((pattern) => pattern.test(text)).length
  }

  function extractContextFileHeaders(text: string): string[] {
    return dedupeStrings(
      Array.from(
        text.matchAll(
          /(?:^|\n)File:\s+([A-Za-z0-9_.@-]+(?:\/[A-Za-z0-9_.@-]+)+\.(?:ts|tsx|js|jsx|mjs|cjs|json|md|mdx|css|scss|yml|yaml|toml|txt|py|go|rs|java|kt|kts|cs|php|rb|swift|scala|lua|ex|exs|erl|clj|cljs|sh|bash|zsh))/g,
        ),
        (match) => normalizePrefetchPath(match[1]),
      ).filter(Boolean),
    )
  }

  function extractLikelyBareFileNames(texts: string[]): string[] {
    const fileNames: string[] = []
    const pattern =
      /(?:^|[\s`"'([{])([A-Za-z0-9_.@-]+\.(?:ts|tsx|js|jsx|mjs|cjs|json|md|mdx|css|scss|yml|yaml|toml|txt|py|go|rs|java|kt|kts|cs|php|rb|swift|scala|lua|ex|exs|erl|clj|cljs|sh|bash|zsh))(?:$|[\s`"',;:)\]}])/g

    for (const text of texts) {
      for (const match of text.matchAll(pattern)) {
        const fileName = match[1]
        if (fileName && !fileName.includes('/')) fileNames.push(fileName)
      }
    }

    return dedupeStrings(fileNames).filter(isLikelyEditablePath)
  }

  function matchContextPathsByBareFileNames(params: {
    fileNames: string[]
    contextPaths: string[]
  }): string[] {
    const fileNameSet = new Set(params.fileNames)
    if (fileNameSet.size === 0) return []

    return dedupeStrings(
      params.contextPaths.filter((path) => fileNameSet.has(getBaseName(path))),
    )
  }

  function getBaseName(path: string): string {
    return path.split('/').pop() ?? path
  }

  function isLikelyEditablePath(path: string): boolean {
    return !/^docs\//.test(path) && !/\.mdx?$/.test(path)
  }

  function extractTaskFacingProposalContext(value: unknown): string {
    if (typeof value !== 'string') return ''
    const contextMarker =
      '\nCurrent file/search context already gathered by the parent agent:'
    const markerIndex = value.indexOf(contextMarker)
    return markerIndex === -1 ? value : value.slice(0, markerIndex)
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
    const contextSeedTexts = [...seedTexts]
    const directPaths = extractLikelyFilePaths(seedTexts).slice(0, 12)

    if (directPaths.length > 0) {
      const { toolResult } = yield {
        toolName: 'read_files',
        input: { paths: directPaths },
        includeToolCall: false,
      } satisfies ToolCall<'read_files'>
      appendToolContextMessage(contextMessages, 'read_files', toolResult)
      directPaths.forEach((path) => readPaths.add(path))
      contextSeedTexts.push(...collectToolResultStrings(toolResult))
    }

    const referencedPathsFromPrefetch = extractLikelyFilePaths(contextSeedTexts)
      .filter((path) => !readPaths.has(path))
      .filter(shouldPrefetchPath)
      .slice(0, 12)

    if (referencedPathsFromPrefetch.length > 0) {
      const { toolResult } = yield {
        toolName: 'read_files',
        input: { paths: referencedPathsFromPrefetch },
        includeToolCall: false,
      } satisfies ToolCall<'read_files'>
      appendToolContextMessage(contextMessages, 'read_files', toolResult)
      referencedPathsFromPrefetch.forEach((path) => readPaths.add(path))
      contextSeedTexts.push(...collectToolResultStrings(toolResult))
    }

    const discoveredPaths: string[] = []
    for (const pattern of extractLikelySearchPatterns(contextSeedTexts).slice(
      0,
      8,
    )) {
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
      /(?:^|[\s`"'([{])((?:\.\/|\.\.\/)?[A-Za-z0-9_.@-]+(?:\/[A-Za-z0-9_.@-]+)+\.(?:ts|tsx|js|jsx|mjs|cjs|json|md|mdx|css|scss|yml|yaml|toml|txt|py|go|rs|java|kt|kts|cs|php|rb|swift|scala|lua|ex|exs|erl|clj|cljs|sh|bash|zsh))(?:$|[\s`"',;:)\]}])/g

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
      'API',
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

      for (const match of text.matchAll(
        /\b[A-Za-z][A-Za-z0-9]*_[A-Za-z0-9_]+\b/g,
      )) {
        const candidate = normalizeSearchPattern(match[0])
        if (candidate && !stopWords.has(candidate)) patterns.push(candidate)
      }

      for (const match of text.matchAll(
        /\b[A-Z][A-Za-z]+[0-9][A-Za-z0-9]*\b/g,
      )) {
        const candidate = normalizeSearchPattern(match[0])
        if (candidate && !stopWords.has(candidate)) patterns.push(candidate)
      }
    }

    return dedupeStrings(patterns).filter((pattern) => {
      if (pattern.length < 3 || pattern.length > 80) return false
      if (pattern.includes('/') && shouldPrefetchPath(pattern)) return false
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
      /(?:^|\n)(?:\.\/)?([A-Za-z0-9_.@-]+(?:\/[A-Za-z0-9_.@-]+)+\.(?:ts|tsx|js|jsx|mjs|cjs|json|md|mdx|css|scss|yml|yaml|toml|txt|py|go|rs|java|kt|kts|cs|php|rb|swift|scala|lua|ex|exs|erl|clj|cljs|sh|bash|zsh)):/g

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
    for (const key of ['path', 'content', 'stdout', 'stderr', 'message']) {
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

    if (message?.role === 'tool') {
      return isInternalBestOfNToolName(message.toolName)
    }

    if (message?.role === 'user') {
      const text = normalizeMessageText(getMessageText(message))
      return text.startsWith('<conversation_summary>')
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

  function isInternalBestOfNToolName(toolName: unknown): boolean {
    return [
      'spawn_agents',
      'set_messages',
      'set_output',
      'propose_str_replace',
      'propose_write_file',
    ].includes(String(toolName))
  }

  function buildSelectorRequestContext(params: {
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
    selectedImplementation?: Implementation
    selectionSource?: string
    selectorChoiceId?: string
    reason: string
    suggestedImprovements: string
  }): ReturnType<NonNullable<SecretAgentDefinition['handleSteps']>> {
    const {
      chosenImplementation,
      selectedImplementation = chosenImplementation,
      selectionSource = 'selector',
      selectorChoiceId,
      reason,
      suggestedImprovements,
    } = params

    const candidates = [
      chosenImplementation,
      ...usableImplementations.filter(
        (implementation) =>
          implementation.id !== chosenImplementation.id &&
          isUsableImplementation(implementation),
      ),
    ]
    const applyFailures: string[] = []
    const attemptedImplementationIds = new Set<string>()

    for (const candidate of candidates) {
      if (attemptedImplementationIds.has(candidate.id)) {
        applyFailures.push(
          `${candidate.id}: skipped duplicate proposal attempt.`,
        )
        continue
      }
      attemptedImplementationIds.add(candidate.id)

      let candidateToApply = candidate
      if (
        isPartialImplementation(candidate) &&
        shouldCompletePartialBeforeApplying(candidate)
      ) {
        const completedCandidate = yield* completePartialImplementation(candidate)
        if (completedCandidate) {
          candidateToApply = completedCandidate
        } else {
          applyFailures.push(
            `${candidate.id}: completion pass did not return a clean complete proposal; applying the captured proposal bundle directly.`,
          )
        }
      }

      const appliedToolResults =
        yield* applyImplementationEdits(candidateToApply)
      if (hasCleanSuccessfulAppliedEdit(appliedToolResults)) {
        yield {
          toolName: 'set_output',
          input: {
            chosenStrategy: candidateToApply.strategy,
            reason: buildAppliedReason({
              appliedImplementation: candidateToApply,
              chosenImplementation: selectedImplementation,
              reason,
            }),
            ...buildSelectionOutputFields({
              selectedImplementation,
              appliedImplementation: candidateToApply,
              selectionSource,
              selectorChoiceId,
            }),
            toolResults: getCleanAppliedToolResults(appliedToolResults),
            suggestedImprovements: '',
            proposalSummary: buildProposalSummary({
              selectedImplementation,
              appliedImplementation: candidateToApply,
              applyFailures,
              selectorNotes: suggestedImprovements,
            }),
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
              chosenImplementation: selectedImplementation,
              reason,
            }),
            ...buildSelectionOutputFields({
              selectedImplementation,
              appliedImplementation: repairedImplementation,
              selectionSource: `${selectionSource}-repair`,
              selectorChoiceId,
            }),
            toolResults: getCleanAppliedToolResults(repairedToolResults),
            suggestedImprovements: '',
            proposalSummary: buildProposalSummary({
              selectedImplementation,
              appliedImplementation: repairedImplementation,
              applyFailures,
              selectorNotes: suggestedImprovements,
            }),
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
            prompt: `Complete ${getImplementationLabel(partialImplementation)}`,
            params: {
              proposalLabel: `Complete ${getImplementationLabel(partialImplementation)}`,
              proposalPhase: 'completion',
              sourceProposalId:
                partialImplementation.sourceProposalId ??
                partialImplementation.id,
              sourceProposalLabel: getImplementationLabel(
                partialImplementation,
              ),
              proposalStrategy: `Complete ${getImplementationLabel(partialImplementation)}; re-emit one full proposal bundle.`,
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
      !hasAcceptableCompletionEvidence({
        completionResult,
        partialImplementation,
      })
    ) {
      return undefined
    }
    const completedStopReason = isPartialProposalResult(completionResult)
      ? 'cleanProposal'
      : completionResult.stopReason

    return {
      id: `${partialImplementation.id}-complete`,
      strategy: `${partialImplementation.strategy} (completed after partial proposal)`,
      label: `${getImplementationLabel(partialImplementation)} (completed)`,
      content: completionResult.unifiedDiffs || partialImplementation.content,
      toolCalls: getUsableProposalToolCalls(completionResult),
      unverifiedPaths: getUnverifiedStrReplacePaths(completionResult),
      stopReason: completedStopReason,
      proposalProgress: completionResult.proposalProgress,
      proposalBudget: completionResult.proposalBudget,
      partial: false,
      phase: 'completion',
      sourceProposalId:
        partialImplementation.sourceProposalId ?? partialImplementation.id,
      sourceProposalLabel: getImplementationLabel(partialImplementation),
    }
  }

  function* applyImplementationEdits(
    chosenImplementation: Implementation,
  ): Generator<
    ToolCall<'str_replace'> | ToolCall<'write_file'> | ToolCall<'read_files'>,
    any[],
    any
  > {
    // 1. Gather all unique paths targeted by propose_str_replace in the chosen implementation
    const strReplacePaths = dedupeStrings(
      chosenImplementation.toolCalls
        .filter((tc) => tc.toolName === 'propose_str_replace')
        .map((tc) =>
          isObject(tc.input) && typeof tc.input.path === 'string'
            ? normalizeProposalPath(tc.input.path)
            : '',
        )
        .filter(Boolean),
    )

    // 2. Perform dry-run validation if there are any str_replace paths
    if (strReplacePaths.length > 0) {
      const readFiles = yield* readFilesContent(strReplacePaths)
      const fileContentsMap = new Map<string, string>()
      for (const file of readFiles) {
        if (typeof file.path === 'string' && typeof file.content === 'string') {
          fileContentsMap.set(normalizeProposalPath(file.path), file.content)
        }
      }

      // Check each propose_str_replace tool call
      const validationFailures: string[] = []
      for (const toolCall of chosenImplementation.toolCalls) {
        if (toolCall.toolName !== 'propose_str_replace') continue
        const rawPath =
          isObject(toolCall.input) && typeof toolCall.input.path === 'string'
            ? toolCall.input.path
            : ''
        const path = normalizeProposalPath(rawPath)
        const fileContent = fileContentsMap.get(path)

        if (fileContent === undefined) {
          validationFailures.push(`Target file does not exist on disk: ${rawPath}`)
          continue
        }

        const replacements =
          isObject(toolCall.input) && Array.isArray(toolCall.input.replacements)
            ? toolCall.input.replacements
            : []
        for (const replacement of replacements) {
          if (!isObject(replacement) || typeof replacement.oldString !== 'string') {
            validationFailures.push(
              `Invalid replacement structure in propose_str_replace for ${rawPath}`,
            )
            continue
          }
          const oldString = replacement.oldString
          if (!fileContent.includes(oldString)) {
            validationFailures.push(
              `Could not find exact text to replace in ${rawPath}.\nOld string search failed.`,
            )
          }
        }
      }

      if (validationFailures.length > 0) {
        // Return a mock failed tool result so that the system treats this implementation as a failure
        return [
          {
            toolName: 'str_replace',
            errorMessage: `Dry-run validation failed:\n${validationFailures.join('\n')}`,
          },
        ]
      }
    }

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
        const input = isObject(toolCall.input)
          ? {
              ...toolCall.input,
              ...(typeof toolCall.input.path === 'string'
                ? { path: normalizeProposalPath(toolCall.input.path) }
                : {}),
            }
          : toolCall.input
        const { toolResult } = yield {
          toolName: realToolName,
          input,
          includeToolCall: true,
        } satisfies ToolCall<'str_replace'> | ToolCall<'write_file'>

        appliedToolResults.push(toolResult)
      }
    }

    return appliedToolResults
  }

  function* readFilesContent(
    paths: string[],
  ): Generator<ToolCall<'read_files'>, { path: string; content: string }[], any> {
    if (paths.length === 0) return []
    const { toolResult } = yield {
      toolName: 'read_files',
      input: { paths },
      includeToolCall: false,
    } satisfies ToolCall<'read_files'>

    return extractJsonPartValues({
      content: Array.isArray(toolResult) ? toolResult : [toolResult],
    })
      .flatMap(flattenReadFileEntries)
      .filter(
        (entry): entry is { path: string; content: string } =>
          typeof entry?.path === 'string' && typeof entry?.content === 'string',
      )
  }

  function* repairFailedImplementation(params: {
    failedImplementation: Implementation
    appliedToolResults: any[]
    verificationErrors?: string[]
  }): Generator<
    ToolCall<'read_files'> | ToolCall<'spawn_agents'>,
    Implementation | undefined,
    any
  > {
    const { failedImplementation, appliedToolResults, verificationErrors } = params
    let failureSummary = summarizeAppliedToolResults(appliedToolResults)
    if (verificationErrors && verificationErrors.length > 0) {
      failureSummary = (failureSummary ? failureSummary + '\n\n' : '') +
        `The project verification failed. Here are the compilation, typecheck, or test errors:\n${verificationErrors.join('\n')}`
    }
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
            prompt: `Repair ${getImplementationLabel(failedImplementation)}`,
            params: {
              proposalLabel: `Repair ${getImplementationLabel(failedImplementation)}`,
              proposalPhase: 'repair',
              sourceProposalId:
                failedImplementation.sourceProposalId ??
                failedImplementation.id,
              sourceProposalLabel: getImplementationLabel(failedImplementation),
              proposalStrategy: `Repair ${getImplementationLabel(failedImplementation)} after apply failure.`,
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

    if (
      !isUsableProposal(repairResult) ||
      isPartialProposalResult(repairResult)
    ) {
      return undefined
    }

    return {
      id: `${failedImplementation.id}-repair`,
      strategy: `${failedImplementation.strategy} (repaired after apply failure)`,
      label: `${getImplementationLabel(failedImplementation)} (repaired)`,
      content: repairResult.unifiedDiffs || failedImplementation.content,
      toolCalls: getUsableProposalToolCalls(repairResult),
      unverifiedPaths: getUnverifiedStrReplacePaths(repairResult),
      stopReason: repairResult.stopReason,
      proposalProgress: repairResult.proposalProgress,
      proposalBudget: repairResult.proposalBudget,
      partial: false,
      phase: 'repair',
      sourceProposalId:
        failedImplementation.sourceProposalId ?? failedImplementation.id,
      sourceProposalLabel: getImplementationLabel(failedImplementation),
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
        truncateText(
          safeJsonStringify(partialImplementation.toolCalls),
          20_000,
        ),
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

  function extractProposalResultFilePaths(
    result: ProposalResult | ProposalFailure | undefined,
  ): string[] {
    return dedupeStrings(
      [
        ...getUsableProposalToolCalls(result).map((toolCall) =>
          isObject(toolCall.input) && typeof toolCall.input.path === 'string'
            ? toolCall.input.path
            : '',
        ),
        ...getUsableProposalToolResultsFromResult(result).map(
          getEditResultPath,
        ),
      ].filter(Boolean),
    )
  }

  function hasAcceptableCompletionEvidence(params: {
    completionResult: ProposalResult | ProposalFailure | undefined
    partialImplementation: Implementation
  }): boolean {
    const { completionResult, partialImplementation } = params
    if (!isUsableProposal(completionResult)) return false
    if (!isPartialProposalResult(completionResult)) return true

    const completionToolResults =
      getUsableProposalToolResultsFromResult(completionResult)
    if (completionToolResults.some(isFailedEditResult)) {
      return false
    }

    const completionFiles = new Set(
      extractProposalResultFilePaths(completionResult),
    )
    const partialFiles = new Set(
      dedupeStrings(extractImplementationFilePaths(partialImplementation)),
    )
    const expectedTouchedFileCount =
      partialImplementation.proposalBudget?.expectedTouchedFileCount ?? 0
    const requiredFileCount = Math.max(
      partialFiles.size,
      expectedTouchedFileCount,
    )

    if (requiredFileCount > 0 && completionFiles.size < requiredFileCount) {
      return false
    }
    if (partialFiles.size > 0) {
      return [...partialFiles].every((file) => completionFiles.has(file))
    }
    return completionFiles.size > 0
  }

  function shouldCompletePartialBeforeApplying(
    implementation: Implementation,
  ): boolean {
    if (!isPartialImplementation(implementation)) return false

    const expectedTouchedFileCount =
      implementation.proposalBudget?.expectedTouchedFileCount ?? 0
    if (expectedTouchedFileCount <= 0) return false

    const proposedFileCount = new Set(
      extractImplementationFilePaths(implementation),
    ).size

    return proposedFileCount > 0 && proposedFileCount < expectedTouchedFileCount
  }

  function extractAppliedEditFilePaths(appliedToolResults: any[]): string[] {
    return flattenToolResultValues(appliedToolResults)
      .map((result) =>
        isObject(result) && typeof result.file === 'string' ? result.file : '',
      )
      .filter(Boolean)
  }

  function getInitialProposalLabel(index: number): string {
    return `Proposal #${index + 1}`
  }

  function getImplementationLabel(implementation: Implementation): string {
    if (implementation.label) return implementation.label

    const baseId = implementation.sourceProposalId ?? implementation.id
    const letterIndex = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.indexOf(baseId[0] ?? '')
    const baseLabel =
      letterIndex >= 0 ? getInitialProposalLabel(letterIndex) : baseId

    if (implementation.id.endsWith('+S')) return `${baseLabel} (synthesized)`
    if (implementation.id.endsWith('-complete'))
      return `${baseLabel} (completed)`
    if (implementation.id.endsWith('-repair')) return `${baseLabel} (repaired)`
    return baseLabel
  }

  function buildSelectionOutputFields(params: {
    selectedImplementation: Implementation
    appliedImplementation: Implementation
    selectionSource: string
    selectorChoiceId?: string
  }): Record<string, string> {
    const {
      selectedImplementation,
      appliedImplementation,
      selectionSource,
      selectorChoiceId,
    } = params

    return {
      selectedProposalId: selectedImplementation.id,
      selectedProposalLabel: getImplementationLabel(selectedImplementation),
      appliedProposalId: appliedImplementation.id,
      appliedProposalLabel: getImplementationLabel(appliedImplementation),
      selectionSource,
      ...(selectorChoiceId ? { selectorChoiceId } : {}),
    }
  }

  function buildProposalSummary(params: {
    selectedImplementation: Implementation
    appliedImplementation: Implementation
    applyFailures: string[]
    selectorNotes?: string
  }): Record<string, any> {
    const {
      selectedImplementation,
      appliedImplementation,
      applyFailures,
      selectorNotes,
    } = params
    const proposalEntries = implementations.map((implementation) => {
      const files = extractImplementationFilePaths(implementation)
      const budget = implementation.proposalBudget
        ? {
            maxProposalSteps: implementation.proposalBudget.maxProposalSteps,
            ...(typeof implementation.proposalBudget.maxBundleProposalTurns ===
            'number'
              ? {
                  maxBundleProposalTurns:
                    implementation.proposalBudget.maxBundleProposalTurns,
                }
              : {}),
            ...(typeof implementation.proposalBudget
              .expectedTouchedFileCount === 'number'
              ? {
                  expectedTouchedFileCount:
                    implementation.proposalBudget.expectedTouchedFileCount,
                }
              : {}),
            complexity: implementation.proposalBudget.complexity,
            evidence: implementation.proposalBudget.evidence,
          }
        : undefined
      return {
        id: implementation.id,
        label: getImplementationLabel(implementation),
        strategy: truncateText(implementation.strategy, 240),
        status: isUsableImplementation(implementation)
          ? isPartialImplementation(implementation)
            ? 'partial'
            : 'usable'
          : 'unusable',
        stopReason: implementation.stopReason ?? 'unknown',
        changedFileCount: new Set(files).size,
        editCallCount: implementation.toolCalls.filter(isProposalEditToolCall)
          .length,
        files: dedupeStrings(files).slice(0, 12),
        ...(implementation.proposalProgress
          ? { progress: implementation.proposalProgress }
          : {}),
        ...(budget ? { budget } : {}),
      }
    })

    return {
      selected: {
        id: selectedImplementation.id,
        label: getImplementationLabel(selectedImplementation),
      },
      applied: {
        id: appliedImplementation.id,
        label: getImplementationLabel(appliedImplementation),
      },
      totals: {
        proposals: implementations.length,
        usable: implementations.filter(isUsableImplementation).length,
        partial: implementations.filter(isPartialImplementation).length,
      },
      orchestration: proposalOrchestrationPlan,
      proposals: proposalEntries,
      applyFailures: applyFailures.slice(0, 8),
      ...(formatSelectorNotes(selectorNotes)
        ? { selectorNotes: formatSelectorNotes(selectorNotes) }
        : {}),
    }
  }

  function formatSelectorNotes(selectorNotes: string | undefined): string {
    const trimmed = selectorNotes?.trim()
    if (!trimmed) return ''
    return `Diagnostic only; do not start another proposal/fix loop from this note: ${truncateText(trimmed, 900)}`
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
    if (
      appliedImplementation.sourceProposalId &&
      appliedImplementation.sourceProposalId ===
        (chosenImplementation.sourceProposalId ?? chosenImplementation.id)
    ) {
      if (appliedImplementation.phase === 'synthesis') {
        return `${reason}\n\n${getImplementationLabel(chosenImplementation)} was synthesized with the selector improvements before applying.`
      }
      if (appliedImplementation.phase === 'completion') {
        return `${reason}\n\n${getImplementationLabel(chosenImplementation)} was partial, so it was completed into a clean full proposal before applying.`
      }
      if (appliedImplementation.phase === 'repair') {
        return `${reason}\n\n${getImplementationLabel(chosenImplementation)} failed to apply cleanly, so it was repaired against current file context before applying.`
      }
    }
    if (appliedImplementation.id === `${chosenImplementation.id}-complete`) {
      return `${reason}\n\nThe selected proposal was partial, so it was completed into a clean full proposal before applying.`
    }
    if (appliedImplementation.id === `${chosenImplementation.id}-repair`) {
      return `${reason}\n\nThe selected implementation failed to apply cleanly, so it was repaired against current file context before applying.`
    }
    return `${reason}\n\nThe originally selected implementation failed to apply cleanly, so ${getImplementationLabel(appliedImplementation)} was applied instead.`
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

  // === NEW VERIFICATION AND REPAIR HELPERS ===

  interface ProjectInfo {
    packageManager: 'bun' | 'pnpm' | 'yarn' | 'npm'
    hasTsConfig: boolean
    hasTypecheckScript: boolean
    hasTestScript: boolean
  }

  interface CandidateVerificationResult {
    candidateId: string
    appliedCleanly: boolean
    typecheckPassed: boolean | null
    testsPassed: boolean | null
    verificationPassed: boolean
    verificationErrors: string[]
    repairRoundsUsed: number
    finalImplementation: Implementation
  }

  function* detectProjectInfo(): Generator<any, ProjectInfo, any> {
    let packageManager: 'bun' | 'pnpm' | 'yarn' | 'npm' = 'npm'
    
    const { toolResult: rootFiles } = yield {
      toolName: 'list_directory',
      input: { path: '.' },
      includeToolCall: false,
    } satisfies ToolCall<'list_directory'>
    
    const fileList = Array.isArray(rootFiles) ? rootFiles : []
    const fileNames = fileList.map((f: any) =>
      isObject(f) && typeof f.name === 'string' ? f.name : ''
    ).filter(Boolean)
    
    if (fileNames.includes('bun.lockb')) {
      packageManager = 'bun'
    } else if (fileNames.includes('pnpm-lock.yaml')) {
      packageManager = 'pnpm'
    } else if (fileNames.includes('yarn.lock')) {
      packageManager = 'yarn'
    }
    
    const hasTsConfig = fileNames.includes('tsconfig.json')
    let hasTypecheckScript = false
    let hasTestScript = false
    
    if (fileNames.includes('package.json')) {
      const readFilesResult = yield* readFilesContent(['package.json'])
      const packageJsonFile = readFilesResult.find((f) => f.path === 'package.json')
      if (packageJsonFile) {
        try {
          const content = JSON.parse(packageJsonFile.content)
          const scripts = content?.scripts || {}
          hasTypecheckScript = typeof scripts.typecheck === 'string'
          hasTestScript =
            typeof scripts.test === 'string' &&
            scripts.test !== 'echo "Error: no test specified" && exit 1'
        } catch {
          // ignore
        }
      }
    }
    
    return {
      packageManager,
      hasTsConfig,
      hasTypecheckScript,
      hasTestScript,
    }
  }

  function* runVerificationCommand(
    command: string,
  ): Generator<
    ToolCall<'run_terminal_command'>,
    { exitCode: number; stdout: string; stderr: string; success: boolean },
    any
  > {
    const { toolResult } = yield {
      toolName: 'run_terminal_command',
      input: {
        command,
        timeout_seconds: 45,
      },
      includeToolCall: false,
    } satisfies ToolCall<'run_terminal_command'>
    
    const result = Array.isArray(toolResult) ? toolResult[0] : toolResult
    let exitCode = 1
    let stdout = ''
    let stderr = ''
    
    if (isObject(result)) {
      if (result.type === 'json' && isObject(result.value)) {
        const val = result.value
        exitCode = typeof val.exitCode === 'number' ? val.exitCode : (val.errorMessage ? 1 : 0)
        stdout = typeof val.stdout === 'string' ? val.stdout : ''
        stderr = typeof val.stderr === 'string' ? val.stderr : ''
      } else {
        exitCode = typeof result.exitCode === 'number' ? result.exitCode : 1
        stdout = typeof result.stdout === 'string' ? result.stdout : ''
        stderr = typeof result.stderr === 'string' ? result.stderr : ''
      }
    }
    
    return {
      exitCode,
      stdout,
      stderr,
      success: exitCode === 0,
    }
  }

  function* resetWorkspace(): Generator<any, boolean, any> {
    const resetCmd = 'git checkout -- . && git clean -fd -e evals/multieditor-vs-default'
    const res = yield* runVerificationCommand(resetCmd)
    return res.success
  }

  function* verifyImplementation(
    projectInfo: ProjectInfo,
  ): Generator<any, { typecheckPassed: boolean | null; testsPassed: boolean | null; errors: string[] }, any> {
    let typecheckPassed: boolean | null = null
    let testsPassed: boolean | null = null
    const errors: string[] = []
    
    const pm = projectInfo.packageManager
    const runCmd = pm === 'npm' ? 'npm run' : `${pm} run`
    
    if (projectInfo.hasTypecheckScript) {
      const cmd = `${runCmd} typecheck`
      const res = yield* runVerificationCommand(cmd)
      typecheckPassed = res.success
      if (!res.success) {
        errors.push(`Typecheck failed (${cmd}):\n${res.stdout}\n${res.stderr}`)
      }
    } else if (projectInfo.hasTsConfig) {
      const tscCmd = pm === 'npm' ? 'npx tsc --noEmit' : pm === 'pnpm' ? 'pnpm exec tsc --noEmit' : `${pm} x tsc --noEmit`
      const res = yield* runVerificationCommand(tscCmd)
      typecheckPassed = res.success
      if (!res.success) {
        errors.push(`Typecheck failed (${tscCmd}):\n${res.stdout}\n${res.stderr}`)
      }
    }
    
    if (projectInfo.hasTestScript) {
      const testCmd = pm === 'npm' ? 'npm test' : `${pm} test`
      const res = yield* runVerificationCommand(testCmd)
      testsPassed = res.success
      if (!res.success) {
        errors.push(`Tests failed (${testCmd}):\n${res.stdout}\n${res.stderr}`)
      }
    }
    
    return {
      typecheckPassed,
      testsPassed,
      errors,
    }
  }

  function rankVerifiedResults(
    results: CandidateVerificationResult[],
  ): CandidateVerificationResult[] {
    return [...results].sort((a, b) => {
      if (a.verificationPassed !== b.verificationPassed) {
        return a.verificationPassed ? -1 : 1
      }
      
      const aTypecheck = a.typecheckPassed === true
      const bTypecheck = b.typecheckPassed === true
      if (aTypecheck !== bTypecheck) {
        return aTypecheck ? -1 : 1
      }
      
      if (a.appliedCleanly !== b.appliedCleanly) {
        return a.appliedCleanly ? -1 : 1
      }
      
      if (a.repairRoundsUsed !== b.repairRoundsUsed) {
        return a.repairRoundsUsed - b.repairRoundsUsed
      }
      
      return 0
    })
  }
}

const definition = {
  ...createMultiPromptEditor(),
  id: 'editor-multi-prompt',
}
export default definition
