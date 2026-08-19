/**
 * The provisioned `-max` tiers.
 *
 * These are granted per account rather than picked, so the invariant is the
 * opposite of a normal model's: every catalog must NOT contain them. A client
 * that rendered one would offer a row most accounts cannot run, and the
 * request would fail at admission rather than at the picker — the confusing
 * shape a hidden tier always takes when it leaks into a selectable list.
 *
 * Each tier is pinned to exactly one root, like every other free-mode model,
 * and each root is pinned to exactly that tier: a root that also accepted the
 * base model would be a second, unmetered door onto it — which is what the
 * retired `base2-free-glm-crof` route turned out to be.
 */
import { describe, expect, test } from 'bun:test'

import {
  FREE_MODE_AGENT_MODELS,
  FREEBUFF_CLI_BASE3_AGENT_ID_BY_MODEL,
  FREEBUFF_ROOT_AGENT_IDS,
  FREEBUFF_WEB_BASE3_AGENT_ID_BY_MODEL,
  isFreeModeAllowedAgentModel,
} from '../constants/free-agents'
import {
  FREEBUFF_DEEPSEEK_V4_FLASH_MAX_MODEL_ID,
  FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID,
  FREEBUFF_DEEPSEEK_V4_PRO_MAX_MODEL_ID,
  FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID,
  FREEBUFF_GPT_5_6_LUNA_MAX_MODEL_ID,
  FREEBUFF_GPT_5_6_LUNA_MODEL_ID,
  FREEBUFF_MODELS,
  FREEBUFF_PROVISIONED_MODELS,
  FREEBUFF_WEB_ALL_MODELS,
  FREEBUFF_WEB_MODELS,
  FREEBUFF_WEB_PREMIUM_MODEL_IDS,
  FREEBUFF_STANDARD_MODEL_IDS,
  SUPPORTED_FREEBUFF_MODELS,
  resolveSupportedFreebuffModel,
} from '../constants/freebuff-models'

/** tier -> the root that runs it, and the base model it extends. */
const TIERS: Array<{ id: string; root: string; base: string }> = [
  {
    id: FREEBUFF_DEEPSEEK_V4_PRO_MAX_MODEL_ID,
    root: 'base2-free-deepseek-pro-max',
    base: FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID,
  },
  {
    id: FREEBUFF_DEEPSEEK_V4_FLASH_MAX_MODEL_ID,
    root: 'base2-free-deepseek-flash-max',
    base: FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID,
  },
  {
    id: FREEBUFF_GPT_5_6_LUNA_MAX_MODEL_ID,
    root: 'base2-free-luna-max',
    base: FREEBUFF_GPT_5_6_LUNA_MODEL_ID,
  },
]

describe('provisioned tiers are never offered from a catalog', () => {
  test('the tier list is not empty', () => {
    // Floor: an empty list makes every case below vacuous.
    expect(FREEBUFF_PROVISIONED_MODELS.length).toBe(TIERS.length)
  })

  const catalogs: Array<[string, readonly string[]]> = [
    ['SUPPORTED_FREEBUFF_MODELS', SUPPORTED_FREEBUFF_MODELS.map((m) => m.id)],
    ['FREEBUFF_MODELS', FREEBUFF_MODELS.map((m) => m.id)],
    ['FREEBUFF_WEB_MODELS', FREEBUFF_WEB_MODELS.map((m) => m.id)],
    ['FREEBUFF_WEB_ALL_MODELS', FREEBUFF_WEB_ALL_MODELS.map((m) => m.id)],
    ['FREEBUFF_WEB_PREMIUM_MODEL_IDS', [...FREEBUFF_WEB_PREMIUM_MODEL_IDS]],
    ['FREEBUFF_STANDARD_MODEL_IDS', [...FREEBUFF_STANDARD_MODEL_IDS]],
  ]

  test.each(catalogs)('%s omits every provisioned tier', (_name, ids) => {
    for (const tier of TIERS) expect(ids).not.toContain(tier.id)
  })

  test('a saved preference for a tier falls back to a pickable model', () => {
    for (const tier of TIERS) {
      expect(resolveSupportedFreebuffModel(tier.id)).not.toBe(tier.id)
    }
  })

  test('no base3 root map resolves a provisioned tier', () => {
    for (const tier of TIERS) {
      expect(FREEBUFF_WEB_BASE3_AGENT_ID_BY_MODEL[tier.id]).toBeUndefined()
      expect(FREEBUFF_CLI_BASE3_AGENT_ID_BY_MODEL[tier.id]).toBeUndefined()
    }
  })
})

describe('each tier is pinned to exactly one root', () => {
  test.each(TIERS)('$id runs on $root and nothing else', (tier) => {
    expect(FREE_MODE_AGENT_MODELS[tier.root]?.has(tier.id)).toBe(true)
    expect(isFreeModeAllowedAgentModel(tier.root, tier.id)).toBe(true)
  })

  test.each(TIERS)('$root cannot run the base model $base', (tier) => {
    // A second, unmetered door onto the base model otherwise.
    expect(isFreeModeAllowedAgentModel(tier.root, tier.base)).toBe(false)
  })

  test.each(TIERS)('$root is a registered root agent', (tier) => {
    // A root absent from this list is treated as a subagent, so a top-level
    // request on it fails the hierarchy check instead of running.
    expect(FREEBUFF_ROOT_AGENT_IDS).toContain(tier.root)
  })

  test.each(TIERS)('the base model does not run on $root', (tier) => {
    const rootForBase = Object.entries(FREE_MODE_AGENT_MODELS).filter(
      ([agentId, models]) => models.has(tier.base) && agentId === tier.root,
    )
    expect(rootForBase).toEqual([])
  })
})
