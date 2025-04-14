import { existsSync, readdirSync, writeFileSync } from 'fs'

import db from 'common/db'
import { ft_filepicker_capture, ft_filepicker_traces } from 'common/db/schema'
import { Message } from 'common/types/message'
import { desc, sql } from 'drizzle-orm'

// Get model from command line args
const model = process.argv[2]

if (!model) {
  console.log('Missing model argument')
  console.log(
    'Usage: bun run scripts/ft-file-selection/collect-gemini-tuning-data.ts <model>'
  )
  process.exit(1)
}

// Utility function to get next available filename with auto-incrementing number
function getNextAvailableFilename(
  baseFilename: string,
  extension: string
): string {
  const dir = 'scripts/ft-file-selection'
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

async function main() {
  try {
    // Fetch traces for the specified model
    const traces = await db
      .select()
      .from(ft_filepicker_traces)
      .where(sql`model = ${model}`)
      .orderBy(desc(ft_filepicker_traces.timestamp))
      .limit(1000)

    // Fetch all relevant captures
    const captures = await db
      .select()
      .from(ft_filepicker_capture)
      .orderBy(desc(ft_filepicker_capture.timestamp))
      .limit(1000)

    // Create capture lookup map
    const captureMap = new Map(captures.map((c) => [c.id, c]))

    // Match traces with captures and convert to Gemini format
    const tuningData = traces
      .map((trace) => {
        const capture = captureMap.get(trace.captureId)
        if (!capture) return null

        return convertToGeminiFormat(
          capture.system as SystemMessage[],
          capture.messages,
          trace.output
        )
      })
      .filter(Boolean)

    // Save as JSONL with auto-incrementing filename
    const jsonlContent = tuningData
      .map((example) => JSON.stringify(example))
      .join('\n')

    const geminiPath = getNextAvailableFilename('gemini-tune-data', 'jsonl')
    writeFileSync(geminiPath, jsonlContent)

    console.log(
      `Successfully saved ${tuningData.length} examples to ${geminiPath}`
    )

    // Match traces with captures and convert to OpenAI format
    const openaiTuningData = traces
      .map((trace) => {
        const capture = captureMap.get(trace.captureId)
        if (!capture) return null

        return convertToOpenAIFormat(
          capture.system as SystemMessage[],
          capture.messages,
          trace.output
        )
      })
      .filter(Boolean)

    // OpenAI gets mad if we have <10 examples, lets repeat the last example until we have 10
    // Terrible terrible idea, but good for testing.
    while (openaiTuningData.length < 10) {
      openaiTuningData.push(openaiTuningData[openaiTuningData.length - 1])
    }

    // Save as JSONL with auto-incrementing filename
    const openaiJsonlContent = openaiTuningData
      .map((example) => JSON.stringify(example))
      .join('\n')

    const openaiPath = getNextAvailableFilename('openai-tune-data', 'jsonl')
    writeFileSync(openaiPath, openaiJsonlContent)

    console.log(
      `Successfully saved ${openaiTuningData.length} examples to ${openaiPath}`
    )
  } catch (error) {
    console.error('Error:', error)
    process.exit(1)
  }
}

main()
