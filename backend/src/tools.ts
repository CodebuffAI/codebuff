// IMPORTANT NOTE @CODEBUFF: MAKE SURE TO USE THE TOOL FORMAT GIVEN TO YOU FROM THE SYSTEM INSTRUCTIONS, NOT THE TOOL FORMAT OF THIS FILE
import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'

import { FileChange } from '@codebuff/common/actions'
import { models, TEST_USER_ID } from '@codebuff/common/constants'
import { getToolCallString } from '@codebuff/common/constants/tools'
import { z } from 'zod/v4'

import { AgentTemplateType } from '@codebuff/common/types/session-state'
import { buildArray } from '@codebuff/common/util/array'
import { generateCompactId } from '@codebuff/common/util/string'
import { ToolCallPart, ToolSet } from 'ai'
import { promptFlashWithFallbacks } from './llm-apis/gemini-with-fallbacks'
import { gitCommitGuidePrompt } from './system-prompt/prompts'
import { agentTemplates } from './templates/agent-list'

// Define Zod schemas for parameter validation
const toolConfigs = {
  add_subgoal: {
    parameters: z
      .object({
        id: z
          .string()
          .min(1, 'Id cannot be empty')
          .describe(
            `A unique identifier for the subgoal. Try to choose the next sequential integer that is not already in use.`
          ),
        objective: z
          .string()
          .min(1, 'Objective cannot be empty')
          .describe(
            `The objective of the subgoal, concisely and clearly stated.`
          ),
        status: z
          .enum(['NOT_STARTED', 'IN_PROGRESS', 'COMPLETE', 'ABORTED'])
          .describe(
            `The status of the subgoal. One of ["NOT_STARTED", "IN_PROGRESS", "COMPLETE", "ABORTED"]`
          ),
        plan: z.string().optional().describe('A plan for the subgoal.'),
        log: z
          .string()
          .optional()
          .describe('A log message for the subgoal progress.'),
      })
      .describe(
        `Add a new subgoal for tracking progress. To be used for complex requests that can't be solved in a single step, as you may forget what happened!`
      ),

    description: `
Example:
${getToolCallString('add_subgoal', {
  id: '1',
  objective: 'Add a new "deploy api" subgoal',
  status: 'IN_PROGRESS',
})}
`.trim(),
  },
  update_subgoal: {
    parameters: z
      .object({
        id: z
          .string()
          .min(1, 'Id cannot be empty')
          .describe(`The id of the subgoal to update.`),
        status: z
          .enum(['NOT_STARTED', 'IN_PROGRESS', 'COMPLETE', 'FAILED'])
          .optional()
          .describe(
            `Change the status of the subgoal. One of ["NOT_STARTED", "IN_PROGRESS", "COMPLETE", "FAILED"]`
          ),
        plan: z
          .string()
          .optional()
          .describe(`Change the plan for the subgoal.`),
        log: z
          .string()
          .optional()
          .describe(
            `Add a log message to the subgoal. This will create a new log entry and append it to the existing logs. Use this to record your progress and any new information you learned as you go.`
          ),
      })
      .describe(
        `Update a subgoal in the context given the id, and optionally the status or plan, or a new log to append. Feel free to update any combination of the status, plan, or log in one invocation.`
      ),
    description: `
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
  write_file: {
    parameters: z
      .object({
        path: z
          .string()
          .min(1, 'Path cannot be empty')
          .describe(`Path to the file relative to the **project root**`),
        instructions: z
          .string()
          .describe('What the change is intended to do in only one sentence.'),
        content: z.string().describe(`Edit snippet to apply to the file.`),
      })
      .describe(`Create or edit a file with the given content.`),
    description: `
#### **IMPORTANT** Edit Snippet

Format the \`content\` parameter as an edit snippet that describes how you would like to modify the provided existing code.

Edit snippets will be parsed by a less intelligent "fast-apply" model, so you MUST follow this format, otherwise the finetuned smaller model will not understand what to change. For example, do not include detailed instructions on how to apply code changes for the fast-apply model.

Abbreviate any sections of the code in your response that will remain the same with placeholder comments: "// ... existing code ...". Be descriptive in the comment. You MUST to use these in order to **MINIMIZE** the number of characters in the \`content\` parameter.

Make sure that you are abbreviating exactly where you believe the existing code will remain the same.
Indicate the location and nature of the modifications (additions and deletions) with comments and ellipses.

Make sure that you preserve the indentation and code structure of exactly how you believe the final code will look like (do not output lines that will not be in the final code after they are merged).

##### **IMPORTANT** Deletion Comments

**CRITICAL FOR DELETIONS** If you plan on deleting a section, you MUST provide a comment giving the relevant context such that the code is understood to be removed. This is REQUIRED for the fast-apply model to understand what to delete.

Examples:

If the initial code is:
\`\`\`Some code
Block 1
Block 2
Block 3
More code
\`\`\`
And if you want to delete code block 2, you MUST include a comment like:
\`\`\`// existing code
Block 1
// Delete Block 2
Block 3
// rest of code
\`\`\`

**YOU MUST ALWAYS INCLUDE DELETION COMMENTS** when removing **anything**: single lines, code blocks, functions, variables, or any other code elements. The fast-apply model cannot understand deletions without these explicit comments.

Merely omitting the code block may or may not work. In order to guarantee the deletion of the code, you must include a deletion comment.

#### Additional Info

Prefer str_replace to write_file for small-to-medium edits to a file, for deletions, or for editing large files (>1000 lines). Otherwise, prefer write_file for major edits to a file, or for creating new files.

Do not use this tool to delete or rename a file. Instead run a terminal command for that.

Notes for editing a file:
- If you don't use any placeholder comments, the entire file will be replaced. E.g. don't write out a single function without using placeholder comments unless you want to replace the entire file with that function.
- When editing a file, try not to change any user code that doesn't need to be changed. In particular, you must preserve pre-existing user comments exactly as they are.
- You can also use this tool to create new files.
- After you have written out a write_file block, the changes will be applied immediately. You can assume that the changes went through as intended. However, note that there are sometimes mistakes in the processs of applying the edits you described in the write_file block, e.g. sometimes large portions of the file are deleted. If you notice that the changes did not go through as intended, based on further updates to the file, you can write out a new write_file block to fix the mistake.

Examples:
${getToolCallString('write_file', {
  path: 'path/to/file',
  instructions: 'How the file is being updated',
  content: 'Your file content here',
})}

Example 1 - Simple file creation:
${getToolCallString('write_file', {
  path: 'new-file.ts',
  instructions: 'Prints Hello, world',
  content: 'console.log("Hello, world!");',
})}

Example 2 - Editing with placeholder comments:
${getToolCallString('write_file', {
  path: 'foo.ts',
  instructions: 'Update foo and remove console.log',
  content: `// ... existing code ...

function foo() {
  console.log('foo');
  for (let i = 0; i < 10; i++) {
    console.log(i);
  }
  doSomething();

  // Delete the console.log line from here
}

// ... existing code ...`,
})}

    `.trim(),
  },
  str_replace: {
    parameters: z
      .object({
        path: z
          .string()
          .min(1, 'Path cannot be empty')
          .describe(`The path to the file to edit.`),
        replacements: z
          .array(
            z
              .object({
                old: z
                  .string()
                  .min(1, 'Old cannot be empty')
                  .describe(
                    `The string to replace. This must be an *exact match* of the string you want to replace, including whitespace and punctuation.`
                  ),
                new: z
                  .string()
                  .describe(
                    `The string to replace the corresponding old string with. Can be empty to delete.`
                  ),
              })
              .describe('Pair of old and new strings.')
          )
          .min(1, 'Replacements cannot be empty')
          .describe('Array of replacements to make.'),
      })
      .describe(`Replace strings in a file with new strings.`),
    description: `
Use this tool to make edits within existing files. Prefer this tool over the write_file tool for existing files, unless you need to make major changes throughout the file, in which case use write_file.

Important:
If you are making multiple edits in a row to a file, use only one <str_replace> call with multiple replacements instead of multiple str_replace tool calls.

Don't forget to close the <str_replace> tag with </str_replace> after you have finished making all the replacements.

Example:
${getToolCallString('str_replace', {
  path: 'path/to/file',
  replacements: [
    { old: 'This is the old string', new: 'This is the new string' },
    { old: 'line to delete\n', new: '' },
  ],
})}
    `.trim(),
  },
  read_files: {
    parameters: z
      .object({
        paths: z
          .array(
            z
              .string()
              .min(1, 'Paths cannot be empty')
              .describe(
                `File path to read relative to the **project root**. Absolute file paths will not work.`
              )
          )
          .describe('List of file paths to read.'),
      })
      .describe(
        `Read the multiple files from disk and return their contents. Use this tool to read as many files as would be helpful to answer the user's request.`
      ),
    description: `
Note: DO NOT call this tool for files you've already read! There's no need to read them again — any changes to the files will be surfaced to you as a file update tool result.

Example:
${getToolCallString('read_files', {
  paths: ['path/to/file1.ts', 'path/to/file2.ts'],
})}
    `.trim(),
  },
  find_files: {
    parameters: z
      .object({
        description: z
          .string()
          .min(1, 'Description cannot be empty')
          .describe(
            `A brief natural language description of the files or the name of a function or class you are looking for. It's also helpful to mention a directory or two to look within.`
          ),
      })
      .describe(
        `Find several files related to a brief natural language description of the files or the name of a function or class you are looking for.`
      ),
    description: `
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
- You know the name of the file you need. Instead use run_terminal_command with \`find -name\` (or \`dir /s /b\` or \`Get-ChildItem -Recurse -Filter\`)

This tool is not guaranteed to find the correct file. In general, prefer using read_files instead of find_files.
      `.trim(),
  },
  code_search: {
    parameters: z
      .object({
        pattern: z
          .string()
          .min(1, 'Pattern cannot be empty')
          .describe(`The pattern to search for.`),
        flags: z
          .string()
          .optional()
          .describe(
            `Optional ripgrep flags to customize the search (e.g., "-i" for case-insensitive, "-t ts" for TypeScript files only, "-A 3" for 3 lines after match, "-B 2" for 2 lines before match, "--type-not test" to exclude test files).`
          ),
        cwd: z
          .string()
          .optional()
          .describe(
            `Optional working directory to search within, relative to the project root. Defaults to searching the entire project.`
          ),
      })
      .describe(
        `Search for string patterns in the project's files. This tool uses ripgrep (rg), a fast line-oriented search tool. Use this tool only when read_files is not sufficient to find the files you need.`
      ),

    description: `
Purpose: Search through code files to find files with specific text patterns, function names, variable names, and more.

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

Advanced ripgrep flags (use the flags parameter):
- Case sensitivity: "-i" for case-insensitive search
- File type filtering: "-t ts" (TypeScript), "-t js" (JavaScript), "-t py" (Python), etc.
- Exclude file types: "--type-not test" to exclude test files
- Context lines: "-A 3" (3 lines after), "-B 2" (2 lines before), "-C 2" (2 lines before and after)
- Line numbers: "-n" to show line numbers
- Count matches: "-c" to count matches per file
- Only filenames: "-l" to show only filenames with matches
- Invert match: "-v" to show lines that don't match
- Word boundaries: "-w" to match whole words only
- Fixed strings: "-F" to treat pattern as literal string (not regex)

Note: Do not use the end_turn tool after this tool! You will want to see the output of this tool before ending your turn.

Examples:
${getToolCallString('code_search', { pattern: 'foo' })}
${getToolCallString('code_search', { pattern: 'import.*foo', cwd: 'src' })}
${getToolCallString('code_search', { pattern: 'function.*authenticate', flags: '-i -t ts' })}
${getToolCallString('code_search', { pattern: 'TODO', flags: '-n --type-not test' })}
    `.trim(),
  },
  run_terminal_command: {
    parameters: z
      .object({
        // Can be empty to use it for a timeout.
        command: z
          .string()
          .min(1, 'Command cannot be empty')
          .describe(`CLI command valid for user's OS.`),
        process_type: z
          .enum(['SYNC', 'BACKGROUND'])
          .default('SYNC')
          .describe(
            `Either SYNC (waits, returns output) or BACKGROUND (runs in background). Default SYNC`
          ),
        cwd: z
          .string()
          .optional()
          .describe(
            `The working directory to run the command in. Default is the project root.`
          ),
        timeout_seconds: z
          .number()
          .default(30)
          .describe(
            `Set to -1 for no timeout. Does not apply for BACKGROUND commands. Default 30`
          ),
      })
      .describe(
        `Execute a CLI command from the **project root** (different from the user's cwd).`
      ),
    description: `
Stick to these use cases:
1. Compiling the project or running build (e.g., "npm run build"). Reading the output can help you edit code to fix build errors. If possible, use an option that performs checks but doesn't emit files, e.g. \`tsc --noEmit\`.
2. Running tests (e.g., "npm test"). Reading the output can help you edit code to fix failing tests. Or, you could write new unit tests and then run them.
3. Moving, renaming, or deleting files and directories. These actions can be vital for refactoring requests. Use commands like \`mv\`/\`move\` or \`rm\`/\`del\`.

Most likely, you should ask for permission for any other type of command you want to run. If asking for permission, show the user the command you want to run using \`\`\` tags and *do not* use the tool call format, e.g.:
\`\`\`bash
git branch -D foo
\`\`\`

When using this tool, please adhere to the following rules:

1. Do not run commands that can modify files outside of the project directory, install packages globally, install virtual environments, or have significant side effects outside of the project directory, unless you have explicit permission from the user. Treat anything outside of the project directory as read-only.
2. Do not run \`git push\` because it can break production (!) if the user was not expecting it. Don't run \`git commit\`, \`git rebase\`, or related commands unless you get explicit permission. If a user asks to commit changes, you can do so, but you should not invoke any further git commands beyond the git commit command.
3. Do not run scripts without asking. Especially don't run scripts that could run against the production environment or have permanent effects without explicit permission from the user. Don't run scripts with side effects without permission from the user unless they don't have much effect or are simple.
4. Be careful with any command that has big or irreversible effects. Anything that touches a production environment, servers, the database, or other systems that could be affected by a command should be run with explicit permission from the user.
5. Do not run too many commands in a row without pausing to check in with what the user wants to do next.
6. Do not use the run_terminal_command tool to create or edit files. Do not use \`cat\` or \`echo\` to create or edit files. You should instead write out <write_file> blocks for for editing or creating files as detailed above in the <editing_instructions> block.
7. Do not install packages without asking, unless it is within a small, new-ish project. Users working on a larger project will want to manage packages themselves, so ask first.
8. Do not use the wrong package manager for the project. For example, if the project uses \`pnpm\` or \`bun\` or \`yarn\`, you should not use \`npm\`. Similarly not everyone uses \`pip\` for python, etc.
9. Do not use more than one run_terminal_command tool call in a single response. Wait for the tool results of each command before invoking the next one.
10. The user will not be able to interact with these processes, e.g. confirming the command. So if there's an opportunity to use "-y" or "--yes" flags, use them. Any command that prompts for confirmation will hang if you don't use the flags.

Notes:
- If the user references a specific file, it could be either from their cwd or from the project root. You **must** determine which they are referring to (either infer or ask). Then, you must specify the path relative to the project root (or use the cwd parameter)
- Commands can succeed without giving any output, e.g. if no type errors were found. So you may not always see output for successful executions.

${gitCommitGuidePrompt}

Example:
${getToolCallString('run_terminal_command', {
  command: 'echo "hello world"',
  process_type: 'SYNC',
})}
    `.trim(),
  },
  think_deeply: {
    parameters: z
      .object({
        thought: z
          .string()
          .min(1, 'Thought cannot be empty')
          .describe(
            `Detailed step-by-step analysis. Initially keep each step concise (max ~5-7 words per step).`
          ),
      })
      .describe(
        `Deeply consider complex tasks by brainstorming approaches and tradeoffs step-by-step.`
      ),
    description: `
Use when user request:
- Explicitly asks for deep planning.
- Requires multi-file changes or complex logic.
- Involves significant architecture or potential edge cases.

Avoid for simple changes (e.g., single functions, minor edits).

This tool does not generate a tool result.

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
  create_plan: {
    parameters: z
      .object({
        path: z
          .string()
          .min(1, 'Path cannot be empty')
          .describe(
            `The path including the filename of a markdown file that will be overwritten with the plan.`
          ),
        plan: z
          .string()
          .min(1, 'Plan cannot be empty')
          .describe(`A detailed plan to solve the user's request.`),
      })
      .describe(`Generate a detailed markdown plan for complex tasks.`),
    description: `
Use when:
- User explicitly requests a detailed plan.
- Use this tool to overwrite a previous plan by using the exact same file name.

Don't include:
- Goals, timelines, benefits, next steps.
- Background context or extensive explanations.

For a technical plan, act as an expert architect engineer and provide direction to your editor engineer.
- Study the change request and the current code.
- Describe how to modify the code to complete the request. The editor engineer will rely solely on your instructions, so make them unambiguous and complete.
- Explain all needed code changes clearly and completely, but concisely.
- Just show the changes needed.

What to include in the plan:
- Include key snippets of code -- not full files of it. Use psuedo code. For example, include interfaces between modules, function signatures, and other code that is not immediately obvious should be written out explicitly. Function and method bodies could be written out in psuedo code.
- Do not waste time on much background information, focus on the exact steps of the implementation.
- Do not wrap the path content in markdown code blocks, e.g. \`\`\`.

Do not include any of the following sections in the plan:
- goals
- a timeline or schedule
- benefits/key improvements
- next steps

After creating the plan, you should end turn to let the user review the plan.

Important: Use this tool sparingly. Do not use this tool more than once in a conversation, unless in ask mode.

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
  browser_logs: {
    parameters: z
      .object({
        type: z
          .string()
          .min(1, 'Type cannot be empty')
          .describe(
            'The type of browser action to perform (e.g., "navigate").'
          ),
        url: z
          .string()
          .min(1, 'URL cannot be empty')
          .describe('The URL to navigate to.'),
        waitUntil: z
          .enum(['load', 'domcontentloaded', 'networkidle0'])
          .optional()
          .describe(
            "When to consider navigation successful. Defaults to 'load'."
          ),
      })
      .describe(
        `In a headless browser, navigate to a web page and get the console logs after page load.`
      ),
    description: `
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
   - \`type\`: (required) Must be equal to 'navigate'
   - \`url\`: (required) The URL to navigate to.
   - \`waitUntil\`: (required) One of 'load', 'domcontentloaded', 'networkidle0'

Example:
${getToolCallString('browser_logs', {
  type: 'navigate',
  url: 'localhost:3000',
  waitUntil: 'domcontentloaded',
})}
    `.trim(),
  },
  spawn_agents: {
    parameters: z
      .object({
        agents: z
          .object({
            agent_type: z.string().describe('Agent to spawn'),
            prompt: z
              .string()
              .optional()
              .describe('Prompt to send to the agent'),
            params: z
              .record(z.string(), z.any())
              .optional()
              .describe('Parameters object for the agent (if any)'),
          })
          .array(),
      })
      .describe(`Spawn multiple agents and send a prompt to each of them.`),
    description: `
Use this tool to spawn subagents to help you complete the user request. Each agent has specific requirements for prompt and params based on their promptSchema.

The prompt field is a simple string, while params is a JSON object that gets validated against the agent's schema.

Example:
${getToolCallString('spawn_agents', {
  agents: JSON.stringify([
    {
      agent_type: 'gemini25pro_planner',
      prompt: 'Create a plan for implementing user authentication',
      params: { filePaths: ['src/auth.ts', 'src/user.ts'] },
    },
  ]),
})}
    `.trim(),
  },
  update_report: {
    parameters: z
      .object({
        json_update: z
          .record(z.string(), z.any())
          .describe(
            'JSON object with keys and values to overwrite the existing report. This can be any JSON object with keys and values. Note the values are JSON values, so they can be a nested object or array.'
          ),
      })
      .describe(
        `Update the report of the current agent, which is a JSON object that is initially empty.`
      ),
    description: `
You must use this tool as it is the only way to report any findings to the user. Nothing else you write will be shown to the user.

Please update the report with all the information and analysis you want to pass on to the user. If you just want to send a simple message, use an object with the key "message" and value of the message you want to send.
Example:
${getToolCallString('update_report', {
  jsonUpdate: {
    message: 'I found a bug in the code!',
  },
})}
    `.trim(),
  },
  end_turn: {
    parameters: z
      .object({})
      .describe(
        `End your turn, regardless of any new tool results that might be coming. This will allow the user to type another prompt.`
      ),
    description: `
Purpose: Use this tool if you have fully responded to the user and want to get their feedback. This ignores any tool results (from write_file, run_terminal_command, etc.), so be sure you are done before using it.

Make sure to use this tool if you want a response from the user and not the system. Otherwise, you may receive tool results from the previous tools. e.g. "Let me know if you need xyz!${getToolCallString('end_turn', {})}"

Example:
${getToolCallString('end_turn', {})}
    `.trim(),
  },
  web_search: {
    parameters: z
      .object({
        query: z
          .string()
          .min(1, 'Query cannot be empty')
          .describe(`The search query to find relevant web content`),
        depth: z
          .enum(['standard', 'deep'])
          .optional()
          .default('standard')
          .describe(
            `Search depth - 'standard' for quick results, 'deep' for more comprehensive search. Default is 'standard'.`
          ),
      })
      .describe(`Search the web for current information using Linkup API.`),
    description: `
Purpose: Search the web for current, up-to-date information on any topic. This tool uses Linkup's web search API to find relevant content from across the internet.

Use cases:
- Finding current information about technologies, libraries, or frameworks
- Researching best practices and solutions
- Getting up-to-date news or documentation
- Finding examples and tutorials
- Checking current status of services or APIs

The tool will return search results with titles, URLs, and content snippets.

Example:
${getToolCallString('web_search', {
  query: 'Next.js 15 new features',
  depth: 'standard',
})}

${getToolCallString('web_search', {
  query: 'React Server Components tutorial',
  depth: 'deep',
})}
    `.trim(),
  },
  read_docs: {
    parameters: z
      .object({
        libraryTitle: z
          .string()
          .min(1, 'Library title cannot be empty')
          .describe(
            `The exact library or framework name (e.g., "Next.js", "MongoDB", "React"). Use the official name as it appears in documentation, not a search query.`
          ),
        topic: z
          .string()
          .optional()
          .describe(
            `Optional specific topic to focus on (e.g., "routing", "hooks", "authentication")`
          ),
        max_tokens: z
          .number()
          .optional()
          .describe(
            `Optional maximum number of tokens to return. Defaults to 10000. Values less than 10000 are automatically increased to 10000.`
          ),
      })
      .describe(
        `Fetch up-to-date documentation for libraries and frameworks using Context7 API.`
      ),
    description: `
Purpose: Get current, accurate documentation for popular libraries, frameworks, and technologies. This tool searches Context7's database of up-to-date documentation and returns relevant content.

**IMPORTANT**: The \`libraryTitle\` parameter should be the exact, official name of the library or framework, not a search query. Think of it as looking up a specific book title in a library catalog.

Correct examples:
- "Next.js" (not "nextjs tutorial" or "how to use nextjs")
- "React" (not "react hooks guide")
- "MongoDB" (not "mongodb database setup")
- "Express.js" (not "express server")

Use cases:
- Getting current API documentation for a library
- Finding usage examples and best practices
- Understanding how to implement specific features
- Checking the latest syntax and methods

The tool will search for the library and return the most relevant documentation content. If a topic is specified, it will focus the results on that specific area.

Example:
${getToolCallString('read_docs', {
  libraryTitle: 'Next.js',
  topic: 'app router',
  max_tokens: 15000,
})}

${getToolCallString('read_docs', {
  libraryTitle: 'MongoDB',
})}
    `.trim(),
  },
  run_file_change_hooks: {
    parameters: z
      .object({
        files: z
          .array(z.string())
          .describe(
            `List of file paths that were changed and should trigger file change hooks`
          ),
      })
      .describe(
        `Trigger file change hooks on the client for the specified files. This should be called after file changes have been applied.`
      ),
    description: `
Purpose: Trigger file change hooks defined in codebuff.json for the specified files. This tool allows the backend to request the client to run its configured file change hooks (like tests, linting, type checking) after file changes have been applied.

Use cases:
- After making code changes, trigger the relevant tests and checks
- Ensure code quality by running configured linters and type checkers
- Validate that changes don't break the build

The client will run only the hooks whose filePattern matches the provided files.

Example:
${getToolCallString('run_file_change_hooks', {
  files: ['src/components/Button.tsx', 'src/utils/helpers.ts'],
})}
    `.trim(),
  },
} as const satisfies ToolSet

const toolConfigsList = Object.entries(toolConfigs).map(
  ([name, config]) =>
    ({
      name: name as keyof typeof toolConfigs,
      ...config,
    }) as {
      [K in keyof typeof toolConfigs]: { name: K } & (typeof toolConfigs)[K]
    }[keyof typeof toolConfigs]
)

export type ToolName = keyof typeof toolConfigs
export const TOOL_LIST = Object.keys(toolConfigs) as ToolName[]

export const toolParams = Object.fromEntries(
  toolConfigsList.map((config) => [
    config.name satisfies ToolName,
    Object.keys(z.toJSONSchema(config.parameters).properties ?? {}),
  ])
) as Record<ToolName, string[]>

// Helper function to build the full tool description markdown
function buildToolDescription(
  toolName: string,
  schema: z.ZodTypeAny,
  description: string = ''
): string {
  const mainDescription = schema.description || ''
  const jsonSchema = z.toJSONSchema(schema)
  delete jsonSchema.description
  delete jsonSchema['$schema']
  const paramsDescription = Object.keys(jsonSchema.properties ?? {}).length
    ? JSON.stringify(jsonSchema, null, 2)
    : 'None'

  let paramsSection = ''
  if (paramsDescription.length === 1 && paramsDescription[0] === 'None') {
    paramsSection = 'Params: None'
  } else if (paramsDescription.length > 0) {
    paramsSection = `Params:\n${paramsDescription}`
  }

  return buildArray([
    `### ${toolName}`,
    mainDescription,
    paramsSection,
    description,
  ]).join('\n\n')
}

const toolDescriptions = Object.fromEntries(
  Object.entries(toolConfigs).map(([name, config]) => [
    name,
    buildToolDescription(name, config.parameters, config.description),
  ])
) as Record<keyof typeof toolConfigs, string>

type ToolConfig = (typeof toolConfigsList)[number]

export type CodebuffToolCall = {
  [K in ToolConfig as K['name']]: {
    toolName: K['name']
    args: z.infer<K['parameters']>
  } & Omit<ToolCallPart, 'type'>
}[ToolConfig['name']]

export type ToolCallError = {
  toolName?: string
  args: Record<string, string>
  error: string
} & Omit<ToolCallPart, 'type'>

export function parseRawToolCall(
  rawToolCall: ToolCallPart & { args: Record<string, string> }
): CodebuffToolCall | ToolCallError {
  const toolName = rawToolCall.toolName

  if (!(toolName in toolConfigs)) {
    return {
      toolName,
      toolCallId: generateCompactId(),
      args: rawToolCall.args,
      error: `Tool ${toolName} not found`,
    }
  }
  const validName = toolName as keyof typeof toolConfigs
  const schemaProperties = z.toJSONSchema(
    toolConfigs[validName].parameters
  ).properties!

  const processedParameters: Record<string, any> = {}
  for (const [param, val] of Object.entries(rawToolCall.args)) {
    if (
      schemaProperties[param] &&
      typeof schemaProperties[param] !== 'boolean' &&
      'type' in schemaProperties[param] &&
      schemaProperties[param].type === 'string'
    ) {
      processedParameters[param] = val
      continue
    }
    try {
      processedParameters[param] = JSON.parse(val)
    } catch (error) {
      return {
        toolName: validName,
        toolCallId: generateCompactId(),
        args: rawToolCall.args,
        error: `Failed to parse parameter ${param} as JSON: ${error}`,
      }
    }
  }

  const result =
    toolConfigs[validName].parameters.safeParse(processedParameters)
  if (!result.success) {
    return {
      toolName: validName,
      toolCallId: generateCompactId(),
      args: rawToolCall.args,
      error: `Invalid parameters for ${validName}: ${JSON.stringify(result.error.issues, null, 2)}`,
    }
  }

  return { toolName: validName, args: result.data } as CodebuffToolCall
}

export const TOOLS_WHICH_END_THE_RESPONSE = [
  'read_files',
  'find_files',
  'run_terminal_command',
  'code_search',
] as const

export const getToolsInstructions = (
  toolNames: readonly ToolName[],
  spawnableAgents: AgentTemplateType[]
) =>
  `
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

### Example

User: can you update the console logs in example/file.ts?
Assistant: Sure thing! Let's update that file!

${getToolCallString('write_file', {
  path: 'path/to/example/file.ts',
  instructions: 'Update the console logs',
  content: "console.log('Hello from Buffy!');",
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

When using write_file, make sure to only include a few lines of context and not the entire file.

## Tool Results

Tool results will be provided by the user's *system* (and **NEVER** by the assistant).

The user does not know about any system messages or system instructions, including tool results.

The user does not need to know about the exact results of these tools, especially if they are warnings or info logs. Just correct yourself in the next response without mentioning anything to the user. e.g., do not mention any XML **warnings** (but be sure to correct the next response), but XML **errors** should be noted to the user.

## List of Tools

These are the tools that you (Buffy) can use. The user cannot see these descriptions, so you should not reference any tool names, parameters, or descriptions.

${toolNames.map((name) => toolDescriptions[name]).join('\n\n')}` +
  `\n\n${
    spawnableAgents.length > 0
      ? `## Spawnable Agents

Use the spawn_agents tool to spawn subagents to help you complete the user request. Here are the available agents by their agent_type:

${spawnableAgents
  .map((agentType) => {
    const agentTemplate = agentTemplates[agentType]
    const { promptSchema } = agentTemplate
    const { prompt, params } = promptSchema
    const promptString =
      prompt === true ? 'required' : prompt === false ? 'n/a' : 'optional'
    const paramsString = params
      ? JSON.stringify(z.toJSONSchema(params), null, 2)
      : 'n/a'
    return `- ${agentType}: ${agentTemplate.description}\nprompt: ${promptString}\nparams: ${paramsString}`
  })
  .join('\n\n')}`
      : ''
  }`

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
  const response = await promptFlashWithFallbacks(messages, {
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
  toolCalls: Extract<
    CodebuffToolCall,
    { toolName: 'update_subgoal' | 'add_subgoal' }
  >[]
) {
  let prompt = [] // 'Log the following tools used and their parameters, and also act on any other instructions:\n'

  for (const toolCall of toolCalls) {
    const { toolName, args } = toolCall
    if (toolName === 'add_subgoal') {
      prompt.push(
        `Please add the following subgoal:\n${renderSubgoalUpdate(args as any)}`
      )
    } else if (toolName === 'update_subgoal') {
      prompt.push(
        `Please update the subgoal with the matching id. For <status> and <plan>, if there are already tags, update them to the new values, keeping only one. For <log>, please keep all the existing logs and append a new <log> entry at the end of the subgoal. Finally, for any unmentioned parameters, do not change them in the existing subgoal:\n${renderSubgoalUpdate(
          args as any
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
  | Exclude<
      CodebuffToolCall,
      {
        toolName:
          | 'write_file'
          | 'str_replace'
          | 'create_plan'
          | 'run_terminal_command'
      }
    >
  | (Omit<ToolCallPart, 'type'> &
      (
        | {
            toolName: 'write_file' | 'str_replace' | 'create_plan'
            args: FileChange
          }
        | {
            toolName: 'run_terminal_command'
            args: { mode: 'user' | 'assistant' } & Extract<
              CodebuffToolCall,
              { toolName: 'run_terminal_command' }
            >['args']
          }
      ))

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

  return promptFlashWithFallbacks(messages, {
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

// TODO: Remove this function
// Function to get filtered tools based on cost mode and agent mode
export function getFilteredToolsInstructions(
  costMode: string,
  readOnlyMode: boolean = false
) {
  let allowedTools = TOOL_LIST

  // Filter based on cost mode
  if (costMode === 'ask' || readOnlyMode) {
    // For ask mode, exclude write_file, str_replace, create_plan, and run_terminal_command
    allowedTools = allowedTools.filter(
      (tool) =>
        !['write_file', 'str_replace', 'run_terminal_command'].includes(tool)
    )
  }

  if (readOnlyMode) {
    allowedTools = allowedTools.filter(
      (tool) => !['create_plan'].includes(tool)
    )
  }

  return getToolsInstructions(allowedTools, [])
}
