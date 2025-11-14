import type { ChildProcess, SpawnOptions } from 'child_process'

/**
 * Spawn function for running shell commands.
 *
 * Compatible with `child_process.spawn` from Node.js.
 * Returns ChildProcess to support full streaming capabilities (stdin, stdout, stderr).
 */
export type CodebuffSpawn = (
  command: string,
  args?: readonly string[],
  options?: SpawnOptions,
) => ChildProcess
