import fs from 'fs'

export interface EvalbuffLogEntry {
  taskId: string
  timestamp: string
  oldScore: number
  newScore: number | null
  docEdit: {
    path: string
    reasoning: string
  } | null
  scoreComparison: 'improved' | 'same' | 'worse' | null
  costUsd: number
  durationMs: number
  error?: string
  criteriaLevel: number
}

export interface MorningReportData {
  startTime: string
  endTime: string
  totalIterations: number
  totalCostUsd: number
  totalDurationMs: number
  avgOldScore: number
  avgNewScore: number
  docsAdded: number
  docsKept: number
  docsReverted: number
  criteriaLevel: number
  entries: EvalbuffLogEntry[]
}

export function generateMorningReport(logPath: string): string {
  if (!fs.existsSync(logPath)) {
    return generateEmptyReport()
  }

  const content = fs.readFileSync(logPath, 'utf-8').trim()
  if (!content) {
    return generateEmptyReport()
  }

  const entries: EvalbuffLogEntry[] = content
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line))

  const data = computeReportData(entries)
  return formatReport(data)
}

function generateEmptyReport(): string {
  return `# Evalbuff Morning Report

**No iterations were run.** The log file is empty or missing.

| Metric | Value |
|--------|-------|
| Iterations | 0 |
| Total Cost | $0.00 |
| Total Duration | 0s |
| Docs Added | 0 |
| Docs Kept | 0 |
| Criteria Level | - |
`
}

function computeReportData(entries: EvalbuffLogEntry[]): MorningReportData {
  const oldScores = entries.map((e) => e.oldScore)
  const newScores = entries
    .filter((e) => e.newScore !== null)
    .map((e) => e.newScore!)

  const docsAdded = entries.filter((e) => e.docEdit !== null).length
  const docsKept = entries.filter((e) => e.scoreComparison === 'improved').length
  const docsReverted = docsAdded - docsKept

  return {
    startTime: entries[0]?.timestamp || '',
    endTime: entries[entries.length - 1]?.timestamp || '',
    totalIterations: entries.length,
    totalCostUsd: entries.reduce((sum, e) => sum + e.costUsd, 0),
    totalDurationMs: entries.reduce((sum, e) => sum + e.durationMs, 0),
    avgOldScore:
      oldScores.length > 0
        ? oldScores.reduce((a, b) => a + b, 0) / oldScores.length
        : 0,
    avgNewScore:
      newScores.length > 0
        ? newScores.reduce((a, b) => a + b, 0) / newScores.length
        : 0,
    docsAdded,
    docsKept,
    docsReverted,
    criteriaLevel: entries[entries.length - 1]?.criteriaLevel || 1,
    entries,
  }
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  if (hours > 0) return `${hours}h ${minutes % 60}m`
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`
  return `${seconds}s`
}

function formatReport(data: MorningReportData): string {
  const lines: string[] = [
    '# Evalbuff Morning Report',
    '',
    `**Run:** ${data.startTime || 'N/A'} to ${data.endTime || 'N/A'}`,
    '',
    '## Summary',
    '',
    '| Metric | Value |',
    '|--------|-------|',
    `| Iterations | ${data.totalIterations} |`,
    `| Total Cost | $${data.totalCostUsd.toFixed(2)} |`,
    `| Total Duration | ${formatDuration(data.totalDurationMs)} |`,
    `| Avg Score (before docs) | ${data.avgOldScore.toFixed(1)} |`,
    `| Avg Score (after docs) | ${data.avgNewScore > 0 ? data.avgNewScore.toFixed(1) : 'N/A'} |`,
    `| Docs Attempted | ${data.docsAdded} |`,
    `| Docs Kept (improved score) | ${data.docsKept} |`,
    `| Docs Reverted | ${data.docsReverted} |`,
    `| Criteria Level | ${data.criteriaLevel}/5 |`,
    '',
  ]

  // Doc changes table
  const docEntries = data.entries.filter((e) => e.docEdit !== null)
  if (docEntries.length > 0) {
    lines.push('## Doc Changes')
    lines.push('')
    lines.push('| Task | Doc Path | Score Impact | Kept? | Reasoning |')
    lines.push('|------|----------|-------------|-------|-----------|')
    for (const entry of docEntries) {
      const impact =
        entry.newScore !== null
          ? `${entry.oldScore.toFixed(1)} -> ${entry.newScore.toFixed(1)}`
          : 'N/A'
      const kept = entry.scoreComparison === 'improved' ? 'Yes' : 'No'
      const reasoning =
        entry.docEdit!.reasoning.length > 60
          ? entry.docEdit!.reasoning.slice(0, 57) + '...'
          : entry.docEdit!.reasoning
      lines.push(
        `| ${entry.taskId} | ${entry.docEdit!.path} | ${impact} | ${kept} | ${reasoning} |`,
      )
    }
    lines.push('')
  }

  // Failed iterations
  const failedEntries = data.entries.filter((e) => e.error)
  if (failedEntries.length > 0) {
    lines.push('## Errors')
    lines.push('')
    lines.push('| Task | Error |')
    lines.push('|------|-------|')
    for (const entry of failedEntries) {
      const errorMsg =
        entry.error!.length > 80
          ? entry.error!.slice(0, 77) + '...'
          : entry.error!
      lines.push(`| ${entry.taskId} | ${errorMsg} |`)
    }
    lines.push('')
  }

  // Score trajectory
  lines.push('## Score Trajectory')
  lines.push('')
  lines.push('```')
  for (const entry of data.entries) {
    const bar = '#'.repeat(Math.round(entry.oldScore))
    const newBar =
      entry.newScore !== null
        ? ` -> ${'#'.repeat(Math.round(entry.newScore))}`
        : ''
    lines.push(
      `${entry.taskId.padEnd(20)} ${entry.oldScore.toFixed(1).padStart(4)} ${bar}${newBar}`,
    )
  }
  lines.push('```')

  return lines.join('\n')
}

export function appendLogEntry(
  logPath: string,
  entry: EvalbuffLogEntry,
): void {
  fs.appendFileSync(logPath, JSON.stringify(entry) + '\n')
}
