console.log('Strange Loop initialized!')

import fs from 'fs'
import path from 'path'
import { getOpenAI } from 'backend/openai-api'
import { ChatCompletionTool } from 'openai/resources/chat/completions'
import { models, TEST_USER_ID } from 'common/constants'
import { promptGemini } from 'backend/gemini-api'

const openai = getOpenAI('strange-loop')

const tools: ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'updateContext',
      description:
        'Describe how to update your context for the next iteration. It will be rewritten using your instructions.',
      parameters: {
        type: 'object',
        properties: {
          prompt: {
            type: 'string',
            description:
              'Describe in natural language how to update your context for the next iteration. Make sure you are clear on what sections to update to what.',
          },
        },
        required: ['prompt'],
      },
    },
  },
  {
    type: 'function', 
    function: {
      name: 'complete',
      description: 'Complete the current task and end the loop. Do not use this unless you have accomplished your goal. Your goal is only accomplished when your context tells you that you have accomplished it. If you are unsure, do not use this tool.',
      parameters: {
        type: 'object',
        properties: {
          summary: {
            type: 'string',
            description: 'A brief summary of what was accomplished',
          },
        },
        required: ['summary'],
      },
    },
  },
]

async function updateContext(context: string, updateInstructions: string) {
  const prompt = `Here is the initial context:
<initial_context>
${context}
</initial_context>

Here are the update instructions:
<update_instructions>
${updateInstructions}
</update_instructions>

Please rewrite the entire context using the update instructions. Try to perserve the original context as much as possible, subject to the update instructions. Return the new context only — do not include any other text or markdown formatting.`
  const messages = [
    {
      role: 'user' as const,
      content: prompt,
    },
  ]
  const response = await promptGemini(messages, {
    model: models.gemini2flash,
    clientSessionId: 'strange-loop',
    fingerprintId: 'strange-loop',
    userInputId: 'strange-loop',
    userId: TEST_USER_ID,
  })
  return response
}

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

async function appendToLog(
  logEntry: any
) {
  const logPath = path.join(process.cwd(), 'strange-loop.log')
  await fs.promises.appendFile(logPath, JSON.stringify(logEntry) + '\n')
}

async function main() {
  const initialInstruction =
    'Specify a complete node console game in a single file. Your goal is to make a game that is fun and interesting.'
  let context = initialInstruction

  const files = await readFiles(['system-prompt.md'])
  const systemPrompt = files['system-prompt.md']

  if (!systemPrompt) {
    throw new Error('No system-prompt.md found')
  }

  let iteration = 0

  while (true) {
    iteration++
    console.log(`Iteration ${iteration}`)
    const previousContext = context

    const message = await openai.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: systemPrompt,
        },
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
          case 'updateContext':
            console.log(`Updating context: ${params.prompt}`)
            context = await updateContext(context, params.prompt)
            break
          case 'complete':
            console.log(`Task completed: ${params.summary}`)
            await appendToLog({
              msg: `Task completed`,
              level: 'info',
              iteration,
              timestamp: new Date().toISOString(),
              summary: params.summary,
              finalContext: context,
            })
            return // End the loop
        }
      }
    }

    await appendToLog({
      msg: `Iteration ${iteration}`,
      level: 'info',
      iteration,
      timestamp: new Date().toISOString(),
      previousContext,
      context,
      contextLength: context.length,
      toolCalls: message.choices[0].message.tool_calls,
    })
  }
}

// Start the agent
main().catch(console.error)
