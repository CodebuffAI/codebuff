import { describe, expect, it } from 'bun:test'

import {
  isSpendProviderId,
  modelVendor,
  SPEND_PROVIDER_IDS,
  spendProviderLabel,
  toSpendProvider,
  UNATTRIBUTED_PROVIDER,
  UNKNOWN_VENDOR,
} from '../constants/spend-providers'

describe('spend provider ids', () => {
  it('never collides with the unattributed sentinel', () => {
    // A lane that could be mistaken for "we do not know" would make a real
    // billing relationship indistinguishable from a missing one.
    expect(isSpendProviderId(UNATTRIBUTED_PROVIDER)).toBe(false)
  })

  it('reads an unknown or absent value as unattributed rather than throwing', () => {
    // Rows outlive deploys: a provider retired from the catalog must degrade to
    // unattributed, not crash the dashboard reading it.
    expect(toSpendProvider(null)).toBe(UNATTRIBUTED_PROVIDER)
    expect(toSpendProvider(undefined)).toBe(UNATTRIBUTED_PROVIDER)
    expect(toSpendProvider('a-lane-we-retired')).toBe(UNATTRIBUTED_PROVIDER)
    expect(toSpendProvider('crof')).toBe('crof')
  })

  it('labels every id without falling back to an empty string', () => {
    for (const id of SPEND_PROVIDER_IDS) {
      expect(spendProviderLabel(id).length).toBeGreaterThan(0)
    }
    expect(spendProviderLabel(UNATTRIBUTED_PROVIDER)).toBe('Unattributed')
  })
})

describe('model vendor', () => {
  it('takes the prefix and makes no claim about the biller', () => {
    // These three are the reason vendor and provider are separate dimensions:
    // in each case the company named in the id is NOT the one that invoices us.
    // The assertion is that this function reports the vendor and stops there.
    expect(modelVendor('openai/gpt-5.6-luna')).toBe('openai')
    expect(modelVendor('z-ai/glm-5.2')).toBe('z-ai')
    expect(modelVendor('google/gemini-3.1-pro-preview')).toBe('google')
  })

  it('handles ids with no vendor prefix', () => {
    expect(modelVendor('some-bare-model')).toBe(UNKNOWN_VENDOR)
    expect(modelVendor('/leading-slash')).toBe(UNKNOWN_VENDOR)
    expect(modelVendor('')).toBe(UNKNOWN_VENDOR)
  })

  it('keeps only the first segment for nested ids', () => {
    expect(modelVendor('openrouter/deepseek/deepseek-v4-pro')).toBe('openrouter')
  })
})
