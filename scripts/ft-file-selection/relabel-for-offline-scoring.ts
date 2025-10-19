import {
  castAssistantMessage,
  messagesWithSystem,
} from '@codebuff/agent-runtime/util/messages'
import { promptAiSdk } from '@codebuff/backend/llm-apis/vercel-ai-sdk/ai-sdk'
import {
  getTracesAndRelabelsForUser,
  insertRelabel,
  setupBigQuery,
} from '@codebuff/bigquery'
import {
  finetunedVertexModelNames,
  finetunedVertexModels,
  models,
  TEST_USER_ID,
} from '@codebuff/common/old-constants'
import { generateCompactId } from '@codebuff/common/util/string'

import { isValidationSample } from './collect-tuning-data'

import type { System } from '@codebuff/agent-runtime/llm-api/claude'
import type {
  GetRelevantFilesPayload,
  GetRelevantFilesTrace,
  Relabel,
} from '@codebuff/bigquery'
import type { Message } from '@codebuff/common/types/messages/codebuff-message'

const isProd = process.argv.includes('--prod')
const DATASET = isProd ? 'codebuff_data' : 'codebuff_data_dev'
const MAX_PARALLEL = 5 // Maximum number of traces to process in parallel for relabeling
const LIMIT = 4000 // Total limit of traces to process
const START_CURSOR = '2025-05-31T00:00:00.000Z' // User-provided start cursor or default

const GROUND_TRUTH_MODEL = 'claude-opus-4-20250514-with-full-file-context-new'

const MODELS = [
  models.openrouter_gemini2_5_flash,
  finetunedVertexModels.ft_filepicker_005,
  finetunedVertexModels.ft_filepicker_007,
  finetunedVertexModels.ft_filepicker_008,
  finetunedVertexModels.ft_filepicker_010,
  finetunedVertexModels.ft_filepicker_010_epoch_2,
  finetunedVertexModels.ft_filepicker_topk_003,
] as const

const modelDescriptions = {
  [models.openrouter_gemini2_5_flash]:
    'gemini-2.0-flash-001: Base model, used to tune the finetuned models',
  [finetunedVertexModels.ft_filepicker_005]:
    'ft_filepicker_005: 74.6M tokens, 2 epochs, trained on Claude 3.5 Sonnet outputs',
  [finetunedVertexModels.ft_filepicker_007]:
    'ft_filepicker_007: 44.7M tokens, 1 epoch, trained on Claude 4 Opus outputs with full file context',
  [finetunedVertexModels.ft_filepicker_008]:
    'ft_filepicker_008: 108M tokens, 2 epochs, trained on Claude 4 Opus outputs with full file context',
  [finetunedVertexModels.ft_filepicker_010]:
    'ft_filepicker_010: 109M tokens, 3 epochs, same as ft_filepicker_008 but with assistant messages converted to user messages',
  [finetunedVertexModels.ft_filepicker_010_epoch_2]:
    'ft_filepicker_010_epoch_2: 109M tokens, 2 epochs, same as ft_filepicker_008 but with assistant messages converted to user messages',
  [finetunedVertexModels.ft_filepicker_topk_003]:
    'ft_filepicker_topk_003: 109M tokens, 2 epochs, only uses top-2 files with 3 lines of dashes at the end',
}

async function getFilteredValidationBundles(): Promise<
  Array<{
    trace: GetRelevantFilesTrace
    relabels: Relabel[]
  }>
> {
  console.log(`Fetching up to ${LIMIT} traces for dataset ${DATASET}...`)
  const allTraceBundles = await getTracesAndRelabelsForUser(
    undefined, // userId
    LIMIT, // limit
    START_CURSOR,
    DATASET, // dataset
    'INNER', // joinType - user had this in their diff
    // No pageCursor, fetching all at onc
  )

  console.log(`Found ${allTraceBundles.length} total trace bundles.`)

  const validationBundles = allTraceBundles.filter((bundle) => {
    if (!isValidationSample(bundle.trace.id)) return false
    return bundle.relabels.some((r) => r.model === GROUND_TRUTH_MODEL)
  })

  console.log(
    `Found ${validationBundles.length} validation bundles with ground truth relabel.`,
  )
  return validationBundles
}

async function runTraces() {
  const relabelMode = process.argv.includes('--relabel')
  const scoreMode = process.argv.includes('--score')

  await setupBigQuery({ dataset: DATASET, logger: console })

  if (relabelMode) {
    console.log('Running in relabel mode...')
    await runRelabelMode()
  } else if (scoreMode) {
    console.log('Running in score mode...')
    await runScoreMode()
  } else {
    console.log('Please specify --relabel or --score')
    console.log('Usage: bun relabel-for-offline-scoring.ts --relabel --prod')
    process.exit(1)
  }
}

async function runRelabelMode() {
  try {
    const validationTracesToProcess = await getFilteredValidationBundles()

    if (validationTracesToProcess.length === 0) {
      console.log('No validation traces found to relabel.')
      return
    }

    for (let j = 0; j < validationTracesToProcess.length; j += MAX_PARALLEL) {
      const batch = validationTracesToProcess.slice(j, j + MAX_PARALLEL)
      console.log(
        `Processing relabel batch of ${batch.length} validation traces (${j + 1}-${Math.min(j + MAX_PARALLEL, validationTracesToProcess.length)} of total ${validationTracesToProcess.length})`,
      )

      await Promise.all(
        batch.map(async (bundle) => {
          const trace = bundle.trace as GetRelevantFilesTrace
          for (const modelToTest of MODELS) {
            const hasModelRelabel = bundle.relabels.some(
              (r) => r.model === modelToTest,
            )
            if (!hasModelRelabel) {
              console.log(
                `Relabeling trace ${trace.id} for model ${modelToTest}`,
              )
              try {
                await relabelTraceForModel(trace, modelToTest, DATASET)
                console.log(
                  `Successfully stored relabel for trace ${trace.id} with model ${modelToTest}`,
                )
              } catch (error) {
                console.error(
                  `Error relabeling trace ${trace.id} for model ${modelToTest}:`,
                  error,
                )
              }
            }
          }
        }),
      )
      console.log(
        `Completed relabel batch of ${batch.length} validation traces`,
      )
    }
    console.log('Relabel mode completed.')
  } catch (error) {
    console.error('Error in relabel mode:', error)
  }
}

async function relabelTraceForModel(
  trace: GetRelevantFilesTrace,
  modelToTest: (typeof MODELS)[number],
  dataset: string,
) {
  const payload = trace.payload as GetRelevantFilesPayload
  const messages = payload.messages as Message[]
  const system = payload.system as System

  let transformedMessages = messagesWithSystem({ messages, system })
  if (modelToTest === finetunedVertexModels.ft_filepicker_010) {
    transformedMessages = transformedMessages
      .map((msg, i) => {
        if (msg.role === 'assistant' && i !== messages.length - 1) {
          return castAssistantMessage(msg)
        } else {
          return msg
        }
      })
      .filter((msg) => msg !== null)
  }

  const output = await promptAiSdk({
    messages: transformedMessages,
    model:
      modelToTest as (typeof finetunedVertexModels)[keyof typeof finetunedVertexModels],
    clientSessionId: 'relabel-offline-scoring',
    fingerprintId: 'relabel-offline-scoring',
    userInputId: 'relabel-offline-scoring',
    userId: TEST_USER_ID,
    maxOutputTokens: 1000,
    sendAction: () => {},
    logger: console,
  })

  const newRelabel: Relabel = {
    id: generateCompactId(),
    agent_step_id: trace.agent_step_id,
    user_id: trace.user_id,
    created_at: new Date(),
    model: modelToTest,
    payload: {
      user_input_id: payload.user_input_id,
      client_session_id: payload.client_session_id,
      fingerprint_id: payload.fingerprint_id,
      output: output,
    },
  }

  await insertRelabel({ relabel: newRelabel, dataset, logger: console })
}

// --- Scoring Mode Logic ---

interface OutputPair {
  teacherOutput: string
  studentOutput: string
}

function mrr(
  teacherOutput: string,
  studentOutput: string,
  topK: number | undefined = undefined,
): number {
  const teacherFiles = teacherOutput
    .split('\n')
    .map((f) => f.trim())
    .filter((f) => f)
  const studentFiles = studentOutput
    .split('\n')
    .map((f) => f.trim())
    .filter((f) => f)

  let mrr = 0
  teacherFiles.slice(0, topK).forEach((file, i) => {
    if (studentFiles.includes(file)) {
      mrr += 1 / (i + 1)
    }
  })

  return mrr / teacherFiles.slice(0, topK).length
}

function jaccardSimilarity(
  teacherOutput: string,
  studentOutput: string,
  topK: number | undefined = undefined,
): number {
  let teacherFiles = teacherOutput
    .split('\n')
    .map((f) => f.trim())
    .filter((f) => f)
  let studentFiles = studentOutput
    .split('\n')
    .map((f) => f.trim())
    .filter((f) => f)

  if (topK) {
    teacherFiles = teacherFiles.slice(0, topK)
    studentFiles = studentFiles.slice(0, topK)
  }

  if (teacherFiles.length === 0) return 1 // Or 0, depending on desired behavior for empty teacher list

  let intersection = 0

  teacherFiles.forEach((file, i) => {
    if (studentFiles.includes(file)) {
      intersection += 1
    }
  })

  const union = teacherFiles.length + studentFiles.length - intersection

  return intersection / union
}

function calculatePercentiles(
  scores: number[],
  percentilesToCalc: number[],
): number[] {
  if (!scores || scores.length === 0) return percentilesToCalc.map(() => 0)
  const sortedScores = [...scores].sort((a, b) => a - b)
  return percentilesToCalc.map((p) => {
    const index = (p / 100) * (sortedScores.length - 1)
    if (Number.isInteger(index)) return sortedScores[index]
    const lower = Math.floor(index)
    const upper = Math.ceil(index)
    return (
      sortedScores[lower] +
      (sortedScores[upper] - sortedScores[lower]) * (index - lower)
    )
  })
}

async function scoreSingleModelOutputs(
  outputPairs: OutputPair[],
  metricFn: (teacher: string, student: string) => number,
): Promise<number[]> {
  return outputPairs.map((pair) =>
    metricFn(pair.teacherOutput, pair.studentOutput),
  )
}

const scoringFunctions = {
  jaccard: {
    name: 'Jaccard Similarity (↑ is better)',
    description:
      'The size of the intersection, divided by the size of the union',
    fn: (teacher: string, student: string) =>
      jaccardSimilarity(teacher, student),
  },
  jaccardTop2: {
    name: 'Jaccard Similarity (Top 2) (↑ is better)',
    description:
      'Filters both the teacher and student outputs to the top 2 files, then calculates Jaccard Similarity',
    fn: (teacher: string, student: string) =>
      jaccardSimilarity(teacher, student, 2),
  },
  mrr: {
    name: 'MRR (Top 2, average) (↑ is better)',
    description:
      'Rewards students (1/rank) for each file that is in the top 2 of the teacher',
    fn: (teacher: string, student: string) => mrr(teacher, student, 2),
  },
}

async function runScoreMode() {
  const modelScoresData: Record<string, OutputPair[]> = {}
  MODELS.forEach((model) => (modelScoresData[model] = []))

  try {
    const validationBundles = await getFilteredValidationBundles()

    if (validationBundles.length === 0) {
      console.log('No validation bundles found for scoring.')
      return
    }

    console.log(
      `Processing ${validationBundles.length} validation bundles for scoring.`,
    )

    for (const bundle of validationBundles) {
      const teacherRelabel = bundle.relabels.find(
        (r) => r.model === GROUND_TRUTH_MODEL,
      )
      if (!teacherRelabel || !teacherRelabel.payload.output) continue
      const teacherOutput = teacherRelabel.payload.output

      for (const modelName of MODELS) {
        const studentRelabel = bundle.relabels.find(
          (r) => r.model === modelName,
        )
        if (studentRelabel && studentRelabel.payload.output) {
          modelScoresData[modelName].push({
            teacherOutput,
            studentOutput: studentRelabel.payload.output,
          })
        }
      }
    }

    // All bundles processed, now calculate and print scores
    console.log('\n--- Scoring Results ---')

    console.log('Introducing the models...')
    for (const modelName of MODELS) {
      console.log(
        `\n${finetunedVertexModelNames[modelName] ?? modelName}: ${modelDescriptions[modelName]}`,
      )
    }

    for (const metric of Object.values(scoringFunctions)) {
      console.log(`\n--- ${metric.name} ---`)
      console.log(`Explanation: ${metric.description}`)
      for (const modelName of MODELS) {
        const pairsForModel = modelScoresData[modelName]
        if (pairsForModel.length === 0) {
          console.log(
            `\n${finetunedVertexModelNames[modelName] ?? modelName} (0 samples)`,
          )
          console.log('No samples found for scoring for this model.')
          continue
        }

        const individualScores = await scoreSingleModelOutputs(
          pairsForModel,
          metric.fn,
        )

        const averageScore =
          individualScores.reduce((sum, score) => sum + score, 0) /
          individualScores.length
        const percentiles = calculatePercentiles(individualScores, [10, 25, 50])

        console.log(
          `\n${finetunedVertexModelNames[modelName] ?? modelName} (${individualScores.length} samples)`,
        )
        console.log(`Average: ${averageScore.toFixed(4)}`)
        console.log(
          `10/25/50 perc: ${percentiles.map((p) => p.toFixed(4)).join('/')}`,
        )
      }
    }
    console.log('\nScore mode completed.')
  } catch (error) {
    console.error('Error in score mode:', error)
  }
}

// Run the script
runTraces()
