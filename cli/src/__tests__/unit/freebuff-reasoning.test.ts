import { describe, expect, test, beforeEach, afterAll } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID,
  FREEBUFF_GLM_V53_FLASH_MODEL_ID,
  FREEBUFF_MIMO_V25_MODEL_ID,
  getFreebuffModelDefaultEffort,
  getFreebuffModelEfforts,
} from '@codebuff/common/constants/freebuff-models'

import type { ReasoningEffort } from '@codebuff/common/constants/reasoning-effort'

/**
 * `/reasoning` is the CLI's counterpart to Desktop's effort picker. Both end up
 * writing the same `freebuff_reasoning_effort` metadata key, and the server
 * treats it as a REQUEST it re-clamps — so the client's job is only to send a
 * rung the selected model actually offers, and to send NOTHING when the user
 * has expressed no preference.
 *
 * That last part is the one a type-check cannot catch: sending the model
 * default explicitly type-checks, reads correctly, and silently overrides an
 * agent's own declared reasoning while looking like a user decision.
 *
 * Settings are redirected by HOME rather than by mocking `../utils/settings`.
 * `mock.module` is process-global in bun and is NOT scoped to the file that
 * calls it: a settings mock here reached the freebuff-model-selector suite that
 * runs later in the same process and failed 18 of its tests. A temp HOME also
 * exercises the real load/save round trip, which is where the catalog
 * validation lives.
 */
const realHome = process.env.HOME
const tempHome = mkdtempSync(join(tmpdir(), 'freebuff-reasoning-'))
process.env.HOME = tempHome
afterAll(() => {
  if (realHome === undefined) delete process.env.HOME
  else process.env.HOME = realHome
  rmSync(tempHome, { recursive: true, force: true })
})

const { handleReasoningCommand } = await import('../../commands/reasoning')
const {
  getFreebuffReasoningEffortForModel,
  getEffectiveFreebuffReasoningEffort,
  getSelectedFreebuffReasoningEffort,
  useFreebuffModelStore,
} = await import('../../state/freebuff-model-store')
const { loadFreebuffReasoningEfforts } = await import('../../utils/settings')

const LADDERED = FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID
const NO_LADDER = FREEBUFF_MIMO_V25_MODEL_ID

describe('/reasoning', () => {
  beforeEach(() => {
    useFreebuffModelStore.setState({
      selectedModel: LADDERED,
      reasoningEffortByModel: {},
    })
    useFreebuffModelStore.getState().setReasoningEffort(LADDERED, undefined)
    useFreebuffModelStore.getState().setReasoningEffort(NO_LADDER, undefined)
  })

  test('the catalog still gives the model under test a ladder', () => {
    // Guards the rest of the file: if V4 Flash ever loses its `efforts`, every
    // assertion below would pass vacuously against the no-ladder branch.
    expect(getFreebuffModelEfforts(LADDERED)).toBeTruthy()
    expect(getFreebuffModelEfforts(NO_LADDER)).toBeNull()
  })

  test('with no argument it reports the model default and does not set one', () => {
    const { message } = handleReasoningCommand('')
    expect(message).toContain(getFreebuffModelDefaultEffort(LADDERED)!)
    expect(message).toContain('model default')
    // The read path must stay a read: nothing sent until the user picks.
    expect(getSelectedFreebuffReasoningEffort()).toBeNull()
  })

  test('a valid rung is set, sent, and survives a reload', () => {
    handleReasoningCommand('max')
    expect(getSelectedFreebuffReasoningEffort()).toBe('max')
    expect(loadFreebuffReasoningEfforts()[LADDERED]).toBe('max')
  })

  test('an invalid rung changes nothing and names the ladder', () => {
    handleReasoningCommand('max')
    const { message } = handleReasoningCommand('gigantic')
    // DeepSeek accepts any string for reasoning_effort and silently ignores
    // what it does not recognize, so a bad word must never reach the wire.
    expect(getSelectedFreebuffReasoningEffort()).toBe('max')
    expect(message).toContain('low')
  })

  test('a rung the model does not offer is refused even though it is a real effort', () => {
    // `xhigh` is on the shared ladder but not on DeepSeek V4's.
    expect(getFreebuffModelEfforts(LADDERED)).not.toContain('xhigh')
    handleReasoningCommand('xhigh')
    expect(getSelectedFreebuffReasoningEffort()).toBeNull()
  })

  test('default/reset clears the override rather than storing the default', () => {
    handleReasoningCommand('low')
    handleReasoningCommand('default')
    // Absent, not "low" and not the default value: absence is how the client
    // says "no preference", and it is what lets the server apply the catalog
    // default without treating the turn as a user choice.
    expect(loadFreebuffReasoningEfforts()[LADDERED]).toBeUndefined()
    expect(getSelectedFreebuffReasoningEffort()).toBeNull()
    // The row still displays what it will run at.
    expect(getEffectiveFreebuffReasoningEffort(LADDERED)).toBe(
      getFreebuffModelDefaultEffort(LADDERED),
    )
  })

  test('a model with no ladder is told so and nothing is stored', () => {
    useFreebuffModelStore.setState({ selectedModel: NO_LADDER })
    const { message } = handleReasoningCommand('high')
    expect(message).toContain('no reasoning levels')
    expect(loadFreebuffReasoningEfforts()[NO_LADDER]).toBeUndefined()
  })

  test('overrides are per model, so switching model does not carry a rung across', () => {
    handleReasoningCommand('max')
    useFreebuffModelStore.setState({ selectedModel: NO_LADDER })
    expect(getSelectedFreebuffReasoningEffort()).toBeNull()
    useFreebuffModelStore.setState({ selectedModel: LADDERED })
    expect(getSelectedFreebuffReasoningEffort()).toBe('max')
  })

  test('GLM 5.3 Flash is pickable here, at its own ladder and default', () => {
    // The row shipped with no ladder at all and the CLI answered "no reasoning
    // levels to adjust" for it. Asserted on the CONCRETE model rather than
    // through the generic laddered path because the regression to guard is the
    // catalog row losing `efforts` again, which the LADDERED constant above
    // would not notice.
    useFreebuffModelStore.setState({ selectedModel: FREEBUFF_GLM_V53_FLASH_MODEL_ID })
    // Three rungs again since the evening of 2026-09-01: `max` left on 08-31 for
    // looping and returned as the default because it is the only rung on which
    // this model thinks (see GLM_V53_FLASH_REASONING_EFFORTS).
    expect(getFreebuffModelEfforts(FREEBUFF_GLM_V53_FLASH_MODEL_ID)).toEqual(['low', 'high', 'max'])

    const before = handleReasoningCommand('')
    expect(before.message).toContain('max (model default)')
    expect(before.message).toContain('low, high, max')
    // Nothing sent until the user actually picks — the model default is the
    // server's job, and sending it would look like a decision. (It is a REAL
    // default on the wire now, `reasoningEffort: 'max'`, rather than the unset
    // this row used to run at; the CLI still says nothing until asked.)
    expect(getSelectedFreebuffReasoningEffort()).toBeNull()

    handleReasoningCommand('low')
    expect(getSelectedFreebuffReasoningEffort()).toBe('low')
    expect(
      loadFreebuffReasoningEfforts()[FREEBUFF_GLM_V53_FLASH_MODEL_ID],
    ).toBe('low')

    // `xhigh` is on the shared ladder but not this model's, so the CLI refuses
    // it locally rather than letting the server clamp it to something the user
    // did not choose. `max` now takes the same path, having left this ladder.
    const refused = handleReasoningCommand('xhigh')
    expect(refused.message).toContain('is not a reasoning level')
    expect(getSelectedFreebuffReasoningEffort()).toBe('low')

    // `max` is a rung again (2026-09-01 evening) and the default; `xhigh` is
    // still not on this ladder and is refused rather than silently mapped.
    const acceptedMax = handleReasoningCommand('max')
    expect(acceptedMax.message).toContain('set to max')
    expect(getSelectedFreebuffReasoningEffort()).toBe('max')
    const refusedXhigh = handleReasoningCommand('xhigh')
    expect(refusedXhigh.message).toContain('is not a reasoning level')
    expect(getSelectedFreebuffReasoningEffort()).toBe('max')
  })

  test('a stored rung the model no longer offers is ignored, not clamped', () => {
    // Simulates a catalog change landing under a settings file written by an
    // older client. Sending it would have the server clamp DOWN to a rung the
    // user never picked; sending nothing lands on the model's own default.
    useFreebuffModelStore.setState({
      reasoningEffortByModel: { [LADDERED]: 'xhigh' as ReasoningEffort },
    })
    expect(getFreebuffReasoningEffortForModel(LADDERED)).toBeNull()
  })
})

/**
 * The send path, asserted by reading the source for the same reason the runner's
 * effortForwarding test does: an absent metadata field IS how "use the default"
 * is expressed, so a dropped value is invisible to every other test.
 */
describe('the CLI turn carries the chosen effort', () => {
  const source = readFileSync(
    join(import.meta.dir, '..', '..', 'hooks', 'use-send-message.ts'),
    'utf8',
  )

  test('it reaches extraCodebuffMetadata under the name the server reads', () => {
    const metadata = source.slice(source.indexOf('extraCodebuffMetadata:'))
    expect(metadata).toContain('freebuff_reasoning_effort')
    expect(metadata).toContain('freebuffReasoningEffort')
  })
})
