import z from 'zod/v4'

import { $getNativeToolCallExampleString, jsonToolResultSchema } from '../utils'

import { gitCommitGuidePrompt } from '../../../constants/git-discipline'

import type { $ToolParams } from '../../constants'

export const terminalCommandOutputSchema = z.union([
  z.object({
    command: z.string(),
    startingCwd: z.string().optional(),
    message: z.string().optional(),
    stderr: z.string().optional(),
    stdout: z.string().optional(),
    exitCode: z.number().optional(),
  }),
  z.object({
    command: z.string(),
    startingCwd: z.string().optional(),
    status: z.enum(['passed', 'failed', 'unknown']).optional(),
    message: z.string().optional(),
    stderr: z.string().optional(),
    stderrExcerpt: z.string().optional(),
    stdoutExcerpt: z.string().optional(),
    stdoutOmittedForLength: z.literal(true),
    exitCode: z.number().optional(),
  }),
  z.object({
    command: z.string(),
    processId: z.number(),
    backgroundProcessStatus: z.enum(['running', 'completed', 'error']),
    /** Job id to poll/follow with the check_job tool. */
    jobId: z.string().optional(),
    /** Temp file the background job streams its combined output to. */
    logFile: z.string().optional(),
  }),
  z.object({
    command: z.string(),
    errorMessage: z.string(),
  }),
])

const toolName = 'run_terminal_command'
const endsAgentStep = true
const inputSchema = z
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
        `Either SYNC (waits, returns output) or BACKGROUND (starts a detached job and returns immediately with a jobId — poll/follow it with check_job). Use BACKGROUND for long-running or never-exiting processes (dev servers, watchers, log tails) so you don't block the turn. Default SYNC`,
      ),
    cwd: z
      .string()
      .optional()
      .describe(
        `The working directory to run the command in. Default is the project root.`,
      ),
    timeout_seconds: z
      .number()
      .default(30)
      .optional()
      .describe(
        `Set to -1 for no timeout. Does not apply for BACKGROUND commands. Default 30`,
      ),
  })
  .describe(
    `Execute a CLI command from the **project root** (different from the user's cwd).`,
  )
const description = `
Stick to these use cases:
1. Typechecking the project or running build (e.g., "npm run build"). Reading the output can help you edit code to fix build errors. If possible, use an option that performs checks but doesn't emit files, e.g. \`tsc --noEmit\`.
2. Running tests (e.g., "npm test"). Reading the output can help you edit code to fix failing tests. Or, you could write new unit tests and then run them.
3. Moving, renaming, or deleting files and directories. These actions can be vital for refactoring requests. Use commands like \`mv\`/\`move\` or \`rm\`/\`del\`.

Most likely, you should ask for permission for any other type of command you want to run. If asking for permission, show the user the command you want to run using \`\`\` tags and *do not* use the tool call format, e.g.:
\`\`\`bash
git branch -D foo
\`\`\`

DO NOT do any of the following:
1. Run commands that can modify files outside of the project directory, install packages globally, install virtual environments, or have significant side effects outside of the project directory, unless you have explicit permission from the user. Treat anything outside of the project directory as read-only.
2. Run \`git push\` because it can break production (!) if the user was not expecting it. Don't run \`git commit\`, \`git rebase\`, or related commands unless you get explicit permission. If a user asks to commit changes, you can do so, but you should not invoke any further git commands beyond the git commit command.
3. Run scripts without asking. Especially don't run scripts that could run against the production environment or have permanent effects without explicit permission from the user.
4. Be careful with any command that has big or irreversible effects. Anything that touches a production environment, servers, the database, or other systems that could be affected by a command should be run with explicit permission from the user.
5. Use the run_terminal_command tool to create or edit files. Do not use \`cat\` or \`echo\` to create or edit files. You should instead use other tools for creating or editing files.
6. Use the wrong package manager for the project. For example, if the project uses \`pnpm\` or \`bun\` or \`yarn\`, you should not use \`npm\`. Similarly not everyone uses \`pip\` for python, etc.

Do:
- If there's an opportunity to use "-y" or "--yes" flags, use them. Any command that prompts for confirmation will hang if you don't use the flags.

Notes:
- If the user references a specific file, it could be either from their cwd or from the project root. You **must** determine which they are referring to (either infer or ask). Then, you must specify the path relative to the project root (or use the cwd parameter)
- Commands can succeed without giving any output, e.g. if no type errors were found.
- For long-running or never-exiting commands (dev servers, watchers, \`tail -f\`), set process_type: BACKGROUND. It returns a jobId immediately; read new output (and wait for a readiness pattern) with check_job instead of blocking the turn.

${gitCommitGuidePrompt}

Example:
${$getNativeToolCallExampleString({
  toolName,
  inputSchema,
  input: {
    command: 'echo "hello world"',
  },
  endsAgentStep,
})}

${$getNativeToolCallExampleString({
  toolName,
  inputSchema,
  input: {
    command: `git commit -m "Your commit message here.

🤖 Generated with Openbuff"`,
  },
  endsAgentStep,
})}
    `.trim()

export const runTerminalCommandParams = {
  toolName,
  endsAgentStep,
  description,
  inputSchema,
  outputSchema: jsonToolResultSchema(terminalCommandOutputSchema),
} satisfies $ToolParams
