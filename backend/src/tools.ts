import fs from 'fs'
import path from 'path'
import { models, TEST_USER_ID } from 'common/constants'
import { spawn } from 'child_process'
import { promptGeminiWithFallbacks } from './gemini-with-fallbacks'

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
    name: 'edit_file',
    description: `
## edit_file
Description: Create or edit a file with the given content.

The user does not need to see this code to make the edit, the file change is done automatically and immediately by another assistant as soon as you finish writing the <edit_file> block.

Notes for editing a file:
- Do not wrap the updated file content in markdown code blocks. The xml tags are sufficient to indicate the file content.
- You should abridge the content of the file using placeholder comments like: // ... existing code ... or # ... existing code ... (or whichever is appropriate for the language). Placeholder comments signify sections that should not be changed from the existing file. Using placeholder comments for unchanged code is preferred because it is more concise and clearer. Try to minimize the number of lines you write out in edit blocks by relying on placeholder comments.
- If you don't use any placeholder comments, the entire file will be replaced. E.g. don't write out a single function without using placeholder comments unless you want to replace the entire file with that function.
- Similarly, you can create new files by specifying a new file path and including the entire content of the file.
- When editing a file, try not to change any user code that doesn't need to be changed. In particular, you must preserve pre-existing user comments exactly as they are.

After you have written out an edit_file block, the changes will be applied immediately. You can assume that the changes went through as intended. However, note that there are sometimes mistakes in the processs of applying the edits you described in the edit_file block, e.g. sometimes large portions of the file are deleted. If you notice that the changes did not go through as intended, based on further updates to the file, you can write out a new edit_file block to fix the mistake.

If you just want to show the user some code, and don't want to necessarily make a code change, do not use <edit_file> blocks -- these blocks will cause the code to be applied to the file immediately -- instead, wrap the code in markdown \`\`\` tags:
\`\`\`typescript
// ... code to show the user ...
\`\`\`

Do not use this tool to delete or rename a file. Instead run a terminal command for that.

Parameters:
- path: (required) Path to the file relative to the project root
- content: (required) Content to write to the file. You should abridge the content of the file using placeholder comments like: // ... existing code ... or # ... existing code ... (or whichever is appropriate for the language).
Usage:
<edit_file>
<path>src/main.ts</path>
<content>
Your file content here
</content>
</edit_file>

Example:

The following example uses placeholder comments to add one line to the old file, a console.log statement within the foo function:

<edit_file>
<path>foo.ts</path>
<content>
// ... existing code ...
function foo() {
  console.log('foo');
  // ... existing code ...
</content>
</edit_file>
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

Note that there's no need to call this tool if you're already holding the files in your context.
    `.trim(),
  },
  {
    name: 'find_files',
    description: `
## find_files
Description: Find files given a brief natural language description of the files or the name of a function or class you are looking for.
Parameters:
- description: (required) A brief natural language description of the files or the name of a function or class you are looking for.
Usage:
<find_files>
<description>The implementation of function foo</description>
</find_files>

Purpose: Better fulfill the user request by reading files which could contain information relevant to the user's request.
Use cases:
- If you are calling a function or creating a class and want to know how it works, use this tool to get the implementation.
- If you need to understand a section of the codebase, read more files in that directory or subdirectories.
- Some requests require a broad understanding of multiple parts of the codebase. Consider using find_files to gain more context before making changes.

Note that there's no need to call this tool if you're already reading the files you need in context.
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
    name: 'think_deeply',
    description: `
## think_deeply
Description: Think through a complex change to the codebase, like implementing a new feature or refactoring some code. This tool leverages deep reasoning capabilities to break down difficult problems into clear implementation steps.
Parameters: None
Usage:
<think_deeply></think_deeply>

Use this tool when the user request meets multiple of these criteria:
- Explicitly asks you to plan or think through something
- Requires changes across multiple files or systems
- Involves complex logic or architectural decisions
- Would benefit from breaking down into smaller steps
- Has potential edge cases or risks that need consideration
- Requires careful coordination of changes

Examples of when to use it:
- Adding a new feature that touches multiple parts of the system
- Refactoring core functionality used by many components
- Making architectural changes that affect the system design
- Implementing complex business logic with many edge cases

Do not use it for simple changes like:
- Adding a single function or endpoint
- Updating text or styles
- Answering a question

Important: Use this tool sparingly. Do not use this tool more than once in a conversation, if a plan was already created, or for similar user requests.
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
] as const

export const TOOL_LIST = tools.map((tool) => tool.name)
export type ToolName = (typeof TOOL_LIST)[number]

export const toolsInstructions = `
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

You can and should include as many tool calls in the response as you need to complete the task. You can even use the same tool multiple times if needed.

Note that any tools you call will only be executed at the end of your current response. You can stop writing your response at any time to await the tool call results.

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

export interface RawToolCall {
  name: ToolName
  parameters: Record<string, string>
}

export interface ClientToolCall extends RawToolCall {
  id: string
}

export function parseToolCalls(messageContent: string): RawToolCall[] {
  const toolCalls: RawToolCall[] = []
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

export async function summarizeOutput(xml: string): Promise<string> {
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
