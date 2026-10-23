import { z } from 'zod/v4'

/**
 * A Cloud project's secrets: environment variables the owner saves once and
 * every chat in the project gets, in its shells (agent, terminal, dev
 * server) and in the app's git-ignored `.env.local`. The server keeps them
 * sealed; a value never comes back to a browser or Desktop, only its name
 * and last four characters.
 */
export const PROJECT_SECRET_LIMIT = 100
export const PROJECT_SECRET_VALUE_MAX = 16 * 1024

/**
 * Names a shell, loader or language runtime reads to decide how to run
 * anything at all. A project secret only adds variables; it never redirects
 * the chat's own shell.
 */
const RESERVED = new Set([
  'HOME',
  'USER',
  'LOGNAME',
  'SHELL',
  'PATH',
  'PWD',
  'OLDPWD',
  'IFS',
  'ENV',
  'BASH_ENV',
  'CDPATH',
  'PS1',
  'PS2',
  'PS4',
  'PROMPT_COMMAND',
  'SHELLOPTS',
  'BASHOPTS',
  'TMPDIR',
  'NODE_OPTIONS',
  'PYTHONPATH',
  'PYTHONSTARTUP',
  'GIT_DIR',
  'GIT_WORK_TREE',
  'GIT_CONFIG',
  'GIT_CONFIG_GLOBAL',
  'GIT_CONFIG_SYSTEM',
])
const RESERVED_PREFIXES = ['LD_', 'BASH_FUNC_', 'GIT_CONFIG_', 'FREEBUFF_']

export function projectSecretNameProblem(name: string): string | null {
  if (!/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(name))
    return 'Use letters, digits and underscores, starting with a letter or underscore.'
  const upper = name.toUpperCase()
  if (RESERVED.has(upper) || RESERVED_PREFIXES.some((p) => upper.startsWith(p)))
    return `${name} is reserved for the workspace shell.`
  return null
}

export const projectSecretNameSchema = z.string().superRefine((name, ctx) => {
  const problem = projectSecretNameProblem(name)
  if (problem) ctx.addIssue({ code: 'custom', message: problem })
})

export const projectSecretValueSchema = z
  .string()
  .min(1)
  .max(PROJECT_SECRET_VALUE_MAX)
  .refine(
    (value) => !value.includes('\0'),
    'A secret cannot contain a NUL byte.',
  )

export const projectSecretUpdateSchema = z
  .object({ value: projectSecretValueSchema })
  .strict()

export type ProjectSecretSummary = {
  name: string
  /** The value's last four characters. */
  hint: string
  updatedAt: string
}

export type ProjectSecretsSnapshot = { secrets: ProjectSecretSummary[] }

/** The last four characters, or none of a value too short to hide anything. */
export function projectSecretHint(value: string) {
  return value.length >= 12 ? value.slice(-4) : ''
}
