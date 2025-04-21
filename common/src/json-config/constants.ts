import { z } from 'zod'

export const StartupProcessSchema = z
  .object({
    name: z
      .string()
      .min(1, 'Process name is required')
      .describe('A user-friendly name for the process.'),
    command: z
      .string()
      .min(1, 'Command is required')
      .describe('The actual shell command to execute.'),
    cwd: z
      .string()
      .optional()
      .describe('The working directory from which to run the command.'),
    enabled: z
      .boolean()
      .optional()
      .default(true)
      .describe('Whether this process should be run.'),
    stdoutFile: z
      .string()
      .optional()
      .describe(
        'Path to write process stdout output. If not specified, output is not stored.'
      ),
    stderrFile: z
      .string()
      .optional()
      .describe(
        'Path to write process stderr output. If not specified, output is not stored.'
      ),
  })
  .describe(
    'Defines a single startup process. This validates the structure of an object representing a command that Codebuff can run automatically when it starts.'
  )

export const CodebuffConfigSchema = z
  .object({
    startupProcesses: z
      .array(StartupProcessSchema)
      .optional()
      .describe(
        'An array of startup processes, each validated by the StartupProcessSchema.'
      ),
  })
  .describe(
    'Defines the overall Codebuff configuration file (e.g., codebuff.json). This schema defines the top-level structure of the configuration.'
  )

/**
 * TypeScript type representing a validated startup process object.
 * This type is inferred from the `StartupProcessSchema` and provides type safety
 * when working with startup process configurations in code.
 */
export type StartupProcess = z.infer<typeof StartupProcessSchema>

/**
 * TypeScript type representing a validated Codebuff configuration object.
 * This type is inferred from the `CodebuffConfigSchema` and provides type safety
 * for the entire configuration structure.
 */
export type CodebuffConfig = z.infer<typeof CodebuffConfigSchema>
