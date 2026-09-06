import z from 'zod/v4'

import { $getNativeToolCallExampleString, jsonToolResultSchema } from '../utils'

import type { $ToolParams } from '../../constants'

/**
 * Ceiling on a model-chosen SYNC command timeout.
 *
 * The value came straight from the model to the client with nothing in between
 * — no clamp anywhere in the runtime — and the only guidance was "Default 30".
 * In practice models picked 3-minute, 10-minute and 50-minute budgets for work
 * that finishes in seconds, and the cost of an over-long value is paid entirely
 * by the user: when the command does hang, they wait the whole budget watching
 * nothing happen.
 *
 * 10 minutes is above any legitimate SYNC command we ship (the longest bundled
 * agent budget is the librarian's 180s `git clone`) while cutting the tail that
 * makes a hang indistinguishable from a freeze. Genuinely open-ended work has
 * two better doors that this does not touch: `-1` for an explicit indefinite
 * wait, and `process_type: BACKGROUND` for long-running processes.
 */
export const MAX_TERMINAL_TIMEOUT_SECONDS = 600
export const MAX_TERMINAL_TIMEOUT_MINUTES = MAX_TERMINAL_TIMEOUT_SECONDS / 60

/** Clamp a model-supplied timeout, preserving the -1 "no timeout" sentinel and
 *  leaving an absent value to the schema default. */
export function clampTerminalTimeoutSeconds(
  seconds: number | undefined,
): number | undefined {
  if (seconds === undefined) return undefined
  if (seconds === -1) return -1
  if (!Number.isFinite(seconds)) return MAX_TERMINAL_TIMEOUT_SECONDS
  // A zero or negative value other than -1 is nonsense rather than a request
  // for a short wait; fall back to the default instead of failing instantly.
  if (seconds <= 0) return 30
  return Math.min(seconds, MAX_TERMINAL_TIMEOUT_SECONDS)
}

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
    message: z.string().optional(),
    stderr: z.string().optional(),
    stdoutOmittedForLength: z.literal(true),
    exitCode: z.number().optional(),
  }),
  z.object({
    command: z.string(),
    processId: z.number(),
    backgroundProcessStatus: z.enum(['running', 'completed', 'error']),
  }),
  z.object({
    command: z.string(),
    errorMessage: z.string(),
  }),
])

/**
 * The commit guidance, with or without the agent attribution trailer.
 *
 * `attribution: false` exists for ONE caller shape: a run whose commit lands in
 * somebody else's repository on somebody else's behalf. Today that is a
 * sponsored proposal — an advertiser-authored change, committed on a branch in
 * a user's own checkout, delivered through a pull request whose body already
 * says where it came from. A `Co-Authored-By` line there attributes the change
 * to us in a stranger's history, on a change we did not author, redundantly.
 *
 * Suppressed in the TOOL DESCRIPTION rather than by adding a "do not add a
 * trailer" bullet to the run's prompt, because this description ships a worked
 * `git commit` example containing the trailer, and a prose instruction losing
 * to a concrete example is the ordinary failure here. The variant removes the
 * footer step and the example both.
 *
 * The default is byte-identical to what shipped before, so a normal user run is
 * unchanged.
 */
export function buildGitCommitGuidePrompt(options: {
  attribution: boolean
}): string {
  return GIT_COMMIT_GUIDE_HEAD.concat(
    options.attribution ? GIT_COMMIT_ATTRIBUTION_STEP : GIT_COMMIT_PLAIN_STEP,
    GIT_COMMIT_GUIDE_TAIL,
  )
}

const GIT_COMMIT_ATTRIBUTION_STEP = `4. **Create the commit, ending with this specific footer:**
   \`\`\`
   Generated with Codebuff 🤖
   Co-Authored-By: Codebuff <noreply@codebuff.com>
   \`\`\`
   Commands run in bash on every OS (Git Bash on Windows), so always use HEREDOC syntax to format the message:
   \`\`\`
   git commit -m "$(cat <<'EOF'
   Your commit message here.

   🤖 Generated with Codebuff
   Co-Authored-By: Codebuff <noreply@codebuff.com>
   EOF
   )"
   \`\`\``

const GIT_COMMIT_PLAIN_STEP = `4. **Create the commit.** Do NOT add any trailer, footer, co-author line or attribution of any kind to the commit message — no \`Co-Authored-By\`, no "Generated with" line. The message is the message and nothing else.
   Commands run in bash on every OS (Git Bash on Windows), so always use HEREDOC syntax to format the message:
   \`\`\`
   git commit -m "$(cat <<'EOF'
   Your commit message here.
   EOF
   )"
   \`\`\``

const GIT_COMMIT_GUIDE_HEAD = `
### Using git to commit changes

Run \`git diff\` to review changes and \`git log\` to match the repo's commit style before committing. Don't push, never alter git config, don't use interactive flags, don't create empty commits.
`

const GIT_COMMIT_GUIDE_TAIL = ``

/** The default guidance. Byte-identical to what shipped before it was split. */
export const gitCommitGuidePrompt = buildGitCommitGuidePrompt({
  attribution: true,
})

const toolName = 'run_terminal_command'
const endsAgentStep = true
const inputSchema = z
  .object({
    // Can be empty to use it for a timeout.
    command: z
      .string()
      .min(1, 'Command cannot be empty')
      .describe(
        `CLI command. Always executed with bash (Git Bash on Windows), so use POSIX syntax on every OS: \`mv\`/\`rm\`, \`/dev/null\`, heredocs. Never use cmd.exe syntax like \`del\`, \`move\`, or \`> nul\` — on Windows \`> nul\` creates a literal file named "nul" that is very hard to delete.`,
      ),
    process_type: z
      .enum(['SYNC', 'BACKGROUND'])
      .default('SYNC')
      .describe(
        `Either SYNC (waits, returns output) or BACKGROUND (runs in background). Default SYNC`,
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
      .transform(clampTerminalTimeoutSeconds)
      .describe(
        `How long to wait, in seconds. Default 30, which is right for almost everything — omit this field unless the command genuinely runs longer. Budget for the command you are actually running (a typecheck or test run is tens of seconds, not minutes); an over-long value does not make a command safer, it just means you wait that long when something hangs. Values above ${MAX_TERMINAL_TIMEOUT_SECONDS} (${MAX_TERMINAL_TIMEOUT_MINUTES} minutes) are clamped. Set to -1 to wait indefinitely, for genuinely open-ended commands only. Does not apply for BACKGROUND commands — use those for long-running processes instead.`,
      ),
  })
  .describe(
    `Execute a CLI command from the **project root** (different from the user's cwd).`,
  )
const buildDescription = (options: { attribution: boolean }) => `
Commands run in bash on every OS. Use POSIX syntax (\`mv\`/\`rm\`, not \`move\`/\`del\`).

${buildGitCommitGuidePrompt(options)}

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
    command: options.attribution
      ? `git commit -m "Your commit message here.

🤖 Generated with Codebuff
Co-Authored-By: Codebuff <noreply@codebuff.com>"`
      : `git commit -m "Your commit message here."`,
  },
  endsAgentStep,
})}
    `.trim()

const description = buildDescription({ attribution: true })

/**
 * The `run_terminal_command` description with every agent-attribution trailer
 * removed, for a run that commits into somebody else's repository.
 *
 * Selected per run in `getToolSet`, off the agent definition's
 * `suppressCommitAttribution`. See {@link buildGitCommitGuidePrompt}.
 */
export const runTerminalCommandNoAttributionDescription = buildDescription({
  attribution: false,
})

export const runTerminalCommandParams = {
  toolName,
  endsAgentStep,
  description,
  inputSchema,
  outputSchema: jsonToolResultSchema(terminalCommandOutputSchema),
} satisfies $ToolParams
