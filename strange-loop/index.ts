console.log('Strange Loop initialized!')

import fs from 'fs'
import path from 'path'
import { getOpenAI } from 'backend/openai-api'
import { ChatCompletionTool } from 'openai/resources/chat/completions'
import { models } from 'common/constants'

const openai = getOpenAI('strange-loop')
// Tool definitions
const tools: ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'readFile',
      description:
        'Read contents of files given their paths relative to current directory',
      parameters: {
        type: 'object',
        properties: {
          paths: {
            type: 'array',
            items: { type: 'string' },
            description: 'List of file paths relative to current directory',
          },
        },
        required: ['paths'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'writeFile',
      description: 'Write content to a file at the given path',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'File path relative to current directory',
          },
          content: {
            type: 'string',
            description: 'Content to write to file',
          },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'appendFile',
      description: 'Append content to the end of a file',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'File path relative to current directory',
          },
          content: {
            type: 'string',
            description: 'Content to append to file',
          },
        },
        required: ['path', 'content'],
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

async function writeFile(filePath: string, content: string) {
  const fullPath = path.join(process.cwd(), filePath)
  if (!fullPath.startsWith(process.cwd())) {
    throw new Error('Cannot write files outside current directory')
  }
  await fs.promises.writeFile(fullPath, content, 'utf-8')
}

async function appendFile(filePath: string, content: string) {
  const fullPath = path.join(process.cwd(), filePath)
  if (!fullPath.startsWith(process.cwd())) {
    throw new Error('Cannot append to files outside current directory')
  }
  await fs.promises.appendFile(fullPath, content, 'utf-8')
}

// Main loop
async function main() {
  // Initialize by reading context
  const context = await readFiles(['context.txt'])

  if (!context['context.txt']) {
    // Create initial context if it doesn't exist
    await writeFile(
      'context.txt',
      `# Agent Context
Overall Goal: Create a test file and write "Hello World" to it
Progress: Starting task
Next Steps: Create test file`
    )
  }

  while (true) {
    // Read current context
    const currentContext = await readFiles(['context.txt'])

    // Get next action from model
    const message = await openai.chat.completions.create({
      messages: [
        {
          role: 'system',
          content:
            'You are an agent working to accomplish goals. You have access to file operations and can update your own context. Work step by step to achieve the goal in context.txt.',
        },
        {
          role: 'user',
          content: `Current context:\n${currentContext['context.txt']}\n\nWhat action should I take next?`,
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
          case 'readFile':
            await readFiles(params.paths)
            break
          case 'writeFile':
            await writeFile(params.path, params.content)
            break
          case 'appendFile':
            await appendFile(params.path, params.content)
            break
        }
      }
    }

    // Small delay between iterations
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
}

// Start the agent
main().catch(console.error)
