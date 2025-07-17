import { getToolCallString } from '@codebuff/common/constants/tools'
import z from 'zod/v4'
import { gitCommitGuidePrompt } from '../../system-prompt/prompts'
import { CodebuffToolDef } from '../constants'

const toolName = 'run_terminal_command'
const endsAgentStep = true
export const runTerminalCommandTool = {
  toolName,
  endsAgentStep,
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
${getToolCallString(
  toolName,
  {
    command: 'echo "hello world"',
    process_type: 'SYNC',
  },
  endsAgentStep
)}
    `.trim(),
} satisfies CodebuffToolDef
