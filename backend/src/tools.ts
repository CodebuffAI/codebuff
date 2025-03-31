import fs from 'fs'
import path from 'path'
import { models, TEST_USER_ID } from 'common/constants'
import { spawn } from 'child_process'
import { promptGeminiWithFallbacks } from './llm-apis/gemini-with-fallbacks'
import { z } from 'zod'
import { FileChange } from 'common/actions'
import { logger } from './util/logger'
import { buildArray } from 'common/util/array'

const tools = [
  {
    name: 'add_subgoal',
    description: `
### add_subgoal
Description: Add a new subgoal for tracking progress. To be used for complex requests that can't be solved in a single step, as you may forget what happened!
Parameters:
- id: (required) A unique identifier for the subgoal. Try to choose the next sequential integer that is not already in use.
- objective: (required) The objective of the subgoal, concisely and clearly stated.
- status: (required) The status of the subgoal. One of ["NOT_STARTED", "IN_PROGRESS", "COMPLETE", "ABORTED"]
- plan: (optional) A plan for the subgoal.
Usage:
<add_subgoal>
<id>1</id>
<objective>Add a new "deploy api" subgoal</objective>
<status>IN_PROGRESS</status>
</add_subgoal>
    `.trim(),
  },
  {
    name: 'update_subgoal',
    description: `
### update_subgoal
Description: Update a subgoal in the context given the id, and optionally the status or plan, or a new log to append. Feel free to update any combination of the status, plan, or log in one invocation.
Parameters:
- id: (required) The id of the subgoal to update.
- status: (optional) Change the status of the subgoal. One of ["NOT_STARTED", "IN_PROGRESS", "COMPLETE", "FAILED"]
- plan: (optional) Change the plan for the subgoal.
- log: (optional) Add a log message to the subgoal. This will create a new log entry and append it to the existing logs. Use this to record your progress and any new information you learned as you go.
Usage 1 (update status):
<update_subgoal>
<id>1</id>
<status>COMPLETE</status>
</update_subgoal>

Usage 2 (update plan):
<update_subgoal>
<id>3</id>
<plan>Create a file for the endpoint in the api, and register it in the router</plan>
</update_subgoal>

Usage 3 (add log):
<update_subgoal>
<id>1</id>
<log>I found the error in the tests, it's in the foo function.</log>
</update_subgoal>

Usage 4 (update status and add log):
<update_subgoal>
<id>1</id>
<status>COMPLETE</status>
<log>I reran the tests and they passed.</log>
</update_subgoal>
    `.trim(),
  },
  {
    name: 'write_file',
    description: `
### write_file
Description: Create or edit a file with the given content.

When editing a file, please use this tool to output a simplified version of the code block that highlights the changes necessary and adds comments to indicate where unchanged code has been skipped.

--- IMPORTANT OPTIMIZATION DETAIL ---
Use "placeholder comments" i.e. "// ... existing code ..." (or "# ... existing code ..." or "/* ... existing code ... */" or "<!-- ... existing code ... -->"  or however comments are written for other languages) in comments as often as you can, signifying unchanged regions of the file.
The write_file tool is very expensive for each line of code you write, so try to write as little \`content\` as possible to accomplish the task. Often this will mean that the start/end of the file will be skipped, but that's okay! Rewrite the entire file only if specifically requested.
--- IMPORTANT OPTIMIZATION DETAIL ---

These edit codeblocks will be read by a less intelligent "apply" language model to update the file. To help specify the edit to the apply model, be very careful to include a few lines of context when generating the codeblock to not introduce ambiguity. Specify all unchanged regions (code and comments) of the file with "// ... existing code ..." markers (in comments). This will ensure the apply model will not delete existing unchanged code or comments when editing the file. This is just an abstraction for your understanding, you should not mention the apply model to the user.

Do not use this tool to delete or rename a file. Instead run a terminal command for that.

Parameters:
- path: (required) Path to the file relative to the project root
- content: (required) Content to write to the file. You should abridge the content of the file using placeholder comments like: \`// ... existing code ...\` or \`# ... existing code ...\` (or whichever is appropriate for the language).
Usage:
<write_file>
<path>path/to/file</path>
<content>
Your file content here
</content>
</write_file>

Example:

The following example shows how the foo function is being updated, with appropriate "//... existing code ..." in placeholder comments to indicate where the code has not changed:

<write_file>
<path>foo.ts</path>
<content>
// ... existing code ...

function foo() {
  console.log('foo');
  for (let i = 0; i < 10; i++) {
    console.log(i);
  }
  doSomething();
}

// ... existing code ...
</content>
</write_file>


Notes for editing a file:
- If you don't use any placeholder comments, the entire file will be replaced. E.g. don't write out a single function without using placeholder comments unless you want to replace the entire file with that function.
- When editing a file, try not to change any user code that doesn't need to be changed. In particular, you must preserve pre-existing user comments exactly as they are.
- You can also use this tool to create new files.
- After you have written out a write_file block, the changes will be applied immediately. You can assume that the changes went through as intended. However, note that there are sometimes mistakes in the processs of applying the edits you described in the write_file block, e.g. sometimes large portions of the file are deleted. If you notice that the changes did not go through as intended, based on further updates to the file, you can write out a new write_file block to fix the mistake.

If you just want to show the user some code, and don't want to necessarily make a code change, do not use <write_file> blocks -- these blocks will cause the code to be applied to the file immediately -- instead, wrap the code in markdown \`\`\` tags:
\`\`\`typescript
// ... code to show the user ...
\`\`\`
    `.trim(),
  },
  {
    name: 'read_files',
    description: `
### read_files
Description: Read the multiple files from disk and return their contents. Use this tool to read as many files as would be helpful to answer the user's request. Make sure to read any files before you write to them with the write_file tool.
Parameters:
- paths: (required) List of file paths to read, separated by newlines
Usage:
<read_files>
<paths>
path/to/file1.ts
path/to/file2.ts
</paths>
</read_files>

Note that there's no need to call this tool if you're already reading the files you need in context.`.trim(),
  },
  //   {
  //     name: 'find_files',
  //     description: `
  // ### find_files
  // Description: Find files given a brief natural language description of the files or the name of a function or class you are looking for.
  // Parameters:
  // - description: (required) A brief natural language description of the files or the name of a function or class you are looking for. It's also helpful to mention a directory or two to look within.
  // Usage:
  // <find_files>
  // <description>The implementation of function foo</description>
  // </find_files>

  // Purpose: Better fulfill the user request by reading files which could contain information relevant to the user's request.
  // Use cases:
  // - If you are calling a function or creating a class and want to know how it works, use this tool to get the implementation.
  // - If you need to understand a section of the codebase, read more files in that directory or subdirectories.
  // - Some requests require a broad understanding of multiple parts of the codebase. Consider using find_files to gain more context before making changes.

  // Note that there's no need to call this tool if you're already reading the files you need in context.
  //     `.trim(),
  //   },
  {
    name: 'code_search',
    description: `
  ### code_search
  Description: Search for string patterns in the project's files. This tool uses ripgrep (rg), a fast line-oriented search tool. Use this tool only when read_files is not sufficient to find the files you need.
  Parameters:
  - pattern: (required) The pattern to search for.
  Usage:
  <code_search><pattern>foo</pattern></code_search>
  <code_search><pattern>import.*foo</pattern></code_search>

  Purpose: Search through code files to find files with specific text patterns, function names, variable names, and more.

  Note: quotes will be automatically added around your code search pattern. You might need to escape special characters like '-' or '.' or '\\' if you want to search for them.

  Prefer to use read_files instead of code_search unless you need to search for a specific pattern in multiple files.

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
      `.trim(),
  },
  {
    name: 'run_terminal_command',
    description: `
### run_terminal_command
Description: Request to execute a CLI command on the system. Use this when you need to perform system operations or run specific commands to accomplish any step in the user's task. You must tailor your command to the user's system and provide a clear explanation of what the command does. For command chaining, use the appropriate chaining syntax for the user's shell. Prefer to execute complex CLI commands over creating executable scripts, as they are more flexible and easier to run. Commands will be executed in the current working directory: ${process.cwd()}
Parameters:
- command: (required) The CLI command to execute. This should be valid for the current operating system. Ensure the command is properly formatted and does not contain any harmful instructions.
Usage:
<run_terminal_command>
<command>Your command here</command>
</run_terminal_command>

Stick to these use cases:
1. Compiling the project or running build (e.g., "npm run build"). Reading the output can help you edit code to fix build errors. If possible, use an option that performs checks but doesn't emit files, e.g. \`tsc --noEmit\`.
2. Running tests (e.g., "npm test"). Reading the output can help you edit code to fix failing tests. Or, you could write new unit tests and then run them.
3. Moving, renaming, or deleting files and directories. These actions can be vital for refactoring requests. Use commands like \`mv\`/\`move\` or \`rm\`/\`del\`.

Most likely, you should ask for permission for any other type of command you want to run. If asking for permission, show the user the command you want to run using \`\`\` tags.

When using this tool, please adhere to the following rules:

1. Do not run commands that can modify files outside of the project directory, install packages globally, install virtual environments, or have significant side effects outside of the project directory, unless you have explicit permission from the user. Treat anything outside of the project directory as read-only.
2. Do not run \`git push\` because it can break production (!) if the user was not expecting it. Don't run \`git commit\`, \`git rebase\`, or related commands unless you get explicit permission. If a user asks to commit changes, you can do so, but you should not invoke any further git commands beyond the git commit command.
3. Do not run scripts without asking. Especially don't run scripts that could run against the production environment or have permanent effects without explicit permission from the user. Don't run scripts with side effects without permission from the user unless they don't have much effect or are simple.
4. Be careful with any command that has big or irreversible effects. Anything that touches a production environment, servers, the database, or other systems that could be affected by a command should be run with explicit permission from the user.
4. Don't run too many commands in a row without pausing to check in with what the user wants to do next.
5. Don't run long-running commands, e.g. \`npm run dev\` or \`npm start\`, that start a server and do not exit. Only run commands that will complete within 30 seconds, because longer commands will be killed. Instead, ask the user to manually run long-running commands.
6. Do not use the run_terminal_command tool to create or edit files. Do not use \`cat\` or \`echo\` to create or edit files. You should instead write out <write_file> blocks for for editing or creating files as detailed above in the <editing_instructions> block.
7. Do not install packages without asking, unless it is within a small, new-ish project. Users working on a larger project will want to manage packages themselves, so ask first.
8. Do not use the wrong package manager for the project. For example, if the project uses \`pnpm\` or \`bun\` or \`yarn\`, you should not use \`npm\`. Similarly not everyone uses \`pip\` for python, etc.

Notes:
- The current working directory will always reset to project root directory for each command you run. You can only access files within this directory (or sub-directories).
- Commands can succeed without giving any output, e.g. if no type errors were found. So you may not always see output for successful executions.
    `.trim(),
  },
  {
    name: 'think_deeply',
    description: `
### think_deeply
Description: Think through a complex change to the codebase, like implementing a new feature or refactoring some code. Brainstorm. Go deep on alternative approaches and consider the tradeoffs.
Parameters: thought: (required) Your detailed thoughts.
Usage:
<think_deeply>
<thought>
[Insert detailed thoughts here]
</thought>
</think_deeply>

Think step by step. For the first section of your thinking, only keep a minimum draft for each thinking step, with 5 words at most.

Use this tool when the user request meets multiple of these criteria:
- Explicitly asks you to plan or think through something.
- Always use this tool right before using the create_plan tool.
- Requires changes across multiple files or systems
- Involves complex logic or architectural decisions
- Would benefit from breaking down into smaller steps
- Has potential edge cases or risks that need consideration

Examples of when to use it:
- Adding a new feature that touches multiple parts of the system
- Refactoring core functionality used by many components
- Making architectural changes that affect the system design
- Implementing complex business logic with many edge cases

Do not use it for simple changes like:
- Adding a single function or endpoint
- Updating text or styles
    `.trim(),
  },
  {
    name: 'create_plan',
    description: `
### create_plan
Description: Create a plan for a complex change to the codebase, like implementing a new feature or refactoring some code.
Parameters:
- path: (required) The path including the filename of a markdown file that will be overwritten with the plan.
- plan: (required) A detailed plan to solve the user's request.

Usage:
<create_plan>
<path>feature-name-plan.md</path>
<plan>
[Insert long detailed plan here]
</plan>
</create_plan>

Use this tool when the user asks you to plan something, or asks you to help with a new feature or refactoring that requires planning.

Examples of when to use it:
- Adding a new feature that touches multiple parts of the system
- Refactoring core functionality used by many components
- Making architectural changes that affect the system design
- Implementing complex business logic with many edge cases

Do not use it for simple changes like:
- Adding a single function or endpoint
- Updating text or styles

For a technical plan, act as an expert architect engineer and provide direction to your editor engineer.
- Study the change request and the current code.
- Describe how to modify the code to complete the request. The editor engineer will rely solely on your instructions, so make them unambiguous and complete.
- Explain all needed code changes clearly and completely, but concisely.
- Just show the changes needed.

What to include in the plan:
- Include code, but not full files of it. Write out key snippets of code and use lots of psuedo code. For example, interfaces between modules, function signatures, and other code that is not immediately obvious should be written out explicitly. Function and method bodies could be written out in psuedo code.
- Do not waste time on much background information, focus on the exact steps of the implementation.
- Do not wrap the path content in markdown code blocks, e.g. \`\`\`.

Do not include any of the following sections in the plan:
- goals
- a timeline or schedule
- benefits/key improvements
- next steps

After creating than plan, you should end turn to let the user review the plan.

Important: Use this tool sparingly. Do not use this tool more than once in a conversation, if a plan was already created, or for similar user requests.
    `.trim(),
  },
  {
    name: 'end_turn',
    description: `
### end_turn
Description: End your response. Use this tool when you've completed the user's request, or need more information from the user, or feel like you are not making progress and want help from the user.
Parameters: None
Usage:
<end_turn></end_turn>
    `.trim(),
  },
] as const

// Define Zod schemas for parameter validation
const addSubgoalSchema = z.object({
  objective: z.string().min(1, 'Objective cannot be empty'),
  status: z.enum(['NOT_STARTED', 'IN_PROGRESS', 'COMPLETE', 'ABORTED']),
  plan: z.string().optional(),
})

const updateSubgoalSchema = z.object({
  objective: z.string().min(1, 'Objective cannot be empty'),
  status: z.enum(['NOT_STARTED', 'IN_PROGRESS', 'COMPLETE', 'ABORTED']),
  plan: z.string().optional(),
  update: z.string().optional(),
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

const thinkDeeplySchema = z.object({
  thought: z.string().min(1, 'Thought cannot be empty'),
})

const createPlanSchema = z.object({
  path: z.string().min(1, 'Path cannot be empty'),
  plan: z.string().min(1, 'Plan cannot be empty'),
})

const emptySchema = z.object({}).transform(() => ({}))

// Map tool names to their schemas
const toolSchemas = {
  add_subgoal: addSubgoalSchema,
  update_subgoal: updateSubgoalSchema,
  write_file: writeFileSchema,
  read_files: readFilesSchema,
  find_files: findFilesSchema,
  code_search: codeSearchSchema,
  run_terminal_command: runTerminalCommandSchema,
  think_deeply: thinkDeeplySchema,
  create_plan: createPlanSchema,
  end_turn: emptySchema,
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
  'read_files',
  'find_files',
  'code_search',
  'run_terminal_command',
]

export const toolsInstructions = `
# Tools

Tools are available for the assistant (Buffy) to use. Whenever Buffy calls these tools, the user responds with the tool results.

## Formatting

Tool use is formatted using XML-style tags. The tool name is enclosed in opening and closing tags, and each parameter is similarly enclosed within its own set of tags. Structure:

<tool_name>
<parameter1_name>value1</parameter1_name>
<parameter2_name>value2</parameter2_name>
...
</tool_name>

For example:

<write_file>
<path>path/to/example/file.ts</path>
<content>console.log('Hello, world!');</content>
</write_file>

Buffy always adheres to this format for the tool use to ensure proper parsing and execution by the user.

Buffy can and must include as many tool calls in the response as you need to complete the task. They can even use the same tool multiple times if needed.

Buffy doesn't narrate their thought process for the tool you are going to use. They just write out the tool call and the parameters they need to use.

Buffy must output the raw tool call XML directly. Do not wrap it in markdown code blocks (\`\`\`xml ... \`\`\`) or any other markdown formatting.

## List of Tools

These are the tools that the assistant (Buffy) sees. The user cannot see the tool descriptions.

${tools.map((tool) => tool.description).join('\n\n')}
`

export async function updateContext(
  context: string,
  updateInstructions: string
) {
  const prompt = `
We're working on a project. We can have multiple subgoals. Each subgoal can have an objective, status, plan, and multiple updates that describe the progress of the subgoal.

The following is an example of a schema of a subgoal. It is for illistrative purposes and is not relevant otherwise. Use it as a reference to understand how to update the context.
Example schema:
<subgoal>
<id>1</id>
<objective>Fix the tests</objective>
<status>COMPLETE</status>
<plan>Run them, find the error, fix it</plan>
<log>Ran the tests and traced the error to component foo.</log>
<log>Modified the foo component to fix the error</log>
<log>Reran the tests and they passed.</log>
</subgoal>

Here is the initial context:
<initial_context>
${context}
</initial_context>

Here are the update instructions:
<update_instructions>
${updateInstructions}
</update_instructions>

Please rewrite the entire context using the update instructions in a <new_context> tag. Try to perserve the original context as much as possible, subject to the update instructions. Return the new context only — do not include any other text or wrapper xml/markdown formatting e.g. please omit <initial_context> tags.`
  const messages = [
    {
      role: 'user' as const,
      content: prompt,
    },
    {
      role: 'assistant' as const,
      content: '<new_context>',
    },
  ]
  const response = await promptGeminiWithFallbacks(messages, undefined, {
    model: models.gemini2flash,
    clientSessionId: 'strange-loop',
    fingerprintId: 'strange-loop',
    userInputId: 'strange-loop',
    userId: TEST_USER_ID,
  })
  const newContext = response.split('</new_context>')[0]
  return newContext.trim()
}

export async function updateContextFromToolCalls(
  agentContext: string,
  toolCalls: RawToolCall[]
) {
  let prompt = '' // 'Log the following tools used and their parameters, and also act on any other instructions:\n'

  for (const toolCall of toolCalls) {
    const { name, parameters } = toolCall
    if (name === 'add_subgoal') {
      prompt += `\nPlease add the following subgoal:\n${renderSubgoalUpdate(
        parameters as any
      )}`
    } else if (name === 'update_subgoal') {
      prompt += `\nPlease update the subgoal with the matching id. For <status> and <plan>, if there are already tags, update them to the new values, keeping only one. For <log>, please keep all the existing logs and append a new <log> entry at the end of the subgoal. Finally, for any unmentioned parameters, do not change them in the existing subgoal:\n${renderSubgoalUpdate(
        parameters as any
      )}`
    }
  }
  return await updateContext(agentContext, prompt)
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

function renderSubgoalUpdate(subgoal: {
  id: number
  objective?: string
  status?: string
  plan?: string
  log?: string
}) {
  const { id, objective, status, plan, log } = subgoal
  const lines = buildArray(
    `<id>${id}</id>`,
    objective && `<objective>${objective}</objective>`,
    status && `<status>${status}</status>`,
    plan && `<plan>${plan}</plan>`,
    log && `<log>${log}</log>`
  )
  return `
<subgoal>
${lines.join('\n')}
</subgoal>
`.trim()
}
