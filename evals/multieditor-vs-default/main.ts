import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import {
  editorRunResultSchema,
  multieditorEvalSuiteSchema,
  type ComparisonScore,
  type EditorRunResult,
} from './types'

function scoreRun(result: EditorRunResult): number {
  let score = 0
  if (result.appliedCleanly) score += 2
  if (result.validationPassed) score += 3
  if (result.satisfiedTask) score += 3
  score -= Math.min(result.hallucinatedPaths, 3)
  score -= Math.min(Math.max(result.changedFiles - 8, 0), 2) * 0.5
  if (typeof result.reviewerScore === 'number') {
    score += result.reviewerScore / 5
  }
  return Math.max(0, Math.min(10, Math.round(score * 10) / 10))
}

function compareTask(params: {
  taskId: string
  defaultRun: EditorRunResult | undefined
  multieditorRun: EditorRunResult | undefined
}): ComparisonScore {
  const defaultScore = params.defaultRun
    ? scoreRun(params.defaultRun)
    : undefined
  const multieditorScore = params.multieditorRun
    ? scoreRun(params.multieditorRun)
    : undefined

  if (defaultScore === undefined || multieditorScore === undefined) {
    return {
      taskId: params.taskId,
      defaultScore,
      multieditorScore,
      winner: 'incomplete',
    }
  }
  if (defaultScore === multieditorScore) {
    return {
      taskId: params.taskId,
      defaultScore,
      multieditorScore,
      winner: 'tie',
    }
  }
  return {
    taskId: params.taskId,
    defaultScore,
    multieditorScore,
    winner: multieditorScore > defaultScore ? 'multieditor' : 'default',
  }
}

async function loadJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, 'utf8'))
}

async function main() {
  const suitePath = resolve(
    process.argv[2] ?? 'multieditor-vs-default/sample-suite.json',
  )
  const resultsPath = process.argv[3] ? resolve(process.argv[3]) : undefined

  const suite = multieditorEvalSuiteSchema.parse(await loadJson(suitePath))
  const rawResults = resultsPath ? await loadJson(resultsPath) : []
  const results = editorRunResultSchema.array().parse(rawResults)

  const comparisons = suite.tasks.map((task) =>
    compareTask({
      taskId: task.id,
      defaultRun: results.find(
        (result) =>
          result.taskId === task.id && result.editorKind === 'default',
      ),
      multieditorRun: results.find(
        (result) =>
          result.taskId === task.id && result.editorKind === 'multieditor',
      ),
    }),
  )

  const summary = {
    suite: suite.name,
    tasks: suite.tasks.length,
    wins: {
      default: comparisons.filter((item) => item.winner === 'default').length,
      multieditor: comparisons.filter((item) => item.winner === 'multieditor')
        .length,
      tie: comparisons.filter((item) => item.winner === 'tie').length,
      incomplete: comparisons.filter((item) => item.winner === 'incomplete')
        .length,
    },
    comparisons,
  }

  console.log(JSON.stringify(summary, null, 2))
}

await main()
