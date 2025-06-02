import { createHash } from 'crypto'
import { existsSync, readdirSync, writeFileSync } from 'fs'

import {
  GetRelevantFilesTrace,
  getTracesWithRelabels,
  Relabel,
  setupBigQuery,
} from '@codebuff/bigquery'
import { Message } from 'common/types/message'

// Get model from command line args
const model = process.argv[2]
const isProd = process.argv.includes('--prod')
const DATASET = isProd ? 'codebuff_data' : 'codebuff_data_dev'
const MAX_LENGTH_CHARS = 500_000

const VALIDATION_SAMPLING_RATE = 0.1
const SAVE_TOP_FEW_DATA = true
const ADD_DASHES_TO_TOP_FEW_DATA = true
const BLOBBIFY_MESSAGE_HISTORY = true

if (!model) {
  console.log('Missing model argument')
  console.log(
    'Usage: bun run scripts/ft-file-selection/collect-tuning-data.ts <model> [--prod]'
  )
  process.exit(1)
}

// Utility function to get next available filename with auto-incrementing number
function getNextAvailableFilename(
  baseFilename: string,
  extension: string
): string {
  const dir = 'ft-file-selection'
  const files = readdirSync(dir)

  // If base file doesn't exist yet, use it
  const basePath = `${dir}/${baseFilename}.${extension}`
  if (!existsSync(basePath)) {
    return basePath
  }

  // Find all numbered versions
  const pattern = new RegExp(`${baseFilename}-(\\d+)\\.${extension}`)
  const numbers = files
    .map((file) => {
      const match = file.match(pattern)
      return match ? parseInt(match[1]) : 0
    })
    .filter((n) => n > 0)

  // Get next number (or start at 001 if no numbered files exist)
  const nextNum = numbers.length > 0 ? Math.max(...numbers) + 1 : 1

  // Format with padded zeros
  const paddedNum = nextNum.toString().padStart(3, '0')
  return `${dir}/${baseFilename}-${paddedNum}.${extension}`
}

function getDeterministicSample(traceId: string): number {
  const hash = createHash('sha256').update(traceId).digest('hex')
  // Convert the first 8 characters of the hash to a number between 0 and 1
  const numericalValue = parseInt(hash.substring(0, 8), 16)
  return numericalValue / 0xffffffff
}

interface SystemMessage {
  text: string
  type: 'text'
}

interface GeminiPart {
  text: string
}

interface GeminiMessage {
  role: 'user' | 'model' | 'system'
  parts: GeminiPart[]
}

interface GeminiTuningExample {
  systemInstruction: GeminiMessage
  contents: GeminiMessage[]
}

interface OpenAIMessage {
  role: string
  content: string
  weight?: number
}

interface OpenAITuningExample {
  messages: OpenAIMessage[]
}

function convertRole(role: string): 'user' | 'model' | 'system' {
  if (role === 'assistant') return 'model'
  return 'user'
}

const TOP_N_FILES = 2
function convertToTopFewTrainingExample(
  example: GeminiTuningExample
): GeminiTuningExample {
  // This function should:
  // a) in the very last message, keep the only the top 2 files, ie: the first 2 "lines" in the output
  // b) in all other messages, find a note of format: Remember to focus on the most important files and limit your selection to {count} files
  // c) replace {count} with 2
  // d) return the new example

  const lastMessage = example.contents[example.contents.length - 1]
  const lastMessageContent = lastMessage.parts[0].text
  const topNFiles = lastMessageContent.split('\n').slice(0, TOP_N_FILES)
  lastMessage.parts[0].text = topNFiles.join('\n')
  if (ADD_DASHES_TO_TOP_FEW_DATA) {
    lastMessage.parts[0].text +=
      '\n--------------------------------\n--------------------------------\n--------------------------------'
  }

  example.contents.forEach((msg) => {
    msg.parts.forEach((part) => {
      if (typeof part.text === 'string') {
        let repString = `Remember to focus on the most important files and limit your selection to ${TOP_N_FILES}`

        if (ADD_DASHES_TO_TOP_FEW_DATA) {
          repString +=
            '. Make sure to end your response with three lines of dashes, ie: "--------------------------------\n--------------------------------\n--------------------------------"'
        }

        const msgContentWithTopN = part.text.replace(
          /Remember to focus on the most important files and limit your selection to (\d+)/,
          repString
        )
        part.text = msgContentWithTopN
      }
    })
  })

  return example
}

function compressMessagesToHistory(messages: GeminiMessage[]): string {
  let out =
    "Message History \n Here is the conversation so far, use it to help you determine which files are most relevant to the user's query. \n <message_history>\n"
  for (const msg of messages) {
    const allParts = msg.parts.map((p) => p.text).join('\n')
    out += `<${msg.role}> ${allParts}\n </${msg.role}>`
  }
  out += '</message_history>'
  return out
}

function convertToGeminiFormat(
  system: SystemMessage[],
  messages: Message[],
  output: string
): GeminiTuningExample {
  // Handle system message
  let allMessages: Message[] = [
    ...messages,
    { role: 'assistant', content: output },
  ]
  let systemMessage: GeminiMessage

  if (Array.isArray(system)) {
    systemMessage = {
      role: 'system',
      parts: system.map((s) => ({ text: s.text })),
    }
  } else if (typeof system === 'string') {
    systemMessage = {
      role: 'system',
      parts: [{ text: system }],
    }
  } else {
    throw new Error(
      `Invalid system message, expected string or array, got ${typeof system}`
    )
  }

  // Convert all messages to Gemini format
  // @ts-ignore
  const geminiMessages: GeminiMessage[] = allMessages
    .map((msg) => {
      if (typeof msg.content === 'string') {
        return {
          role: convertRole(msg.role),
          parts: [{ text: msg.content }],
        }
      } else if (Array.isArray(msg.content)) {
        const textContent = msg.content.find((c) => c.type === 'text')?.text
        if (textContent) {
          return {
            role: convertRole(msg.role),
            parts: [{ text: textContent }],
          }
        }
        return null
      }
      return null
    })
    .filter((msg): msg is GeminiMessage => msg !== null)

  // If there are multiple messages in a row with the same role, we need to combine them into a single message with multiple parts
  const combinedMessages: GeminiMessage[] = []
  for (const msg of geminiMessages) {
    if (
      combinedMessages.length > 0 &&
      combinedMessages[combinedMessages.length - 1].role === msg.role
    ) {
      combinedMessages[combinedMessages.length - 1].parts.push(...msg.parts)
    } else {
      combinedMessages.push(msg)
    }
  }

  if (BLOBBIFY_MESSAGE_HISTORY) {
    // Append all except the last message to the system message
    // Then return only the last message as contents
    systemMessage.parts.push({
      text: compressMessagesToHistory(combinedMessages.slice(0, -1)),
    })

    return {
      systemInstruction: systemMessage,
      contents: [combinedMessages[combinedMessages.length - 1]],
    }
  }

  return {
    systemInstruction: systemMessage,
    contents: combinedMessages,
  }
}

function convertToOpenAIFormat(
  system: SystemMessage[],
  messages: Message[],
  output: string
): OpenAITuningExample {
  // Handle system message
  let systemMessages: OpenAIMessage[] = []

  if (Array.isArray(system)) {
    systemMessages = system.map((s, i) => ({
      role: i === 0 ? 'system' : 'user',
      content: s.text,
    }))
  } else if (typeof system === 'string') {
    systemMessages = [{ role: 'system', content: system }]
  }

  // Convert all messages to OpenAI format
  const openaiMessages: OpenAIMessage[] = messages.map((msg) => {
    if (typeof msg.content === 'string') {
      return {
        role: msg.role,
        content: msg.content,
      }
    } else if (Array.isArray(msg.content)) {
      const textContent = msg.content.find((c) => c.type === 'text')?.text
      if (textContent) {
        return {
          role: msg.role,
          content: textContent,
        }
      }
    }
    throw new Error('Invalid message format')
  })

  return {
    messages: [
      ...systemMessages,
      ...openaiMessages,
      { role: 'assistant', content: output },
    ],
  }
}

function writeTracesAsOpenAIData(
  traces: {
    trace: GetRelevantFilesTrace
    relabel: Relabel
  }[]
) {
  // Convert to OpenAI format
  const openaiTuningData = traces
    .map(({ trace, relabel }) => {
      try {
        return convertToOpenAIFormat(
          trace.payload.system as SystemMessage[],
          trace.payload.messages as Message[],
          relabel.payload.output
        )
      } catch (error) {
        console.error('Error processing trace for OpenAI:', error)
        return null
      }
    })
    .filter(Boolean)

  // OpenAI gets mad if we have <10 examples, lets repeat the last example until we have 10
  // Terrible terrible idea, but good for testing.
  while (openaiTuningData.length < 10 && openaiTuningData.length > 0) {
    openaiTuningData.push(openaiTuningData[openaiTuningData.length - 1])
  }

  // Save as JSONL with auto-incrementing filename
  const openaiJsonlContentFiltered = openaiTuningData
    .map((example) => JSON.stringify(example))
    .filter((example) => example.length < MAX_LENGTH_CHARS)

  const openaiJsonlContent = openaiJsonlContentFiltered.join('\n')

  const openaiPath = getNextAvailableFilename('openai-tune-data', 'jsonl')
  writeFileSync(openaiPath, openaiJsonlContent)

  console.log(
    `Successfully saved ${openaiJsonlContentFiltered.length} examples to ${openaiPath} (filtered ${openaiTuningData.length - openaiJsonlContentFiltered.length} examples due to length)`
  )
}

function writeGeminiTrainingAndValidationData(
  filename: string,
  examples: {
    example: GeminiTuningExample
    deterministicSample: number
  }[]
) {
  const trainingData = examples.filter(
    ({ deterministicSample }) => deterministicSample > VALIDATION_SAMPLING_RATE
  )
  const validationData = examples.filter(
    ({ deterministicSample }) => deterministicSample <= VALIDATION_SAMPLING_RATE
  )

  // Save as JSONL with auto-incrementing filename
  const trainingJsonlContentFiltered = trainingData
    .map((example) => JSON.stringify(example.example))
    // toss messages longer than 500k chars
    .filter((example) => example.length < MAX_LENGTH_CHARS)

  const trainingJsonlContent = trainingJsonlContentFiltered.join('\n')

  const validationJsonlContentFiltered = validationData
    .map((example) => JSON.stringify(example.example))
    .filter((example) => example.length < MAX_LENGTH_CHARS)

  const validationJsonlContent = validationJsonlContentFiltered.join('\n')
  writeFileSync(filename, trainingJsonlContent)
  writeFileSync(
    filename.replace('.jsonl', '-validation.jsonl'),
    validationJsonlContent
  )

  console.log(
    `Successfully saved ${trainingJsonlContentFiltered.length} training examples and ${validationJsonlContentFiltered.length} validation examples to ${filename}`
  )
}

function writeTracesAsGeminiData(
  traces: {
    trace: GetRelevantFilesTrace
    relabel: Relabel
  }[]
) {
  const tuningData = traces
    .map(({ trace, relabel }) => {
      try {
        return {
          example: convertToGeminiFormat(
            trace.payload.system as SystemMessage[],
            trace.payload.messages as Message[],
            relabel.payload.output
          ),
          deterministicSample: getDeterministicSample(trace.id),
        }
      } catch (error) {
        console.error('Error processing trace:', error)
        return null
      }
    })
    .filter(Boolean) as {
    example: GeminiTuningExample
    deterministicSample: number
  }[]

  const geminiPath = getNextAvailableFilename('gemini-tune-data', 'jsonl')
  writeGeminiTrainingAndValidationData(geminiPath, tuningData)

  if (SAVE_TOP_FEW_DATA) {
    // Convert to top few training examples
    const topFewTrainingData = tuningData.map(
      ({ example, deterministicSample }) => {
        const topFewExample = convertToTopFewTrainingExample(example)
        return {
          example: topFewExample,
          deterministicSample,
        }
      }
    )
    const topFewTrainingDataPath = geminiPath.replace('.jsonl', '-top2.jsonl')
    writeGeminiTrainingAndValidationData(
      topFewTrainingDataPath,
      topFewTrainingData
    )
  }
}

async function main() {
  try {
    await setupBigQuery(DATASET)
    console.log(`Using dataset: ${DATASET}`)

    // Get traces for the specified model from BigQuery
    const traces = await getTracesWithRelabels(model, 100, DATASET)
    console.log(`Found ${traces.length} traces for model ${model}`)

    // Process traces and convert to Gemini format
    writeTracesAsGeminiData(traces)

    // write traces as OpenAI data
    // writeTracesAsOpenAIData(traces)
  } catch (error) {
    console.error('Error:', error)
    process.exit(1)
  }
}

main()
