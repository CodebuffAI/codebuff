import { ResolvedPluginConfig } from './config'
import { spawnLocal } from './spawn-local'

/**
 * Build CLI arguments for `posthog-cli sourcemap process`.
 */
export function buildSourcemapCliArgs(
  config: ResolvedPluginConfig,
  mode: { stdin: true } | { directory: string }
): string[] {
  const args = ['sourcemap', 'process']

  if ('stdin' in mode) {
    args.push('--stdin')
  } else {
    args.push('--directory', mode.directory)
  }

  if (config.sourcemaps.releaseName) {
    args.push('--release-name', config.sourcemaps.releaseName)
  }

  if (config.sourcemaps.releaseVersion) {
    args.push('--release-version', config.sourcemaps.releaseVersion)
  }

  if (config.sourcemaps.deleteAfterUpload) {
    args.push('--delete-after')
  }

  if (config.sourcemaps.batchSize) {
    args.push('--batch-size', config.sourcemaps.batchSize.toString())
  }

  return args
}

/**
 * Build environment variables for CLI invocation.
 * Plugin config values override any existing process.env values.
 */
export function buildCliEnv(config: ResolvedPluginConfig): NodeJS.ProcessEnv {
  return {
    ...process.env,
    RUST_LOG: `posthog_cli=${config.logLevel}`,
    POSTHOG_CLI_HOST: config.host,
    POSTHOG_CLI_API_KEY: config.personalApiKey,
    POSTHOG_CLI_PROJECT_ID: config.projectId,
  }
}

/**
 * Spawn the PostHog CLI for sourcemap processing via stdin (file list).
 */
export async function runSourcemapCli(
  config: ResolvedPluginConfig,
  options: { filePaths: string[] } | { directory: string }
): Promise<void> {
  const mode = 'filePaths' in options ? { stdin: true as const } : { directory: options.directory }
  const args = buildSourcemapCliArgs(config, mode)
  const env = buildCliEnv(config)

  const spawnOptions: Parameters<typeof spawnLocal>[2] = {
    cwd: process.cwd(),
    env,
    stdio: 'inherit',
  }

  if ('filePaths' in options) {
    spawnOptions.stdin = options.filePaths.join('\n') + '\n'
  }

  await spawnLocal(config.cliBinaryPath, args, spawnOptions)
}
