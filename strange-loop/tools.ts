import fs from 'fs'
import path from 'path'
import { models, TEST_USER_ID } from 'common/constants'
import { promptGemini } from 'backend/gemini-api'
import { spawn } from 'child_process'

const tools = [
  {
    name: 'update_context',
    description: `
## update_context
Description: Update your context for the next iteration. Give explicit instructions for what sections to update with what content.
Parameters:
- prompt: (required) Clear instructions for what sections to update and how to update them
Usage:
<update_context>
<prompt>Remove the "migrate database" subgoal and add a new "deploy api" subgoal with status "in progress"</prompt>
</update_context>
    `.trim(),
  },
  {
    name: 'write_file',
    description: `
## write_file
Description: Create or replace a file with the given content.
Parameters:
- path: (required) Path to the file relative to the project root
- content: (required) Content to write to the file
Usage:
<write_file>
<path>src/main.ts</path>
<content>console.log('Hello, world!');</content>
</write_file>
    `.trim(),
  },
  {
    name: 'check_file',
    description: `
## check_file
Description: Check if a TypeScript file exists and validate it with the TypeScript compiler.
Parameters:
- path: (required) Path to the TypeScript file to check
Usage:
<check_file>
<path>src/main.ts</path>
</check_file>
    `.trim(),
  },
  {
    name: 'complete',
    description: `
## complete
Description: Complete the current task and end the loop. Only use when your context confirms the goal is accomplished.
Parameters:
- summary: (required) A brief summary of what was accomplished
Usage:
<complete>
<summary>Added user authentication system with email verification</summary>
</complete>
    `.trim(),
  },
  {
    name: 'execute_command',
    description: `
## execute_command
Description: Request to execute a CLI command on the system. Use this when you need to perform system operations or run specific commands to accomplish any step in the user's task. You must tailor your command to the user's system and provide a clear explanation of what the command does. For command chaining, use the appropriate chaining syntax for the user's shell. Prefer to execute complex CLI commands over creating executable scripts, as they are more flexible and easier to run. Commands will be executed in the current working directory: ${process.cwd()}
Parameters:
- command: (required) The CLI command to execute. This should be valid for the current operating system. Ensure the command is properly formatted and does not contain any harmful instructions.
Usage:
<execute_command>
<command>Your command here</command>
</execute_command>
    `.trim(),
  },
] as const

export const TOOL_LIST = tools.map((tool) => tool.name)
export type ToolName = (typeof TOOL_LIST)[number]

export const toolsInstructionPrompt = `
# Tool Use Formatting

Tool use is formatted using XML-style tags. The tool name is enclosed in opening and closing tags, and each parameter is similarly enclosed within its own set of tags. Here's the structure:

<tool_name>
<parameter1_name>value1</parameter1_name>
<parameter2_name>value2</parameter2_name>
...
</tool_name>

For example:

<write_file>
<path>src/main.ts</path>
<content>console.log('Hello, world!');</content>
</write_file>

Always adhere to this format for the tool use to ensure proper parsing and execution.

# Tools

${tools.map((tool) => tool.description).join('\n\n')}
`

export async function updateContext(
  context: string,
  updateInstructions: string
) {
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

export async function readFiles(
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

export async function appendToLog(logEntry: any) {
  const logPath = path.join(process.cwd(), 'strange-loop.log')
  await fs.promises.appendFile(logPath, JSON.stringify(logEntry) + '\n')
}

export async function writeFile(filePath: string, content: string) {
  const fullPath = path.join(process.cwd(), filePath)
  if (!fullPath.startsWith(process.cwd())) {
    throw new Error('Cannot write files outside current directory')
  }
  // Create directories if they don't exist
  const dirPath = path.dirname(fullPath)
  await fs.promises.mkdir(dirPath, { recursive: true })
  await fs.promises.writeFile(fullPath, content, 'utf-8')
}

export async function checkTaskFile(filePath: string): Promise<{ success: boolean; error: string }> {
  const normalizedPath = path.normalize(filePath)
  const fullPath = path.resolve(process.cwd(), normalizedPath)

  if (!fullPath.startsWith(process.cwd())) {
    console.error(
      `❌ Security Error: Cannot access file outside current directory: ${filePath}`
    )
    return { success: false, error: 'Cannot access file outside current directory' }
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

    return { success, error: stderr }
  } catch (error) {
    console.error(`❌ File ${filePath} does not exist`)
    return { success: false, error: 'File does not exist' }
  }
}

export interface ToolCall {
  name: ToolName
  parameters: Record<string, string>
}

export function parseToolCalls(messageContent: string): ToolCall[] {
  const toolCalls: ToolCall[] = []
  const toolRegex = new RegExp(`<(${TOOL_LIST.join('|')})>([\\s\\S]*?)<\/\\1>`, 'g')
  
  let match
  while ((match = toolRegex.exec(messageContent)) !== null) {
    const [_, name, paramsContent] = match
    const parameters: Record<string, string> = {}
    
    // Parse parameters
    const paramRegex = /<(\w+)>([\s\S]*?)<\/\1>/g
    let paramMatch
    while ((paramMatch = paramRegex.exec(paramsContent)) !== null) {
      const [__, paramName, paramValue] = paramMatch
      parameters[paramName] = paramValue.trim()
    }
    
    toolCalls.push({ name: name as ToolName, parameters })
  }
  
  return toolCalls
}
