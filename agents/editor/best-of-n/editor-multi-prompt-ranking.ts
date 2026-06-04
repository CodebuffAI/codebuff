export interface CandidateVerificationResult<Implementation> {
  candidateId: string
  appliedCleanly: boolean
  typecheckPassed: boolean | null
  testsPassed: boolean | null
  verificationAttempted: boolean
  verificationConclusive: boolean
  verificationPassed: boolean
  verificationErrors: string[]
  repairRoundsUsed: number
  diffSize: number
  finalImplementation: Implementation
}

// Two results are in the same verification tier when all of the discrete
// (non-tiebreaker) ranking criteria match. This MUST stay consistent with the
// ordered fields rankVerifiedResults compares before its repairRoundsUsed/
// diffSize tiebreakers, so the "highest tier" grouping never splits or merges
// candidates differently than the ranker ordered them. typecheckPassed and
// testsPassed use `=== true` here (matching the ranker), so null and false
// intentionally collapse into the same "not passed" bucket.
export function sameVerificationTier<Implementation>(
  a: CandidateVerificationResult<Implementation>,
  b: CandidateVerificationResult<Implementation>,
): boolean {
  return (
    a.verificationPassed === b.verificationPassed &&
    a.verificationConclusive === b.verificationConclusive &&
    a.verificationAttempted === b.verificationAttempted &&
    (a.typecheckPassed === true) === (b.typecheckPassed === true) &&
    (a.testsPassed === true) === (b.testsPassed === true) &&
    a.appliedCleanly === b.appliedCleanly
  )
}

export function rankVerifiedResults<Implementation>(
  results: CandidateVerificationResult<Implementation>[],
): CandidateVerificationResult<Implementation>[] {
  return [...results].sort((a, b) => {
    if (a.verificationPassed !== b.verificationPassed) {
      return a.verificationPassed ? -1 : 1
    }

    if (a.verificationConclusive !== b.verificationConclusive) {
      return a.verificationConclusive ? 1 : -1
    }

    if (a.verificationAttempted !== b.verificationAttempted) {
      return a.verificationAttempted ? -1 : 1
    }

    const aTypecheck = a.typecheckPassed === true
    const bTypecheck = b.typecheckPassed === true
    if (aTypecheck !== bTypecheck) {
      return aTypecheck ? -1 : 1
    }

    const aTests = a.testsPassed === true
    const bTests = b.testsPassed === true
    if (aTests !== bTests) {
      return aTests ? -1 : 1
    }

    if (a.appliedCleanly !== b.appliedCleanly) {
      return a.appliedCleanly ? -1 : 1
    }

    if (a.repairRoundsUsed !== b.repairRoundsUsed) {
      return a.repairRoundsUsed - b.repairRoundsUsed
    }

    if (a.diffSize !== b.diffSize) {
      return a.diffSize - b.diffSize
    }

    return 0
  })
}

export function getImplementationDiffSize(params: {
  content: string
  toolCalls: Array<{ input: unknown }>
  isObject: (value: unknown) => value is Record<string, any>
}): number {
  const { content, toolCalls, isObject } = params
  if (content.trim()) {
    return content.split('\n').length
  }

  return toolCalls.reduce((total, toolCall) => {
    if (!isObject(toolCall.input)) return total + 1
    const replacements = Array.isArray(toolCall.input.replacements)
      ? toolCall.input.replacements
      : []
    const replacementSize = replacements.reduce((sum, replacement) => {
      if (!isObject(replacement)) return sum + 1
      return (
        sum +
        String(replacement.oldString ?? replacement.old ?? '').split('\n')
          .length +
        String(replacement.newString ?? replacement.new ?? '').split('\n')
          .length
      )
    }, 0)
    const contentSize =
      typeof toolCall.input.content === 'string'
        ? toolCall.input.content.split('\n').length
        : 0
    return total + Math.max(1, replacementSize + contentSize)
  }, 0)
}
