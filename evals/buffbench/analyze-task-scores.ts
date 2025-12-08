#!/usr/bin/env bun
/**
 * Analyze task scores from BuffBench evaluation logs
 *
 * Usage: bun run evals/buffbench/analyze-task-scores.ts [--runs N] [--output FILE] [--dir DIR]
 *
 * Options:
 *   --runs N      Number of recent runs to analyze (default: 10, ignored if --dir is specified)
 *   --output FILE Output file path (default: prints to stdout)
 *   --dir DIR     Specific log directory to analyze (can be specified multiple times)
 *   --threshold N Score threshold for "hard" tasks (default: 7.5)
 */

import { readdir, readFile } from 'fs/promises'
import { join } from 'path'

const LOGS_DIR = join(import.meta.dir, 'logs')

interface JudgeResult {
  overallScore?: number
  completionScore?: number
  codeQualityScore?: number
}

interface EvalResult {
  agentId: string
  commitSha: string
  cost?: number
  durationMs?: number
  judgeResult?: JudgeResult
}

interface TaskScore {
  taskNum: number
  taskName: string
  scores: number[]
  runs: string[]
}

async function getLogDirectories(): Promise<string[]> {
  const entries = await readdir(LOGS_DIR)
  // Sort by date (directories are named like 2025-12-03T00-33_...)
  return entries.sort().reverse()
}

async function extractTaskScores(
  logDir: string,
): Promise<Map<string, { score: number; taskNum: number; taskName: string }>> {
  const dirPath = join(LOGS_DIR, logDir)
  const files = await readdir(dirPath)

  const taskScores = new Map<
    string,
    { score: number; taskNum: number; taskName: string }
  >()

  for (const file of files) {
    // Skip ANALYSIS and FINAL_RESULTS files
    if (file.includes('ANALYSIS') || file === 'FINAL_RESULTS.json') continue
    if (!file.endsWith('.json')) continue

    // Parse filename: {taskNum}-{taskName}-{agent}-{hash}.json
    const match = file.match(/^(\d+)-(.+?)-(?:[^-]+-)?[a-f0-9]+\.json$/)
    if (!match) continue

    const taskNum = parseInt(match[1], 10)
    // Extract task name by removing the agent suffix
    const parts = file.replace('.json', '').split('-')
    // Remove task number, hash, and find where task name ends
    const hashIndex = parts.length - 1
    let taskNameEndIndex = hashIndex - 1

    // Find where the agent name starts (common patterns)
    for (let i = parts.length - 2; i > 0; i--) {
      if (
        parts[i].startsWith('base2') ||
        parts[i].startsWith('external') ||
        parts[i] === 'claude' ||
        parts[i] === 'codex'
      ) {
        taskNameEndIndex = i - 1
        break
      }
    }

    const taskName = parts.slice(1, taskNameEndIndex + 1).join('-')

    try {
      const content = await readFile(join(dirPath, file), 'utf-8')
      const data: EvalResult = JSON.parse(content)

      if (data.judgeResult?.overallScore !== undefined) {
        const key = `${taskNum}-${taskName}`
        // Take the first score we find for each task (they should be the same across agents)
        if (!taskScores.has(key)) {
          taskScores.set(key, {
            score: data.judgeResult.overallScore,
            taskNum,
            taskName,
          })
        }
      }
    } catch {
      // Skip files that can't be parsed
    }
  }

  return taskScores
}

async function analyzeScores(numRuns: number): Promise<{
  taskStats: Map<
    string,
    {
      taskNum: number
      taskName: string
      scores: number[]
      avg: number
      min: number
      max: number
    }
  >
  runsAnalyzed: string[]
}> {
  const logDirs = await getLogDirectories()
  const taskStats = new Map<
    string,
    {
      taskNum: number
      taskName: string
      scores: number[]
      avg: number
      min: number
      max: number
    }
  >()
  const runsAnalyzed: string[] = []

  let runsProcessed = 0

  for (const logDir of logDirs) {
    if (runsProcessed >= numRuns) break

    try {
      const scores = await extractTaskScores(logDir)

      // Skip empty runs
      if (scores.size === 0) continue

      runsAnalyzed.push(logDir)
      runsProcessed++

      for (const [key, { score, taskNum, taskName }] of scores) {
        if (!taskStats.has(key)) {
          taskStats.set(key, {
            taskNum,
            taskName,
            scores: [],
            avg: 0,
            min: Infinity,
            max: -Infinity,
          })
        }

        const stats = taskStats.get(key)!
        stats.scores.push(score)
        stats.min = Math.min(stats.min, score)
        stats.max = Math.max(stats.max, score)
      }
    } catch {
      // Skip directories that can't be processed
    }
  }

  // Calculate averages
  for (const stats of taskStats.values()) {
    stats.avg = stats.scores.reduce((a, b) => a + b, 0) / stats.scores.length
  }

  return { taskStats, runsAnalyzed }
}

function generateMarkdownReport(
  taskStats: Map<
    string,
    {
      taskNum: number
      taskName: string
      scores: number[]
      avg: number
      min: number
      max: number
    }
  >,
  runsAnalyzed: string[],
): string {
  const sortedTasks = Array.from(taskStats.values()).sort(
    (a, b) => a.avg - b.avg,
  )

  const overallAvg =
    sortedTasks.reduce((sum, t) => sum + t.avg, 0) / sortedTasks.length

  let output = `# BuffBench Task Score Analysis

Generated: ${new Date().toISOString()}

## Summary Statistics

| Metric | Value |
|--------|-------|
| Total Tasks | ${sortedTasks.length} |
| Runs Analyzed | ${runsAnalyzed.length} |
| Overall Average Score | ${overallAvg.toFixed(2)} |

### Runs Included
${runsAnalyzed.map((r) => `- \`${r}\``).join('\n')}

## Tasks Ordered by Average Score (Lowest to Highest)

| Rank | Task # | Task Name | Avg Score | Min | Max | Runs |
|------|--------|-----------|-----------|-----|-----|------|
`

  sortedTasks.forEach((task, index) => {
    output += `| ${index + 1} | ${task.taskNum} | ${task.taskName} | ${task.avg.toFixed(2)} | ${task.min.toFixed(1)} | ${task.max.toFixed(1)} | ${task.scores.length} |\n`
  })

  // Add hardest tasks section
  const hardestTasks = sortedTasks.filter((t) => t.avg < 6.0)
  if (hardestTasks.length > 0) {
    output += `
## Hardest Tasks (Avg < 6.0)

| Task | Avg Score | Min | Max | Variance |
|------|-----------|-----|-----|----------|
`
    hardestTasks.forEach((task) => {
      output += `| ${task.taskName} | ${task.avg.toFixed(2)} | ${task.min.toFixed(1)} | ${task.max.toFixed(1)} | ${(task.max - task.min).toFixed(1)} |\n`
    })
  }

  // Add easiest tasks section
  const easiestTasks = sortedTasks.filter((t) => t.avg >= 9.4)
  if (easiestTasks.length > 0) {
    output += `
## Easiest Tasks (Avg >= 9.4)

| Task | Avg Score | Min | Max |
|------|-----------|-----|-----|
`
    easiestTasks.forEach((task) => {
      output += `| ${task.taskName} | ${task.avg.toFixed(2)} | ${task.min.toFixed(1)} | ${task.max.toFixed(1)} |\n`
    })
  }

  // Add high variance tasks
  const highVarianceTasks = sortedTasks
    .filter((t) => t.max - t.min >= 5.0)
    .sort((a, b) => b.max - b.min - (a.max - a.min))

  if (highVarianceTasks.length > 0) {
    output += `
## High Variance Tasks (Range >= 5.0)

| Task | Avg | Min | Max | Range |
|------|-----|-----|-----|-------|
`
    highVarianceTasks.forEach((task) => {
      output += `| ${task.taskName} | ${task.avg.toFixed(2)} | ${task.min.toFixed(1)} | ${task.max.toFixed(1)} | ${(task.max - task.min).toFixed(1)} |\n`
    })
  }

  output += `
## Notes

- No explicit difficulty field exists in the eval task data schema
- Average score serves as a proxy for task difficulty (lower = harder)
- High variance tasks may benefit from more specific prompts or additional test cases
- Scores range from 0-10, where 10 is a perfect implementation
`

  return output
}

function generateJsonReport(
  taskStats: Map<
    string,
    {
      taskNum: number
      taskName: string
      scores: number[]
      avg: number
      min: number
      max: number
    }
  >,
  runsAnalyzed: string[],
): string {
  const sortedTasks = Array.from(taskStats.values()).sort(
    (a, b) => a.avg - b.avg,
  )

  return JSON.stringify(
    {
      generated: new Date().toISOString(),
      summary: {
        totalTasks: sortedTasks.length,
        runsAnalyzed: runsAnalyzed.length,
        overallAverage:
          sortedTasks.reduce((sum, t) => sum + t.avg, 0) / sortedTasks.length,
      },
      runsIncluded: runsAnalyzed,
      tasks: sortedTasks.map((task, index) => ({
        rank: index + 1,
        taskNum: task.taskNum,
        taskName: task.taskName,
        avgScore: Math.round(task.avg * 100) / 100,
        minScore: task.min,
        maxScore: task.max,
        numRuns: task.scores.length,
        scores: task.scores,
      })),
    },
    null,
    2,
  )
}

async function analyzeSpecificDirs(dirs: string[]): Promise<{
  taskStats: Map<
    string,
    {
      taskNum: number
      taskName: string
      scores: number[]
      avg: number
      min: number
      max: number
    }
  >
  runsAnalyzed: string[]
}> {
  const taskStats = new Map<
    string,
    {
      taskNum: number
      taskName: string
      scores: number[]
      avg: number
      min: number
      max: number
    }
  >()
  const runsAnalyzed: string[] = []

  for (const logDir of dirs) {
    try {
      const scores = await extractTaskScores(logDir)

      if (scores.size === 0) {
        console.error(`Warning: No scores found in ${logDir}`)
        continue
      }

      runsAnalyzed.push(logDir)

      for (const [key, { score, taskNum, taskName }] of scores) {
        if (!taskStats.has(key)) {
          taskStats.set(key, {
            taskNum,
            taskName,
            scores: [],
            avg: 0,
            min: Infinity,
            max: -Infinity,
          })
        }

        const stats = taskStats.get(key)!
        stats.scores.push(score)
        stats.min = Math.min(stats.min, score)
        stats.max = Math.max(stats.max, score)
      }
    } catch (e) {
      console.error(`Error processing ${logDir}:`, e)
    }
  }

  for (const stats of taskStats.values()) {
    stats.avg = stats.scores.reduce((a, b) => a + b, 0) / stats.scores.length
  }

  return { taskStats, runsAnalyzed }
}

async function main() {
  const args = process.argv.slice(2)
  let numRuns = 10
  let outputFile: string | null = null
  let format: 'markdown' | 'json' = 'markdown'
  const specificDirs: string[] = []
  let hardThreshold = 7.5

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--runs' && args[i + 1]) {
      numRuns = parseInt(args[i + 1], 10)
      i++
    } else if (args[i] === '--output' && args[i + 1]) {
      outputFile = args[i + 1]
      i++
    } else if (args[i] === '--dir' && args[i + 1]) {
      specificDirs.push(args[i + 1])
      i++
    } else if (args[i] === '--threshold' && args[i + 1]) {
      hardThreshold = parseFloat(args[i + 1])
      i++
    } else if (args[i] === '--json') {
      format = 'json'
    } else if (args[i] === '--help' || args[i] === '-h') {
      console.log(`
BuffBench Task Score Analyzer

Usage: bun run analyze-task-scores.ts [OPTIONS]

Options:
  --runs N       Number of recent runs to analyze (default: 10, ignored if --dir is used)
  --dir DIR      Specific log directory to analyze (can be used multiple times)
  --threshold N  Score threshold for "hard" tasks (default: 7.5)
  --output FILE  Write output to file instead of stdout
  --json         Output JSON instead of Markdown
  --help, -h     Show this help message

Examples:
  bun run analyze-task-scores.ts
  bun run analyze-task-scores.ts --runs 5
  bun run analyze-task-scores.ts --dir 2025-12-07T21-57_base2
  bun run analyze-task-scores.ts --dir 2025-12-07T21-57_base2 --threshold 7.5 --json
  bun run analyze-task-scores.ts --runs 10 --output task-scores.md
`)
      process.exit(0)
    }
  }

  let taskStats: Map<
    string,
    {
      taskNum: number
      taskName: string
      scores: number[]
      avg: number
      min: number
      max: number
    }
  >
  let runsAnalyzed: string[]

  if (specificDirs.length > 0) {
    console.error(`Analyzing specific directories: ${specificDirs.join(', ')}`)
    const result = await analyzeSpecificDirs(specificDirs)
    taskStats = result.taskStats
    runsAnalyzed = result.runsAnalyzed
  } else {
    console.error(`Analyzing last ${numRuns} runs...`)
    const result = await analyzeScores(numRuns)
    taskStats = result.taskStats
    runsAnalyzed = result.runsAnalyzed
  }

  console.error(`Found ${taskStats.size} tasks across ${runsAnalyzed.length} runs`)

  // Print hard tasks summary to stderr
  const sortedTasks = Array.from(taskStats.values()).sort((a, b) => a.avg - b.avg)
  const hardTasks = sortedTasks.filter((t) => t.avg <= hardThreshold)
  if (hardTasks.length > 0) {
    console.error(`\n=== Hard Tasks (avg <= ${hardThreshold}) ===`)
    console.error(`Task IDs: ${hardTasks.map((t) => t.taskName).join(', ')}`)
  }

  const output =
    format === 'json'
      ? generateJsonReport(taskStats, runsAnalyzed)
      : generateMarkdownReport(taskStats, runsAnalyzed)

  if (outputFile) {
    await Bun.write(outputFile, output)
    console.error(`Output written to ${outputFile}`)
  } else {
    console.log(output)
  }
}

main().catch(console.error)
