/**
 * Ensure the generated bundled-agents module exists before any test imports it.
 *
 * src/agents/bundled-agents.generated.ts is a build artifact (gitignored; only
 * its .d.ts is committed, so typecheck passes without it). CI generates it with
 * `bun run prebuild:agents` before running tests, but a fresh worktree has no
 * such step — and src/utils/local-agent-registry.ts imports it at module scope,
 * so its absence threw during import and took out 17 test files (~371 tests).
 * bun reports that as "Unhandled error between tests" rather than a failure, so
 * the suite looked like 17 fails while quietly not running the rest.
 *
 * Generating it here (once, ~1s, only when missing) mirrors what CI does and
 * keeps `bun test` self-provisioning. See docs/testing.md.
 */
import { existsSync } from 'fs'
import { join } from 'path'

const CLI_ROOT = join(import.meta.dir, '..')
const ARTIFACT = join(CLI_ROOT, 'src/agents/bundled-agents.generated.ts')

if (!existsSync(ARTIFACT)) {
  const result = Bun.spawnSync(
    ['bun', 'run', join(CLI_ROOT, 'scripts/prebuild-agents.ts')],
    { cwd: CLI_ROOT, stdout: 'pipe', stderr: 'pipe' },
  )
  if (!result.success || !existsSync(ARTIFACT)) {
    // Loud and specific: a silent failure here reappears as 17 unexplained
    // "unhandled error" test files further down the run.
    throw new Error(
      'Failed to generate src/agents/bundled-agents.generated.ts. ' +
        'Run `bun run prebuild:agents` in cli/ to see why.\n' +
        result.stderr.toString(),
    )
  }
}
