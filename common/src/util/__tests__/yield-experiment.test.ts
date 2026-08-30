import { describe, expect, test } from 'bun:test'

import { IMPREZIA_EXPERIMENT, fnv1a } from '../ad-experiment'
import {
  CPC_YIELD_EXPERIMENT_BASIS_POINTS,
  CPC_YIELD_EXPERIMENT_SALT,
  cpcYieldExperimentArmForUser,
  isValidCpcYieldExperimentConfig,
  type CpcYieldExperimentConfig,
} from '../yield-experiment'

const policy: CpcYieldExperimentConfig = {
  permanentControlBasisPoints: 1_000,
  observedBasisPoints: 2_000,
  treatmentBasisPoints: 500,
}

describe('CPC yield experiment assignment', () => {
  test('is stable and mutually exclusive for one signed-in user', () => {
    for (const userId of ['user-1', 'user-42', 'a-long-uuid-like-user-id']) {
      const first = cpcYieldExperimentArmForUser(userId, policy)
      for (let attempt = 0; attempt < 20; attempt++) {
        expect(cpcYieldExperimentArmForUser(userId, policy)).toBe(first)
      }
      expect(['control', 'shadow', 'treatment']).toContain(first)
    }
  })

  test('reserves the permanent control cohort before all observed allocation', () => {
    for (let i = 0; i < 20_000; i++) {
      const userId = `user-${i}`
      const bucket =
        fnv1a(`${CPC_YIELD_EXPERIMENT_SALT}:${userId}`) %
        CPC_YIELD_EXPERIMENT_BASIS_POINTS
      if (bucket < policy.permanentControlBasisPoints) {
        expect(cpcYieldExperimentArmForUser(userId, policy)).toBe('control')
      }
    }
  })

  test('expands the observed cohort without reshuffling earlier members', () => {
    const smaller = { ...policy, observedBasisPoints: 1_000 }
    const larger = { ...policy, observedBasisPoints: 2_000 }
    for (let i = 0; i < 20_000; i++) {
      const userId = `user-${i}`
      const arm = cpcYieldExperimentArmForUser(userId, smaller)
      if (arm !== 'control') {
        expect(cpcYieldExperimentArmForUser(userId, larger)).toBe(arm)
      }
    }
  })

  test('promotes only existing shadow users when treatment increases', () => {
    const lowerTreatment = { ...policy, treatmentBasisPoints: 200 }
    const higherTreatment = { ...policy, treatmentBasisPoints: 500 }
    for (let i = 0; i < 20_000; i++) {
      const userId = `user-${i}`
      const before = cpcYieldExperimentArmForUser(userId, lowerTreatment)
      const after = cpcYieldExperimentArmForUser(userId, higherTreatment)
      if (before === 'treatment') expect(after).toBe('treatment')
      if (before === 'control') expect(after).toBe('control')
    }
  })

  test('fails dark for missing users and invalid policy', () => {
    const invalidPolicies: CpcYieldExperimentConfig[] = [
      { ...policy, observedBasisPoints: -1 },
      { ...policy, observedBasisPoints: 1.5 },
      { ...policy, treatmentBasisPoints: policy.observedBasisPoints + 1 },
      {
        ...policy,
        permanentControlBasisPoints: 9_000,
        observedBasisPoints: 2_000,
      },
      { ...policy, cohortSalt: '   ' },
    ]
    for (const invalidPolicy of invalidPolicies) {
      expect(isValidCpcYieldExperimentConfig(invalidPolicy)).toBe(false)
      expect(cpcYieldExperimentArmForUser('user-42', invalidPolicy)).toBe(
        'control',
      )
    }
    for (const userId of [null, undefined, '']) {
      expect(cpcYieldExperimentArmForUser(userId, policy)).toBe('control')
    }
    expect(isValidCpcYieldExperimentConfig(null)).toBe(false)
  })

  test('uses a dedicated salt instead of changing the Imprezia cohort key', () => {
    expect(CPC_YIELD_EXPERIMENT_SALT).not.toBe(IMPREZIA_EXPERIMENT)
    expect(
      isValidCpcYieldExperimentConfig({ ...policy, cohortSalt: 'reviewed-v2' }),
    ).toBe(true)
  })
})
