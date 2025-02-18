console.log('Strange Loop initialized!')

import fs from 'fs'
import path from 'path'
import { getOpenAI, promptOpenAI } from 'backend/openai-api'
import { ChatCompletionTool } from 'openai/resources/chat/completions'
import { models, TEST_USER_ID } from 'common/constants'
import { promptGemini } from 'backend/gemini-api'
import { spawn } from 'child_process'

const openai = getOpenAI('strange-loop')

const tools: ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'updateContext',
      description:
        'Describe how to update your context for the next iteration. It will be rewritten using your instructions. This is not a place to narrate your thoughts -- give explicit instructions for what in your context to update.',
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
      name: 'writeFile',
      description: 'Create or replace a file with the given content.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Path to the file relative to the project root',
          },
          content: {
            type: 'string',
            description: 'Content to write to the file',
          },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'checkFile',
      description:
        'Check if a TypeScript file exists and validate it with the TypeScript compiler.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Path to the TypeScript file to check',
          },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'complete',
      description:
        'Complete the current task and end the loop. Do not use this unless you have accomplished your goal. Your goal is only accomplished when your context tells you that you have accomplished it. If you are unsure, do not use this tool.',
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

async function writeFile(filePath: string, content: string) {
  const fullPath = path.join(process.cwd(), filePath)
  if (!fullPath.startsWith(process.cwd())) {
    throw new Error('Cannot write files outside current directory')
  }
  // Create directories if they don't exist
  const dirPath = path.dirname(fullPath)
  await fs.promises.mkdir(dirPath, { recursive: true })
  await fs.promises.writeFile(fullPath, content, 'utf-8')
}

export async function checkTaskFile(filePath: string): Promise<boolean> {
  const normalizedPath = path.normalize(filePath)
  const fullPath = path.resolve(process.cwd(), normalizedPath)

  if (!fullPath.startsWith(process.cwd())) {
    console.error(
      `❌ Security Error: Cannot access file outside current directory: ${filePath}`
    )
    return false
  }

  try {
    await fs.promises.access(fullPath)
    console.log(`✅ File ${filePath} exists`)

    const tsc = spawn('bun', ['--cwd', '.', 'tsc', '--noEmit', normalizedPath])

    let stderr = ''
    tsc.stderr.on('data', (data) => {
      stderr += data.toString()
    })

    const success = await new Promise<boolean>((resolve) => {
      tsc.on('close', (code) => {
        if (code === 0) {
          console.log(`✅ File ${filePath} is valid TypeScript`)
          resolve(true)
        } else {
          console.error(`❌ File ${filePath} has TypeScript errors:`)
          console.error(stderr)
          resolve(false)
        }
      })
    })

    return success
  } catch (error) {
    console.error(`❌ File ${filePath} does not exist`)
    return false
  }
}

export async function runStrangeLoop(initialInstruction: string) {
  let context = `<goal>${initialInstruction}</goal>`

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
    const messages = [
      {
        role: 'system' as const,
        content: systemPrompt + '\n\n' + context,
      },
      {
        role: 'user' as const,
        content: `
Proceed toward the goal and subgoals.
You must use the updateContext tool call to record your progress.
Use the complete tool only when you are confident the goal has been acheived.
`.trim(),
      },
    ]
    console.log(messages)
    const response = await openai.chat.completions.create({
      messages,
      model: models.o3mini,
      tools,
      tool_choice: 'auto',
    })
    const toolCalls = response.choices[0].message.tool_calls

    if (toolCalls) {
      for (const toolCall of toolCalls) {
        const params = JSON.parse(toolCall.function.arguments)

        switch (toolCall.function.name) {
          case 'updateContext':
            console.log(`Updating context: ${params.prompt}`)
            context = await updateContext(context, params.prompt)
            break
          case 'writeFile':
            console.log(`Writing file: ${params.path}`)
            await writeFile(params.path, params.content)
            break
          case 'checkFile':
            console.log(`Checking file: ${params.path}`)
            const success = await checkTaskFile(params.path)
            if (!success) {
              console.error(`❌ File ${params.path} validation failed`)
            }
            break
          case 'complete':
            console.log(`Task completed: ${params.summary}`)
            await appendToLog({
              msg: `Task completed`,
              level: 'info',
              iteration,
              timestamp: new Date().toISOString(),
              summary: params.summary,
            })
            return
          default:
            console.error(`Unknown tool: ${toolCall.function.name}`)
        }
      }
    }
  }
}
