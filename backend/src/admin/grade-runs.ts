import { promptAiSdk } from '@/llm-apis/vercel-ai-sdk/ai-sdk'
import { Relabel, GetRelevantFilesTrace } from '@codebuff/internal/bigquery'
import { claudeModels, TEST_USER_ID } from 'common/constants'

const PROMPT = `
You are an evaluator system, measuring how well various models perform at selecting the most relevant files for a given user request.
You will be provided the context given to the other models, in the <request_context></request_context> tags.
You will then be provided with multiple outputs, in the <model_outputs></model_outputs> tags. 
It will be provided in the following format:

<request_context>
  ...
</request_context>

<model_outputs>
  <output>
    <model_id>1</model_id>
    ...
  </output>
  <output>
    <model_id>2</model_id>
    ...
  </output>
</model_outputs>

Your goal is to rank and grade the outputs from best to worst, and provide 1-5 scores based on how well they followed the instructions in the <request_context> tags.
Provide the best output first, and the worst output last. Multiple models may receive the same score, but you should break ties by quality.
Multiple models may receive the same score.

You will provide your response in the following format:

<scores>
  <score>
    <model_id>2</model_id>
    <score>4</score>
  </score>
  <score>
    <model_id>1</model_id>
    <score>4</score>
  </score>
  <score>
    <model_id>3</model_id>
    <score>2</score>
  </score>
  ...
</scores>
`

function modelsToXML(models: { model: string; output: string }[]) {
  // 1-indexed ID, and then the output
  return models
    .map(
      (model, index) =>
        `<output>
<model_id>${index + 1}</model_id>
${model.output}
</output>`
    )
    .join('\n')
}
function extractResponse(response: string): {
  scores: { id: string; score: number }[]
} {
  const scoresMatch = response.match(/<scores>([\s\S]*?)<\/scores>/)
  if (!scoresMatch) {
    throw new Error('No scores found in response')
  }

  const scoresXml = scoresMatch[1]
  const scoreMatches = scoresXml.match(
    /<score>[\s\S]*?<model_id>(\d+)<\/model_id>[\s\S]*?<score>(\d+)<\/score>[\s\S]*?<\/score>/g
  )

  if (!scoreMatches) {
    throw new Error('No valid score entries found')
  }

  return {
    scores: scoreMatches.map((scoreXml) => {
      const modelMatch = scoreXml.match(/<model_id>[\s]*(\d+)[\s]*<\/model_id>/)
      const scoreMatch = scoreXml.match(/<score>[\s]*(\d+)[\s]*<\/score>/)

      if (!modelMatch || !scoreMatch) {
        throw new Error('Invalid score entry format')
      }

      return {
        id: modelMatch[1],
        score: parseInt(scoreMatch[1], 10),
      }
    }),
  }
}

export async function gradeRun(tracesAndRelabels: {
  trace: GetRelevantFilesTrace
  relabels: Relabel[]
}) {
  const { trace, relabels } = tracesAndRelabels
  const messages = trace.payload.messages

  const originalOutput = trace.payload.output
  const originalModel = trace.payload.model

  const modelsWithOutputs: {
    model: string
    output: string
  }[] = [
    {
      model: originalModel ?? 'original',
      output: originalOutput,
    },
  ]

  for (const relabel of relabels) {
    const model = relabel.model
    const output = relabel.payload.output
    modelsWithOutputs.push({ model, output })
  }

  // randomize the order of the models, but remember the original order
  modelsWithOutputs.sort(() => Math.random() - 0.5)

  const modelOutputs = modelsToXML(modelsWithOutputs)

  console.log(relabels)

  const stringified = JSON.stringify(messages)
  const response = await promptAiSdk({
    messages: [
      { role: 'system', content: PROMPT },
      {
        role: 'user',
        content: `<request_context>${stringified}</request_context>`,
      },
      {
        role: 'user',
        content: `<model_outputs>${modelOutputs}</model_outputs>`,
      },
      { role: 'user', content: PROMPT },
    ],
    model: claudeModels.sonnet,
    clientSessionId: 'relabel-trace-api',
    fingerprintId: 'relabel-trace-api',
    userInputId: 'relabel-trace-api',
    userId: TEST_USER_ID,
    //   thinking: {
    //     type: 'enabled',
    //     budget_tokens: 10000,
    //   },
  })

  const { scores } = extractResponse(response)

  // Combine the scores with the model name from modelsWithOutputs
  const scoresWithModelName = scores.map((score, index) => {
    const model = modelsWithOutputs[index]
    return { model: model.model, score: score.score, rank: index + 1 }
  })

  console.log(response)
  console.log(scoresWithModelName)
}
