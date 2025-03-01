import fs from 'fs'
import path from 'path'
import { models, TEST_USER_ID } from 'common/constants'
import { spawn } from 'child_process'
import { promptGeminiWithFallbacks } from './llm-apis/gemini-with-fallbacks'
import { z } from 'zod'
import { FileChange } from 'common/actions'

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
Description: Create or edit a file with the given content.

The user does not need to see this code to make the edit, the file change is done automatically and immediately by another assistant as soon as you finish writing the <write_file> block.

Notes for editing a file:
- Do not wrap the updated file content in markdown code blocks. The xml tags are sufficient to indicate the file content.
- You should abridge the content of the file using placeholder comments like: // ... existing code ... or # ... existing code ... (or whichever is appropriate for the language). Placeholder comments signify sections that should not be changed from the existing file. Using placeholder comments for unchanged code is preferred because it is more concise and clearer. Try to minimize the number of lines you write out in edit blocks by relying on placeholder comments.
- If you don't use any placeholder comments, the entire file will be replaced. E.g. don't write out a single function without using placeholder comments unless you want to replace the entire file with that function.
- Similarly, you can create new files by specifying a new file path and including the entire content of the file.
- When editing a file, try not to change any user code that doesn't need to be changed. In particular, you must preserve pre-existing user comments exactly as they are.

After you have written out an write_file block, the changes will be applied immediately. You can assume that the changes went through as intended. However, note that there are sometimes mistakes in the processs of applying the edits you described in the write_file block, e.g. sometimes large portions of the file are deleted. If you notice that the changes did not go through as intended, based on further updates to the file, you can write out a new write_file block to fix the mistake.

If you just want to show the user some code, and don't want to necessarily make a code change, do not use <write_file> blocks -- these blocks will cause the code to be applied to the file immediately -- instead, wrap the code in markdown \`\`\` tags:
\`\`\`typescript
// ... code to show the user ...
\`\`\`

Do not use this tool to delete or rename a file. Instead run a terminal command for that.

Parameters:
- path: (required) Path to the file relative to the project root
- content: (required) Content to write to the file. You should abridge the content of the file using placeholder comments like: // ... existing code ... or # ... existing code ... (or whichever is appropriate for the language).
Usage:
<write_file>
<path>src/main.ts</path>
<content>
Your file content here
</content>
</write_file>

Example:

The following example uses placeholder comments to add one line to the old file, a console.log statement within the foo function:

<write_file>
<path>foo.ts</path>
<content>
// ... existing code ...
function foo() {
  console.log('foo');
  // ... existing code ...
</content>
</write_file>
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

Note that there's no need to call this tool if you're already reading the files you need in context.
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
    name: 'code_search',
    description: `
## code_search
Description: Search for string patterns in the project's files. This tool uses ripgrep (rg), a fast line-oriented search tool.
Parameters:
- pattern: (required) The pattern to search for.
Usage:
<code_search><pattern>foo</pattern></code_search>
<code_search><pattern>import.*foo</pattern></code_search>

Purpose: Search through code files to find files with specific text patterns, function names, variable names, and more.

Note: quotes will be automatically added around your code search pattern. You might need to escape special characters like '-' or '.' or '\\' if you want to search for them.

Use cases:
1. Finding all references to a function, class, or variable name across the codebase
2. Searching for specific code patterns or implementations
3. Looking up where certain strings or text appear
4. Finding files that contain specific imports or dependencies
5. Locating configuration settings or environment variables

The pattern supports regular expressions and will search recursively through all files in the project by default. Some tips:
- Be as constraining in the pattern as possible to limit the number of files returned, e.g. if searching for the definition of a function, use "(function foo|const foo)" or "def foo" instead of merely "foo".
- Use word boundaries (\\b) to match whole words only
- Searches file content and filenames
- Automatically ignores binary files, hidden files, and files in .gitignore
- Case-sensitive by default. Use -i to make it case insensitive.
- Constrain the search to specific file types using -t <file-type>, e.g. -t ts or -t py.

Note that the code search tool will be executed after you end your response. You can stop writing your response at any time to await the tool call results.
    `.trim(),
  },
  {
    name: 'run_terminal_command',
    description: `
## run_terminal_command
Description: Request to execute a CLI command on the system. Use this when you need to perform system operations or run specific commands to accomplish any step in the user's task. You must tailor your command to the user's system and provide a clear explanation of what the command does. For command chaining, use the appropriate chaining syntax for the user's shell. Prefer to execute complex CLI commands over creating executable scripts, as they are more flexible and easier to run. Commands will be executed in the current working directory: ${process.cwd()}
Parameters:
- command: (required) The CLI command to execute. This should be valid for the current operating system. Ensure the command is properly formatted and does not contain any harmful instructions.
Usage:
<run_terminal_command>
<command>Your command here</command>
</run_terminal_command>

Note that the terminal command will be executed after you end your response. You can stop writing your response at any time to await the tool call results.
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
    name: 'await_tool_results',
    description: `
## await_tool_results
Description: Continue to see the results of all the tool calls you've made so far.
Parameters: None
Usage:
<await_tool_results></await_tool_results>
    `.trim(),
  },
  {
    name: 'complete',
    description: `
## complete
Description: Mark the task as complete. Use this tool when you believe the task is completely finished.
Parameters: None
Usage:
<complete></complete>
    `.trim(),
  },
] as const

// Define Zod schemas for parameter validation
const updateContextSchema = z.object({
  prompt: z.string().min(1, 'Prompt cannot be empty'),
})

const writeFileSchema = z.object({
  path: z.string().min(1, 'Path cannot be empty'),
  content: z.string(),
})

const readFilesSchema = z.object({
  paths: z.string().min(1, 'Paths cannot be empty'),
})

const findFilesSchema = z.object({
  description: z.string().min(1, 'Description cannot be empty'),
})

const codeSearchSchema = z.object({
  pattern: z.string().min(1, 'Pattern cannot be empty'),
})

const runTerminalCommandSchema = z.object({
  command: z.string().min(1, 'Command cannot be empty'),
})

const emptySchema = z.object({}).transform(() => ({}))

// Map tool names to their schemas
const toolSchemas = {
  update_context: updateContextSchema,
  write_file: writeFileSchema,
  read_files: readFilesSchema,
  find_files: findFilesSchema,
  code_search: codeSearchSchema,
  run_terminal_command: runTerminalCommandSchema,
  think_deeply: emptySchema,
  await_tool_results: emptySchema,
  complete: emptySchema,
} as const

export const parseRawToolCall = (rawToolCall: {
  name: string
  parameters: Record<string, string>
}): ToolCall => {
  const { name, parameters } = rawToolCall

  // Look up the schema for this tool
  const schema = toolSchemas[name as ToolName]
  if (!schema) {
    throw new Error(`Tool ${name} not found`)
  }

  // Parse and validate the parameters
  const result = schema.safeParse(parameters)
  if (!result.success) {
    throw new Error(`Invalid parameters for ${name}: ${result.error.message}`)
  }

  // Return the validated and transformed parameters
  return {
    name: name as ToolName,
    parameters: result.data,
  }
}

export const TOOL_LIST = tools.map((tool) => tool.name)
export type ToolName = (typeof TOOL_LIST)[number]

export type ToolCall<T extends ToolName = ToolName> = {
  name: T
  parameters: z.infer<(typeof toolSchemas)[T]>
}

export const TOOLS_WHICH_END_THE_RESPONSE = [
  // 'code_search',
  // 'run_terminal_command',
  // 'think_deeply',
  'await_tool_results',
]

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

No need to narrate your thought process for the tool you are going to use. Just write out the tool call and the parameters you need to use.

Note that any tools you call will only be executed at the end of your current response. You can stop writing your response at any time to await the tool call results.

# Tools

${tools.map((tool) => tool.description).join('\n\n')}
`

export async function updateContext(
  context: string,
  updateInstructions: string
) {
  const prompt = `
We're working on a project. We can have multiple subgoals. Each subgoal can have a status, relevant info, and multiple logs that describe the progress of the subgoal.

The following is an example of a schema of a subgoal. It is for illistrative purposes and is not relevant otherwise. Use it as a reference to understand how to update the context.
Example schema:
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

export async function runTerminalCommand(
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

export type ClientToolCall =
  | {
      id: string
      name: Exclude<ToolName, 'write_file'>
      parameters: Record<string, string>
    }
  | {
      id: string
      name: 'write_file'
      parameters: FileChange
    }

export function parseToolCalls(messageContent: string) {
  // TODO: Return a typed tool call. Typescript is hard.
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

    // try {
    //   const parsedToolCall = parseRawToolCall({ name, parameters })
    //   toolCalls.push(parsedToolCall)
    // } catch (error) {
    //   console.error(`Failed to parse tool call ${name}:`, error)
    // }
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
