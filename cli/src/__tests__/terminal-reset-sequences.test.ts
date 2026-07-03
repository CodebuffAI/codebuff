import { readFileSync } from 'fs'
import { join } from 'path'

import { describe, expect, test } from 'bun:test'

import { TERMINAL_RESET_SEQUENCES } from '../utils/terminal-reset-sequences'

/**
 * The npm wrapper release scripts are standalone published JS that can't
 * import the TS constant, so each carries its own copy of the reset
 * sequences (split into EXIT_ALTERNATE_SCREEN_SEQUENCE +
 * SAFE_TERMINAL_RESET_SEQUENCES). This guard turns silent drift into a test
 * failure: every sequence in the TS constant must appear as a source
 * literal in every wrapper.
 */
const REPO_ROOT = join(import.meta.dir, '..', '..', '..')

const WRAPPER_PATHS = [
  'cli/release/index.js',
  'cli/release-staging/index.js',
  'freebuff/cli/release/index.js',
]

/** Split the runtime constant into per-sequence source literals ('\x1b…'). */
function sequenceSourceLiterals(): string[] {
  return TERMINAL_RESET_SEQUENCES.split('\x1b')
    .filter(Boolean)
    .map((rest) => `'\\x1b${rest}'`)
}

describe('terminal reset sequence copies stay in sync', () => {
  for (const wrapperPath of WRAPPER_PATHS) {
    test(wrapperPath, () => {
      const source = readFileSync(join(REPO_ROOT, wrapperPath), 'utf8')
      for (const literal of sequenceSourceLiterals()) {
        expect(source).toContain(literal)
      }
    })
  }
})
