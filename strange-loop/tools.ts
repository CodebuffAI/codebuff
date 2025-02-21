import fs from 'fs'
import path from 'path'
import { models, TEST_USER_ID } from 'common/constants'
import { spawn } from 'child_process'
import { promptGeminiWithFallbacks } from 'backend/gemini-with-fallbacks'

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
Description: Mark the task as complete. Use this tool when you believe the task is finished but want to double-check its correctness.
Parameters:
- summary: (required) A brief summary of what was accomplished, to be logged once verification passes.
Usage:
<complete>
<summary>Implemented the main function and tested it successfully.</summary>
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
  {
    name: 'read_files',
    description: `
## read_files
Description: Read the multiple files from disk and return their contents.
Parameters:
- paths: (required) List of file paths to read, separated by newlines
Usage:
<read_files>
<paths>src/main.ts
src/utils.ts</paths>
</read_files>
    `.trim(),
  },
  {
    name: 'list_directory',
    description: `
## list_directory
Description: List files and directories within a given path.
Parameters:
- path: (required) Path to the directory to list, relative to the project root
Usage:
<list_directory>
<path>src</path>
</list_directory>
    `.trim(),
  },
  {
    name: 'review',
    description: `
## review
Description: Review the current state of the task, including running type checks and tests. Based on the results, either mark the task as complete or provide guidance for further changes needed.
Parameters:
- path: (optional) Path to the TypeScript file to check, if reviewing a specific file
- summary: (required) A brief summary of what was accomplished and what was checked
Usage:
<review>
<path>src/main.ts</path>
<summary>Implemented the main function and tested it successfully.</summary>
</review>
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
  const prompt = `
We're working on a project. We have one goal. We can have multiple subgoals. Each subgoal can have a status, relevant info, and multiple logs that describe the progress of the subgoal.

Here's a simple subgoal example schema:
<subgoal>
<description>Fix the tests</description>
<status>COMPLETE</status>
<saved_tool_info>The test is referenced in 3 different files [...]</saved_tool_info>
<log>
Ran the tests and got these errors:
[...INSERT_ERROR_MESSAGES_HERE...]
</log>
<log>
Edited the file \`test.ts\` to add a missing import.
</log>
<log>
Ran the tests again and they passed.
</log>
</subgoal>

Here is the initial context:
<initial_context>
${context}
</initial_context>

Here are the update instructions:
<update_instructions>
${updateInstructions}
</update_instructions>

Please rewrite the entire context using the update instructions. Try to perserve the original context as much as possible, subject to the update instructions. Return the new context only — do not include any other text or wrapper xml/markdown formatting e.g. please omit <initial_context> tags.`
  const messages = [
    {
      role: 'user' as const,
      content: prompt,
    },
  ]
  const response = await promptGeminiWithFallbacks(messages, undefined, {
    model: models.gemini2flash,
    clientSessionId: 'strange-loop',
    fingerprintId: 'strange-loop',
    userInputId: 'strange-loop',
    userId: TEST_USER_ID,
  })
  return response
}

export async function readFiles(
  paths: string[],
  projectPath: string
): Promise<Record<string, string | null>> {
  const results: Record<string, string | null> = {}
  for (const filePath of paths) {
    const fullPath = path.join(projectPath, filePath)
    if (!fullPath.startsWith(projectPath)) {
      throw new Error('Cannot access files outside project directory')
    }
    try {
      results[filePath] = await fs.promises.readFile(fullPath, 'utf-8')
    } catch {
      results[filePath] = null
    }
  }
  return results
}

export async function writeFile(
  filePath: string,
  content: string,
  projectPath: string
) {
  const fullPath = path.join(projectPath, filePath)
  if (!fullPath.startsWith(projectPath)) {
    throw new Error('Cannot write files outside project directory')
  }
  // Create directories if they don't exist
  const dirPath = path.dirname(fullPath)
  await fs.promises.mkdir(dirPath, { recursive: true })
  await fs.promises.writeFile(fullPath, content, 'utf-8')
}

export async function checkTaskFile(
  filePath: string,
  projectPath: string
): Promise<{ success: boolean; msg: string }> {
  try {
    const normalizedPath = path.normalize(filePath)
    await fs.promises.access(normalizedPath)
  } catch (error) {
    return { success: false, msg: `File ${filePath} does not exist` }
  }

  return new Promise((resolve) => {
    const args = ['tsc', '--noEmit', '--isolatedModules', '--skipLibCheck']
    if (filePath) {
      const normalizedPath = path.normalize(filePath)
      const fullPath = path.join(process.cwd(), normalizedPath)
      args.push(fullPath)
    }
    const tsc = spawn('bun', args)
    let stdout = ''
    let stderr = ''
    tsc.stdout.on('data', (data) => {
      stdout += data.toString()
    })
    tsc.stderr.on('data', (data) => {
      stderr += data.toString()
    })
    tsc.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true, msg: stdout || 'Type check passed' })
      } else {
        const msg = [stdout, stderr].join('\n')
        console.error(msg)
        resolve({
          success: false,
          msg: msg || 'Type check failed',
        })
      }
    })
  })
}

export async function executeCommand(
  command: string,
  projectPath: string
): Promise<{
  stdout: string
  stderr: string
  exitCode: number
}> {
  const { spawn } = require('child_process')
  const cmd = spawn(command, { shell: true, cwd: projectPath })

  let stdout = ''
  let stderr = ''

  cmd.stdout.on('data', (data: Buffer) => {
    stdout += data.toString()
    console.log(data.toString())
  })

  cmd.stderr.on('data', (data: Buffer) => {
    stderr += data.toString()
    console.error(data.toString())
  })

  const exitCode = await new Promise<number>((resolve, reject) => {
    cmd.on('close', (code: number) => {
      resolve(code)
    })
  })

  return { stdout, stderr, exitCode }
}

export interface ToolCall {
  name: ToolName
  parameters: Record<string, string>
}

export function parseToolCalls(messageContent: string): ToolCall[] {
  const toolCalls: ToolCall[] = []
  const toolRegex = new RegExp(
    `<(${TOOL_LIST.join('|')})>([\\s\\S]*?)<\/\\1>`,
    'g'
  )

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

export async function appendToLog(logEntry: any) {
  const logPath = path.join(process.cwd(), 'strange-loop.log')
  await fs.promises.appendFile(logPath, JSON.stringify(logEntry) + '\n')
}

export async function listDirectory(dirPath: string, projectPath: string) {
  const fullPath = path.join(projectPath, dirPath)
  if (!fullPath.startsWith(projectPath)) {
    throw new Error('Cannot access directories outside project directory')
  }

  try {
    const entries = await fs.promises.readdir(fullPath, { withFileTypes: true })
    const result = entries.map((entry) => ({
      name: entry.name,
      isDirectory: entry.isDirectory(),
      type: entry.isDirectory() ? 'directory' : 'file',
    }))
    return result
  } catch (error) {
    console.error(`Failed to read directory ${dirPath}:`, error)
    return null
  }
}

async function summarizeOutput(xml: string): Promise<string> {
  const messages = [
    {
      role: 'assistant' as const,
      content: `You are summarizing the following XML tag content in plain English, with a more conversational and human-like tone. Imagine you're talking to a friend or a colleague, using natural language and expressions. Please avoid overly formal or robotic language. Keep it simple and relatable, but concise. Start with a verb and keep it to just 1 sentence.`,
    },
    {
      role: 'user' as const,
      content:
        xml +
        '\n\nRemember to start with a verb and keep it to just 1 sentence.',
    },
  ]

  return promptGeminiWithFallbacks(messages, undefined, {
    model: models.gemini2flash,
    clientSessionId: 'strange-loop',
    fingerprintId: 'strange-loop',
    userInputId: 'strange-loop',
    userId: TEST_USER_ID,
  })
}

export { summarizeOutput }
