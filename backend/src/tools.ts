import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'

import { FileChange } from 'common/actions'
import { models, TEST_USER_ID } from 'common/constants'
import { getToolCallString } from 'common/src/constants/tools'
import { z } from 'zod'

import { promptFlashWithFallbacks } from './llm-apis/gemini-with-fallbacks'
import { gitCommitGuidePrompt } from './system-prompt/prompts'

const tools = [
  {
    name: 'add_subgoal',
    description: `
### add_subgoal

Add a new subgoal for tracking progress. To be used for complex requests that can't be solved in a single step, as you may forget what happened!
Params:
- \`id\`: (required) A unique identifier for the subgoal. Try to choose the next sequential integer that is not already in use.
- \`objective\`: (required) The objective of the subgoal, concisely and clearly stated.
- \`status\`: (required) The status of the subgoal. One of ["NOT_STARTED", "IN_PROGRESS", "COMPLETE", "ABORTED"]
- \`plan\`: (optional) A plan for the subgoal.

Example:
${getToolCallString('add_subgoal', {
  id: '1',
  objective: 'Add a new "deploy api" subgoal',
  status: 'IN_PROGRESS',
})}
    `.trim(),
  },
  {
    name: 'update_subgoal',
    description: `
### update_subgoal

Update a subgoal in the context given the id, and optionally the status or plan, or a new log to append. Feel free to update any combination of the status, plan, or log in one invocation.

Params:
- \`id\`: (required) The id of the subgoal to update.
- \`status\`: (optional) Change the status of the subgoal. One of ["NOT_STARTED", "IN_PROGRESS", "COMPLETE", "FAILED"]
- \`plan\`: (optional) Change the plan for the subgoal.
- \`log\`: (optional) Add a log message to the subgoal. This will create a new log entry and append it to the existing logs. Use this to record your progress and any new information you learned as you go.

Examples:

Usage 1 (update status):
${getToolCallString('update_subgoal', {
  id: '1',
  status: 'COMPLETE',
})}

Usage 2 (update plan):
${getToolCallString('update_subgoal', {
  id: '3',
  plan: 'Create file for endpoint in the api. Register it in the router.',
})}

Usage 3 (add log):
${getToolCallString('update_subgoal', {
  id: '1',
  log: 'Found the error in the tests. Culprit: foo function.',
})}

Usage 4 (update status and add log):
${getToolCallString('update_subgoal', {
  id: '1',
  status: 'COMPLETE',
  log: 'Reran the tests (passed)',
})}
    `.trim(),
  },
  {
    name: 'write_file',
    description: `
### write_file

Create or edit a file with the given content.

#### write_file vs str_replace

PREFER TO USE THE str_replace TOOL FOR MOST EDITS. Use this tool if you are deleting a very large portion of the code, in which case, the str_replace tool would have a large input.

#### Edit Snippet

Format the \`content\` parameter as an edit snippet that describes how you would like to modify the provided existing code.

Abbreviate any sections of the code in your response that will remain the same with placeholder comments: "// ... rest of headers/sections/code ...". Be descriptive in the comment.

Make sure that you are abbreviating exactly where you believe the existing code will remain the same.
Indicate the location and nature of the modifications (additions and deletions) with comments and ellipses.

Make sure that you preserve the indentation and code structure of exactly how you believe the final code will look like (do not output lines that will not be in the final code after they are merged).

If you plan on deleting a section, please give the relevant context such that the code is understood to be removed, e.g., if the initial code is \`\`\`// code Block 1, Block 2, Block 3 // code\`\`\`, and you want to remove Block 2, you would output \`\`\`/// rest of code Block 1, Block 2 // rest of code\`\`\`

#### Additional Info

Do not use this tool to delete or rename a file. Instead run a terminal command for that.

Notes for editing a file:
- If you don't use any placeholder comments, the entire file will be replaced. E.g. don't write out a single function without using placeholder comments unless you want to replace the entire file with that function.
- When editing a file, try not to change any user code that doesn't need to be changed. In particular, you must preserve pre-existing user comments exactly as they are.
- You can also use this tool to create new files.
- After you have written out a write_file block, the changes will be applied immediately. You can assume that the changes went through as intended. However, note that there are sometimes mistakes in the processs of applying the edits you described in the write_file block, e.g. sometimes large portions of the file are deleted. If you notice that the changes did not go through as intended, based on further updates to the file, you can write out a new write_file block to fix the mistake.

Parameters:
- \`path\`: (required) Path to the file relative to the **project root**
- \`content\`: (required) Content to write to the file. You should abridge the content of the file using placeholder comments like: \`// ... existing code ...\` or \`# ... existing code ...\` (or whichever is appropriate for the language).

Examples:
${getToolCallString('write_file', {
  path: 'path/to/file',
  content: 'Your file content here',
})}

Example 1 - Simple file creation:
${getToolCallString('write_file', {
  path: 'new-file.ts',
  content: 'console.log("Hello, world!");',
})}

Example 2 - Editing with placeholder comments:
${getToolCallString('write_file', {
  path: 'foo.ts',
  content: `// ... existing code ...

function foo() {
  console.log('foo');
  for (let i = 0; i < 10; i++) {
    console.log(i);
  }
  doSomething();
}

// ... existing code ...`,
})}

    `.trim(),
  },
  {
    name: 'str_replace',
    description: `
### str_replace

Replace a string in a file with a new string. Prefer this tool to write_file unless you are changing most everything in the file.

Params:
- \`path\`: (required) The path to the file to edit.
- \`old_{i}\`: (required) One item of the \`old_vals\` array. The string to replace. This must be an *exact match* of the string you want to replace, including whitespace and punctuation.
- \`new_{i}\`: (required) One item of the \`new_vals\` array. The string to replace the old string with.

Example:
${getToolCallString('str_replace', {
  path: 'path/to/file',
  old_0: 'old',
  new_0: 'new',
  old_1: 'to_delete',
  new_1: '',
})}
    `.trim(),
  },
  {
    name: 'read_files',
    description: `
### read_files
Read the multiple files from disk and return their contents. Use this tool to read as many files as would be helpful to answer the user's request.
Params:
- \`paths\`: (required) List of file paths to read relative to the **project root**, separated by newlines. Absolute file paths will not work.

Example:
${getToolCallString('read_files', {
  paths: 'path/to/file1.ts\npath/to/file2.ts',
})}


Note: DO NOT call this tool for files you've already read! There's no need to read them again — any changes to the files will be surfaced to you as a file update tool result.`.trim(),
  },
  {
    name: 'find_files',
    description: `
### find_files
Find several files related to a brief natural language description of the files or the name of a function or class you are looking for.

Params:
- \`description\`: (required) A brief natural language description of the files or the name of a function or class you are looking for. It's also helpful to mention a directory or two to look within.

Example:
${getToolCallString('find_files', {
  description: 'The implementation of function foo',
})}

Purpose: Better fulfill the user request by reading files which could contain information relevant to the user's request.
Use cases:
- If you are calling a function or creating a class and want to know how it works, use this tool to get the implementation.
- If you need to understand a section of the codebase, read more files in that directory or subdirectories.
- Some requests require a broad understanding of multiple parts of the codebase. Consider using find_files to gain more context before making changes.

Don't use this tool if:
- You already know the exact path of the file(s) you are looking for — in this case, use read_files.
- You already read the files you need in context.

In general, prefer using read_files instead of find_files.
      `.trim(),
  },
  {
    name: 'code_search',
    description: `
### code_search
Search for string patterns in the project's files. This tool uses ripgrep (rg), a fast line-oriented search tool. Use this tool only when read_files is not sufficient to find the files you need.

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

Params:
- pattern: (required) The pattern to search for.

Examples:
${getToolCallString('code_search', { pattern: 'foo' })}
${getToolCallString('code_search', { pattern: 'import.*foo' })}

    `.trim(),
  },
  {
    name: 'run_terminal_command',
    description: `
### run_terminal_command
Execute a CLI command from the **project root** (different from the user's cwd).

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
5. Do not use the run_terminal_command tool to create or edit files. Do not use \`cat\` or \`echo\` to create or edit files. You should instead write out <write_file> blocks for for editing or creating files as detailed above in the <editing_instructions> block.
6. Do not install packages without asking, unless it is within a small, new-ish project. Users working on a larger project will want to manage packages themselves, so ask first.
7. Do not use the wrong package manager for the project. For example, if the project uses \`pnpm\` or \`bun\` or \`yarn\`, you should not use \`npm\`. Similarly not everyone uses \`pip\` for python, etc.
8. Do not use more than one run_terminal_command tool call in a single response. Wait for the tool results of each command before invoking the next one.
9. The user will not be able to interact with these processes, e.g. confirming the command. So if there's an opportunity to use "-y" or "--yes" flags, use them. Any command that prompts for confirmation will hang if you don't use the flags.

Notes:
- If the user references a specific file, it could be either from their cwd or from the project root. You **must** determine which they are referring to (either infer or ask). Then, you must specify the path relative to the project root (or use the cwd parameter)
- Commands can succeed without giving any output, e.g. if no type errors were found. So you may not always see output for successful executions.

${gitCommitGuidePrompt}

Params:  
- \`command\`: (required) CLI command valid for user's OS.
- \`process_type\`: (optional) Either SYNC (waits, returns output) or BACKGROUND (runs in background). Default SYNC
- \`cwd\`: (optional) The working directory to run the command in. Default is the project root.
- \`timeout_seconds\`: (optional) Set to -1 for no timeout. Does not apply for BACKGROUND commands. Default 30

Example:
${getToolCallString('run_terminal_command', {
  command: 'echo "hello world"',
  process_type: 'SYNC',
})}
    `.trim(),
  },
  {
    name: 'think_deeply',
    description: `
### think_deeply

Deeply consider complex tasks by brainstorming approaches and tradeoffs step-by-step.

Use when user request:
- Explicitly asks for deep planning.
- Requires multi-file changes or complex logic.
- Involves significant architecture or potential edge cases.

Avoid for simple changes (e.g., single functions, minor edits).

This tool does not generate a tool result.

Params:
- \`thought\`: (required) Detailed step-by-step analysis. Initially keep each step concise (max ~5-7 words per step).

Example:
${getToolCallString('think_deeply', {
  thought: [
    '1. Check current user authentication',
    '2. Refactor auth logic into module',
    '3. Update imports across project',
    '4. Add tests for new module',
  ].join('\n'),
})}
    `.trim(),
  },
  {
    name: 'create_plan',
    description: `
### create_plan

Generate a detailed markdown plan for complex tasks.

Use when:  
- User explicitly requests a detailed plan.  
- Task involves significant architectural or multi-file changes.
- Only use this tool to create new plans. Do not modify existing plans using this tool—use the \`write_file\` tool instead for modifications.

Don't include:
- Goals, timelines, benefits, next steps.  
- Background context or extensive explanations.

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

Params:
- \`path\`: (required) The path including the filename of a markdown file that will be overwritten with the plan.
- \`plan\`: (required) A detailed plan to solve the user's request.

Examples:
${getToolCallString('create_plan', {
  path: 'feature-x-plan.md',
  plan: [
    '1. Create module `auth.ts` in `/src/auth/`.',
    '```ts',
    'export function authenticate(user: User): boolean { /* pseudo-code logic */ }',
    '```',
    '2. Refactor existing auth logic into this module.',
    '3. Update imports across codebase.',
    '4. Write integration tests covering new module logic.',
  ].join('\n'),
})}
    `.trim(),
  },
  {
    name: 'browser_logs',
    description: `
### browser_logs

In a headless browser, navigate to a web page and get the console logs after page load.

Purpose: Use this tool to check the output of console.log or errors in order to debug issues, test functionality, or verify expected behavior.

IMPORTANT: Assume the user's development server is ALREADY running and active, unless you see logs indicating otherwise. Never start the user's development server for them, unless they ask you to do so.
Never offer to interact with the website aside from reading them (see available actions below). The user will manipulate the website themselves and bring you to the UI they want you to interact with.

### Response Analysis

After each action, you'll receive:
1. Success/failure status
2. New console logs since last action
3. Network requests and responses
4. JavaScript errors with stack traces

Use this data to:
- Verify expected behavior
- Debug issues
- Guide next actions
- Make informed decisions about fixes

### Best Practices

**Workflow**
- Navigate to the user's website, probably on localhost, but you can compare with the production site if you want.
- Scroll to the relevant section
- Take screenshots and analyze confirm changes
- Check network requests for anomalies

**Debugging Flow**
- Start with minimal reproduction steps
- Collect data at each step
- Analyze results before next action
- Take screenshots to track your changes after each UI change you make

There is currently only one type of browser action available:
Navigate:
   - Load a new URL in the current browser window and get the logs after page load.
   Params:
   - \`type\`: Must be equal to 'navigate'
   - \`url\`: (required)
   - \`waitUntil\`: (required) One of 'load', 'domcontentloaded', 'networkidle0'

Example:
${getToolCallString('browser_logs', {
  type: 'navigate',
  url: 'localhost:3000',
  waitUntil: 'domcontentloaded',
})}
    `.trim(),
  },
  {
    name: 'end_turn',
    description: `
### end_turn

End your turn, regardless of any new tool results that might be coming. This will allow the user to type another prompt.

Purpose: Use this tool if you have fully responded to the user and want to get their feedback. This ignores any tool results (from str_replace, run_terminal_command, etc.), so be sure you are done before using it.

Params: None

Make sure to use this tool if you want a response fromt the user and not the system. Otherwise, you may receive tool results from the previous tools. e.g. "Let me know if you need xyz!${getToolCallString('end_turn', {})}"

Example:
${getToolCallString('end_turn', {})}
    `.trim(),
  },
] as const

// Define Zod schemas for parameter validation
const addSubgoalSchema = z.object({
  id: z.string().min(1, 'Id cannot be empty'),
  objective: z.string().min(1, 'Objective cannot be empty'),
  status: z.enum(['NOT_STARTED', 'IN_PROGRESS', 'COMPLETE', 'ABORTED']),
  plan: z.string().optional(),
  log: z.string().optional(),
})

const updateSubgoalSchema = z.object({
  id: z.string().min(1, 'Id cannot be empty'),
  status: z
    .enum(['NOT_STARTED', 'IN_PROGRESS', 'COMPLETE', 'ABORTED'])
    .optional(),
  plan: z.string().optional(),
  log: z.string().optional(),
})

const writeFileSchema = z.object({
  path: z.string().min(1, 'Path cannot be empty'),
  content: z.string(),
})

const strReplaceSchema = z.object({
  path: z.string().min(1, 'Path cannot be empty'),
  old_vals: z.array(z.string().min(1, 'Old cannot be empty')),
  new_vals: z.array(z.string()),
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
  process_type: z.enum(['SYNC', 'BACKGROUND']).default('SYNC'),
  cwd: z.string().optional(),
  timeout_seconds: z.string().default('30'),
})

const thinkDeeplySchema = z.object({
  thought: z.string().min(1, 'Thought cannot be empty'),
})

const createPlanSchema = z.object({
  path: z.string().min(1, 'Path cannot be empty'),
  plan: z.string().min(1, 'Plan cannot be empty'),
})

const browserActionSchema = z.object({
  type: z.string().min(1, 'Type cannot be empty'),
  url: z.string().min(1, 'URL cannot be empty'),
  waitUntil: z.string().optional(),
})

const emptySchema = z.object({}).transform(() => ({}))

// Map tool names to their schemas
const toolSchemas = {
  add_subgoal: addSubgoalSchema,
  update_subgoal: updateSubgoalSchema,
  write_file: writeFileSchema,
  str_replace: strReplaceSchema,
  read_files: readFilesSchema,
  find_files: findFilesSchema,
  code_search: codeSearchSchema,
  run_terminal_command: runTerminalCommandSchema,
  think_deeply: thinkDeeplySchema,
  create_plan: createPlanSchema,
  browser_logs: browserActionSchema,
  end_turn: emptySchema,
} as const

export function parseRawToolCall<T extends ToolName>(rawToolCall: {
  name: T
  parameters: Record<string, string>
}): ToolCall<T & ToolName> | ToolCallError {
  const { name, parameters } = rawToolCall

  // Look up the schema for this tool
  const schema = toolSchemas[name]
  if (!schema) {
    return { name: name as string, parameters, error: `Tool ${name} not found` }
  }

  // Handle array parameters: convert param_name_0, param_name_1, etc. into param_name_vals array
  const processedParameters = { ...parameters }

  // Find array parameter patterns
  const arrayParamPattern = /^(.+)_(\d+)$/
  const arrayParams: Record<string, string[]> = {}

  for (const [key, value] of Object.entries(parameters)) {
    const match = key.match(arrayParamPattern)
    if (match) {
      const [, paramName, indexStr] = match
      const index = parseInt(indexStr, 10)
      const arrayKey = `${paramName}_vals`

      if (!arrayParams[arrayKey]) {
        arrayParams[arrayKey] = []
      }
      arrayParams[arrayKey][index] = value
      delete processedParameters[key]
    }
  }

  // Validate array continuity and add to processed parameters
  for (const [arrayKey, values] of Object.entries(arrayParams)) {
    // Check for gaps in the array indices
    for (let i = 0; i < values.length; i++) {
      if (values[i] === undefined) {
        return {
          name,
          parameters,
          error: `Missing parameter ${arrayKey.replace('_vals', '')}_${i} - array parameters must be continuous starting from 0`,
        }
      }
    }
    processedParameters[arrayKey] = values as any
  }

  // Parse and validate the parameters
  const result = schema.safeParse(processedParameters)
  if (!result.success) {
    return {
      name,
      parameters,
      error: `Invalid parameters for ${name}: ${JSON.stringify(result.error.issues, null, 2)}`,
    }
  }

  // Return the validated and transformed parameters
  return {
    name,
    parameters: result.data,
  }
}

export const TOOL_LIST = tools.map((tool) => tool.name)
export type ToolName = (typeof TOOL_LIST)[number]

export type ToolCall<T extends ToolName = ToolName> = {
  name: T
  parameters: z.infer<(typeof toolSchemas)[T]>
}

export type ToolCallError = {
  name?: string
  parameters: Record<string, string>
  error: string
}

export const TOOLS_WHICH_END_THE_RESPONSE = [
  'read_files',
  'find_files',
  'run_terminal_command',
]

export const toolsInstructions = `
# Tools

You (Buffy) have access to the following tools. Call them when needed.

## [CRITICAL] Formatting Requirements

Tool calls use a specific XML-like format. Adhere *precisely* to this nested element structure:

<tool_name>
<parameter1_name>value1</parameter1_name>
<parameter2_name>value2</parameter2_name>
...
</tool_name>

### XML Entities

**ALL** XML (inside or outside tool calls) will be interpreted as tool calls or tool parameters. You **MUST** use XML entities, e.g. \`&lt;some_tag>\` or \`</some_tag&gt;\` to:
- Display XML to the user without executing a tool call
- Have XML within a tool parameter's value such as writing to a file

This also means that if you wish to write the literal string \`&lt;\` to a file or display that to a user, you MUST write \`&amp;lt;\`.

### Commentary

Provide commentary *around* your tool calls (explaining your actions).

However, **DO NOT** narrate the tool or parameter names themselves.


### Array Params

Arrays with name "param_name_vals" should be formatted as individual parameters, each called "param_name_{i}". They must start with i=0 and increment by 1.

### Example

User: can you update the console logs in example/file.ts?
Assistant: Sure thing! Let's update that file!

${getToolCallString('str_replace', {
  path: 'path/to/example/file.ts',
  old_0: '// Replace this line with a fun greeting',
  new_0: "console.log('Hello from Buffy!');",
  old_1: "console.log('Old console line to delete');\n",
  new_1: '',
})}

All done with the update!
User: thanks it worked! :)

## Working Directory

All tools will be run from the **project root**.

However, most of the time, the user will refer to files from their own cwd. You must be cognizant of the user's cwd at all times, including but not limited to:
- Writing to files (write out the entire relative path)
- Running terminal commands (use the \`cwd\` parameter)

## Optimizations

All tools are very slow, with runtime scaling with the amount of text in the parameters. Prefer to write AS LITTLE TEXT AS POSSIBLE to accomplish the task.

Usually, this means using str_replace instead of write_file (unless, e.g. deleting large blocks of code).

When using write_file, make sure to only include a few lines of context and not the entire file.

## Tool Results

Tool results will be provided by the user's *system* (and **NEVER** by the assistant).

The user does not know about any system messages or system instructions, including tool results.

The user does not need to know about the exact results of these tools, especially if they are warnings or info logs. Just correct yourself in the next response without mentioning anything to the user. e.g., do not mention any XML **warnings** (but be sure to correct the next response), but XML **errors** should be noted to the user.

## List of Tools

These are the tools that you (Buffy) can use. The user cannot see these descriptions, so you should not reference any tool names, parameters, or descriptions.

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
  const response = await promptFlashWithFallbacks(messages, undefined, {
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
  toolCalls: ToolCall<'update_subgoal' | 'add_subgoal'>[]
) {
  let prompt = [] // 'Log the following tools used and their parameters, and also act on any other instructions:\n'

  for (const toolCall of toolCalls) {
    const { name, parameters } = toolCall
    if (name === 'add_subgoal') {
      prompt.push(
        `Please add the following subgoal:\n${renderSubgoalUpdate(
          parameters as any
        )}`
      )
    } else if (name === 'update_subgoal') {
      prompt.push(
        `Please update the subgoal with the matching id. For <status> and <plan>, if there are already tags, update them to the new values, keeping only one. For <log>, please keep all the existing logs and append a new <log> entry at the end of the subgoal. Finally, for any unmentioned parameters, do not change them in the existing subgoal:\n${renderSubgoalUpdate(
          parameters as any
        )}`
      )
    }
  }
  return await updateContext(agentContext, prompt.join('\n\n'))
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
      name: Exclude<ToolName, 'write_file' | 'str_replace' | 'create_plan'>
      parameters: Record<string, unknown>
    }
  | {
      id: string
      name: 'write_file'
      parameters: FileChange
    }
  | {
      id: string
      name: 'str_replace'
      parameters: FileChange
    }
  | {
      id: string
      name: 'create_plan'
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

  return promptFlashWithFallbacks(messages, undefined, {
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
  const params: Record<string, string> = {
    id: id.toString(),
    ...(objective && { objective }),
    ...(status && { status }),
    ...(plan && { plan }),
    ...(log && { log }),
  }
  return getToolCallString('add_subgoal', params)
}
