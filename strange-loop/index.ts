console.log('Strange Loop initialized!')

import fs from 'fs'
import path from 'path'
import { getOpenAI } from 'backend/openai-api'
import { ChatCompletionTool } from 'openai/resources/chat/completions'
import { models } from 'common/constants'

const openai = getOpenAI('strange-loop')

const tools: ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'appendContext',
      description:
        'Append text to your context for the next iteration. Be concise. But also be strategic in what you add as it will continue to be part of future iterations unless replaced.',
      parameters: {
        type: 'object',
        properties: {
          content: {
            type: 'string',
            description: 'Content to append to context',
          },
        },
        required: ['content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'searchReplaceContext',
      description:
        'Search and replace text in your context. Use this to change your prompt for the next iteration. Be strategic in what you replace.',
      parameters: {
        type: 'object',
        properties: {
          search: {
            type: 'string',
            description:
              'Text to search for. Must be an exact substring of your context.',
          },
          replace: {
            type: 'string',
            description: 'Text to replace with.',
          },
        },
        required: ['search', 'replace'],
      },
    },
  },
]

// Tool implementations
async function readFiles(
  paths: string[]
): Promise<Record<string, string | null>> {
  const results: Record<string, string | null> = {}
  for (const filePath of paths) {
    const fullPath = path.join(process.cwd(), filePath)
    // Validate path is within current directory
    if (!fullPath.startsWith(process.cwd())) {
      throw new Error('Cannot access files outside current directory')
    }
    try {
      results[filePath] = await fs.promises.readFile(fullPath, 'utf-8')
    } catch {
      results[filePath] = null
    }
  }
  return results
}

async function appendToLog(logEntry: any) {
  const logPath = path.join(process.cwd(), 'strange-loop.log')
  await fs.promises.appendFile(logPath, JSON.stringify(logEntry) + '\n')
}

async function main() {
  const instruction =
    'In this life, you are thinking hard about how to improve the American government. It is 2025.'

  const files = await readFiles(['context.md'])
  let context = files['context.md']

  if (!context) {
    throw new Error('No context.md found')
  }
  context += `\n${instruction}\n\n`

  let iteration = 0

  while (true) {
    iteration++
    console.log(`Iteration ${iteration}`)

    const message = await openai.chat.completions.create({
      messages: [
        {
          role: 'assistant',
          content: context,
        },
      ],
      model: models.o3mini,
      tools,
      tool_choice: 'auto',
    })

    // Execute tool calls
    if (message.choices[0].message.tool_calls) {
      for (const toolCall of message.choices[0].message.tool_calls) {
        const params = JSON.parse(toolCall.function.arguments)

        switch (toolCall.function.name) {
          case 'appendContext':
            console.log(`Appending to context: ${params.content}`)
            context += params.content
            break
          case 'searchReplaceContext':
            console.log(`Replacing ${params.search} with ${params.replace}`)
            context = context.replace(params.search, params.replace)
            break
        }
      }
    }

    await appendToLog({
      msg: `Iteration ${iteration}`,
      level: 'info',
      iteration,
      timestamp: new Date().toISOString(),
      context,
      contextLength: context.length,
      toolCalls: message.choices[0].message.tool_calls,
    })
  }
}

// Start the agent
main().catch(console.error)
