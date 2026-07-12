export type CodingHarnessRunMetrics = {
  taskId: string
  variant: string
  success: boolean
  firstPassSuccess: boolean
  editAttempts: number
  revertedEdits: number
  diagnosticsBefore: number
  diagnosticsAfter: number
  requirementsSatisfied: number
  requirementsTotal: number
  filesReadBeforeFirstCorrectEdit: number
  tokens: number
  latencyMs: number
  costUsd?: number
}

export type CodingHarnessAggregate = {
  runs: number
  successRate: number
  firstPassRate: number
  averageEditAttempts: number
  averageDiagnosticReduction: number
  requirementCompletionRate: number
  averageTokens: number
  averageLatencyMs: number
}

export function aggregateCodingHarnessMetrics(
  runs: CodingHarnessRunMetrics[],
): CodingHarnessAggregate {
  if (runs.length === 0) {
    return {
      runs: 0, successRate: 0, firstPassRate: 0, averageEditAttempts: 0,
      averageDiagnosticReduction: 0, requirementCompletionRate: 0,
      averageTokens: 0, averageLatencyMs: 0,
    }
  }
  const sum = (values: number[]) => values.reduce((a, b) => a + b, 0)
  return {
    runs: runs.length,
    successRate: runs.filter((run) => run.success).length / runs.length,
    firstPassRate:
      runs.filter((run) => run.firstPassSuccess).length / runs.length,
    averageEditAttempts:
      sum(runs.map((run) => run.editAttempts)) / runs.length,
    averageDiagnosticReduction:
      sum(
        runs.map((run) => run.diagnosticsBefore - run.diagnosticsAfter),
      ) / runs.length,
    requirementCompletionRate:
      sum(runs.map((run) => run.requirementsSatisfied)) /
      Math.max(1, sum(runs.map((run) => run.requirementsTotal))),
    averageTokens: sum(runs.map((run) => run.tokens)) / runs.length,
    averageLatencyMs: sum(runs.map((run) => run.latencyMs)) / runs.length,
  }
}
