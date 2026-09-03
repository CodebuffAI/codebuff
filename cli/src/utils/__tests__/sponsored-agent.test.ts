/**
 * The two prompt bullets are a MIRROR, and this is what stops it drifting.
 *
 * `SPONSORED_REPO_GIT_GUIDANCE` lives in a Convex module
 * (`freebuff/web/convex/coding_agent/cli_agent/system_prompt.ts`), and importing
 * it here would drag the Convex generated API into the CLI's typecheck program.
 * So the two lines are copied — and read back out of the production file as
 * TEXT, so a copy that stops matching fails here rather than in a run whose
 * commit went somewhere nobody expected.
 *
 * The same technique Desktop's `sponsored-run.test.ts` uses, for the same
 * reason.
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { ensureCliTestEnv } from '../../__tests__/test-utils'

ensureCliTestEnv()

const {
  SPONSORED_COMMIT_BULLET,
  SPONSORED_NO_PUSH_BULLET,
  buildSponsoredPrompt,
} = await import('../sponsored-agent')

const PRODUCTION_PROMPT = join(
  import.meta.dir,
  '..',
  '..',
  '..',
  '..',
  'freebuff',
  'web',
  'convex',
  'coding_agent',
  'cli_agent',
  'system_prompt.ts',
)

describe('the mirrored git guidance', () => {
  test('both bullets are still byte-identical to the production prompt', () => {
    const source = readFileSync(PRODUCTION_PROMPT, 'utf8')
    expect(source).toContain(SPONSORED_COMMIT_BULLET)
    expect(source).toContain(SPONSORED_NO_PUSH_BULLET)
  })

  test('the run’s prompt is the procedure UNDER the guidance', () => {
    // Under, not over: the guidance is ours and the procedure is the
    // advertiser's, and a procedure that arrived first would be a procedure
    // that could argue with the rules above it.
    const prompt = buildSponsoredPrompt('Wire up the Acme deploy hook.')
    expect(prompt.indexOf(SPONSORED_COMMIT_BULLET)).toBeLessThan(
      prompt.indexOf('Wire up the Acme deploy hook.'),
    )
    expect(prompt).toContain(SPONSORED_NO_PUSH_BULLET)
    // Every refusal the prompt restates is one the code ENFORCES, so the model
    // is told about a boundary rather than asked to keep one.
    expect(prompt).toContain('--no-verify')
    expect(prompt).toContain('Do NOT install dependencies')
    expect(prompt).toContain('nobody watching')
  })
})
