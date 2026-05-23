import { resolveBinaryPath } from './utils'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent'

export interface PluginConfig {
  personalApiKey: string
  /** @deprecated Use projectId instead */
  envId?: string
  projectId?: string
  host?: string
  logLevel?: LogLevel
  cliBinaryPath?: string
  sourcemaps?: {
    enabled?: boolean
    /** @deprecated Use releaseName instead */
    project?: string
    releaseName?: string
    /** @deprecated Use releaseVersion instead */
    version?: string
    releaseVersion?: string
    deleteAfterUpload?: boolean
    batchSize?: number
  }
}

export interface ResolvedPluginConfig extends Omit<PluginConfig, 'envId' | 'projectId'> {
  projectId?: string
  host: string
  logLevel: LogLevel
  cliBinaryPath: string
  sourcemaps: {
    enabled: boolean
    releaseName?: string
    releaseVersion?: string
    deleteAfterUpload: boolean
    batchSize?: number
  }
}

export interface ResolveConfigOptions {
  /** Default value for sourcemaps.enabled when not explicitly set. Defaults to true. */
  defaultEnabled?: boolean
  /** The cwd used for resolving the CLI binary path. Defaults to process.cwd(). */
  cwd?: string
}

export function resolveConfig(options: PluginConfig, resolveOptions?: ResolveConfigOptions): ResolvedPluginConfig {
  const projectId = options.projectId ?? options.envId
  const host = options.host ?? 'https://us.i.posthog.com'
  const logLevel = options.logLevel ?? 'info'
  const cwd = resolveOptions?.cwd ?? process.cwd()
  const cliBinaryPath =
    options.cliBinaryPath ??
    resolveBinaryPath('posthog-cli', {
      path: process.env.PATH ?? '',
      cwd,
    })

  const userSourcemaps = options.sourcemaps ?? {}
  const defaultEnabled = resolveOptions?.defaultEnabled ?? true
  const enabled = userSourcemaps.enabled ?? defaultEnabled

  if (enabled) {
    if (!projectId) {
      throw new Error('projectId is required when sourcemaps are enabled (envId is deprecated)')
    }
    if (!options.personalApiKey) {
      throw new Error('personalApiKey is required when sourcemaps are enabled')
    }
  }

  return {
    personalApiKey: options.personalApiKey,
    projectId,
    host,
    logLevel,
    cliBinaryPath,
    sourcemaps: {
      enabled,
      releaseName: userSourcemaps.releaseName ?? userSourcemaps.project,
      releaseVersion: userSourcemaps.releaseVersion ?? userSourcemaps.version,
      deleteAfterUpload: userSourcemaps.deleteAfterUpload ?? true,
      batchSize: userSourcemaps.batchSize,
    },
  }
}
