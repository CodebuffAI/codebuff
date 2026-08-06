// The CLI can offer two kinds of freebuff row: the picker grid, and the referral banner's earned
// GLM 5.2 action. Both end up as a POST the server gates, and as a free-mode root agent that has
// to allow the model — so a row this surface can show must survive all of it. Desktop shipped the
// mirror-image of this bug (an offered GLM row its own route answered 400 for), which is what
// these lock down here.

import { describe, expect, test } from 'bun:test'

import { getFreebuffRootAgentIdForModel } from '@codebuff/common/constants/free-agents'
import {
  FREEBUFF_GLM_V52_MODEL_ID,
  resolveFreebuffModelForAccessTier,
} from '@codebuff/common/constants/freebuff-models'
import { freebuffOfferViolations } from '@codebuff/common/testing/freebuff-offer-invariants'

import { freebuffCliOfferedModelIds } from '../freebuff-model-selector'

describe('freebuff rows the CLI offers', () => {
  for (const accessTier of ['full', 'limited'] as const) {
    test(`are all usable on the ${accessTier} tier`, () => {
      expect(
        freebuffOfferViolations({
          surface: `cli picker + referral banner (${accessTier})`,
          accessTier,
          offered: freebuffCliOfferedModelIds(accessTier),
          // the CLI's own resolver, which every session start runs the selection through: a model
          // it coerces away is one the user picked and never got
          accepts: (model) =>
            resolveFreebuffModelForAccessTier(model, accessTier) === model,
          rootAgentIdFor: getFreebuffRootAgentIdForModel,
          catalog: 'supported',
        }),
      ).toEqual([])
    })
  }

  test('the earned reward is offered on BOTH tiers, and the grid never shows it', () => {
    // Limited access included: a bounty grant is redeemable there, so the row has to be
    // reachable there. The banner still only renders it against a live balance.
    expect(freebuffCliOfferedModelIds('full')).toContain(FREEBUFF_GLM_V52_MODEL_ID)
    expect(freebuffCliOfferedModelIds('limited')).toContain(
      FREEBUFF_GLM_V52_MODEL_ID,
    )
  })

  // 'base2-free' is the fallback root, and its allowlist has never included the referral reward.
  // A GLM row that fell through to it would 403 with free_mode_invalid_agent_model on the first
  // turn instead of failing at selection, so the mapping is what keeps the reward runnable.
  test('the reward maps to its own root agent rather than the fallback', () => {
    expect(getFreebuffRootAgentIdForModel(FREEBUFF_GLM_V52_MODEL_ID)).toBe(
      'base2-free-glm',
    )
  })
})
