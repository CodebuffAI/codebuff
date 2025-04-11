import { writeFileSync } from 'fs'

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

interface SystemMessage {
  text: string
  type: 'text'
}

interface GeminiPart {
  text: string
}

interface GeminiMessage {
  role: 'user' | 'model'
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

function convertRole(role: string): 'user' | 'model' {
  if (role === 'assistant') return 'model'
  return 'user'
}

function convertToGeminiFormat(
  system: SystemMessage[],
  messages: Message[],
  output: string
): GeminiTuningExample {
  // Handle system message
  let allMessages: Message[] = []

  if (Array.isArray(system)) {
    let retypedSystem: Message[] = system.map((s) => ({
      role: 'assistant',
      content: s.text,
    }))
    allMessages = [...retypedSystem, ...messages]
  } else if (typeof system === 'string') {
    allMessages = [{ role: 'user', content: system }, ...messages]
  } else {
    allMessages = messages
  }

  allMessages = [...allMessages, { role: 'assistant', content: output }]

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

  // Split into systemInstruction and contents
  const [systemInstruction, ...contents] = geminiMessages

  return {
    systemInstruction,
    contents,
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

    // Save as JSONL
    const jsonlContent = tuningData
      .map((example) => JSON.stringify(example))
      .join('\n')

    writeFileSync(
      'scripts/ft-file-selection/gemini-tune-data.jsonl',
      jsonlContent
    )

    console.log(
      `Successfully saved ${tuningData.length} examples to gemini-tune-data.jsonl`
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

    // Save as JSONL
    const openaiJsonlContent = openaiTuningData
      .map((example) => JSON.stringify(example))
      .join('\n')

    writeFileSync(
      'scripts/ft-file-selection/openai-tune-data.jsonl',
      openaiJsonlContent
    )

    console.log(
      `Successfully saved ${openaiTuningData.length} examples to openai-tune-data.jsonl`
    )
  } catch (error) {
    console.error('Error:', error)
    process.exit(1)
  }
}

main()
