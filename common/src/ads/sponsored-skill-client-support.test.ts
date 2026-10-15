import { describe, expect, test } from 'bun:test'

import { compareSponsoredSkillVersions } from './sponsored-skill'
import {
  SPONSORED_DESKTOP_SKILL_FETCH_MIN,
  SPONSORED_SKILL_FORMAT_2_MIN_CLIENT,
  SPONSORED_SKILL_MIN_CLIENT,
  sponsoredSkillClientRefusal,
} from './sponsored-skill-client-support'
import { SPONSORED_SKILLS } from './sponsored-skills/registry'

const EXA_2 = { id: 'exa-web-search-feature', version: '2.0.0' }
const EXA_1_1 = { id: 'exa-web-search-feature', version: '1.1.0' }
const WITH_PACKAGES = { packages: [{ name: 'exa-js' }] }

const refusal = (
  clientVersion: string | null,
  overrides: Partial<Parameters<typeof sponsoredSkillClientRefusal>[0]> = {},
) =>
  sponsoredSkillClientRefusal({
    client: clientVersion?.startsWith('cli/') ? 'cli' : 'desktop',
    clientVersion,
    skillRef: EXA_2,
    skill: WITH_PACKAGES,
    ...overrides,
  })

describe('sponsoredSkillClientRefusal', () => {
  test('Desktop builds without declared installs or the skill fetch are refused', () => {
    expect(refusal('desktop/0.0.169')).toBe('desktop_too_old')
    expect(refusal('desktop/0.0.170')).toBe('desktop_too_old')
    expect(refusal('desktop/0.0.171')).toBe('desktop_too_old')
  })

  test('Desktop from the fetch build on runs it', () => {
    expect(refusal('desktop/0.0.172')).toBeNull()
    expect(refusal('desktop/0.0.173')).toBeNull()
    expect(refusal('desktop/0.1.0')).toBeNull()
  })

  test('a CLI before Accept delivery runs only a skill its release bundles', () => {
    expect(refusal('cli/0.2.28')).toBe('cli_too_old')
    expect(refusal('cli/0.2.27', { skillRef: EXA_1_1 })).toBe('cli_too_old')
    expect(refusal('cli/0.2.28', { skillRef: EXA_1_1 })).toBeNull()
  })

  test('a CLI with Accept delivery runs any skill', () => {
    expect(refusal('cli/0.2.29')).toBeNull()
    expect(refusal('cli/0.3.0')).toBeNull()
    // ...but only one the server could read, since that is what it delivers.
    expect(refusal('cli/0.2.29', { skill: null })).toBe('cli_too_old')
    expect(refusal('cli/0.2.29', { skillRef: EXA_1_1, skill: null })).toBeNull()
  })

  test('dev builds pass; an unreadable version does not', () => {
    expect(refusal('desktop/dev')).toBeNull()
    expect(refusal('cli/dev')).toBeNull()
    expect(refusal(null)).toBe('client_version_unknown')
    expect(refusal('desktop/nightly')).toBe('client_version_unknown')
    expect(refusal('cli/0.2.28', { client: 'desktop' })).toBe(
      'client_version_unknown',
    )
  })

  test('nothing to refuse: free text, no packages, or the web client', () => {
    expect(refusal('desktop/0.0.169', { skillRef: null })).toBeNull()
    expect(refusal('desktop/0.0.169', { skill: { packages: [] } })).toBeNull()
    expect(refusal(null, { client: 'web' })).toBeNull()
  })

  test('a named skill that could not be read is treated as declaring packages', () => {
    expect(refusal('desktop/0.0.171', { skill: null })).toBe('desktop_too_old')
    expect(refusal('desktop/0.0.172', { skill: null })).toBeNull()
    expect(refusal('cli/0.2.28', { skill: null })).toBe('cli_too_old')
  })
})

describe('SPONSORED_SKILL_MIN_CLIENT', () => {
  test('names only shipped skill versions that declare packages', () => {
    for (const key of Object.keys(SPONSORED_SKILL_MIN_CLIENT)) {
      const skill = SPONSORED_SKILLS.get(key)
      expect(skill, key).toBeDefined()
      expect(skill!.packages.length, key).toBeGreaterThan(0)
    }
  })

  test('a run-spec client is never refused for its version', () => {
    for (const clientVersion of [
      'desktop/0.0.169',
      'cli/0.2.20',
      null,
      'desktop/garbage',
    ])
      expect(refusal(clientVersion, { runSpecVersion: 1 })).toBeNull()
  })

  test('a run-spec client is refused only when the server has no skill', () => {
    expect(refusal('cli/0.2.40', { runSpecVersion: 1, skill: null })).toBe(
      'skill_unresolved',
    )
    expect(
      refusal(null, { client: 'web', runSpecVersion: 1, skill: null }),
    ).toBe('skill_unresolved')
    expect(
      refusal(null, { runSpecVersion: 1, skill: null, skillRef: null }),
    ).toBeNull()
  })

  test('an unknown runSpecVersion keeps the version rule', () => {
    expect(refusal('desktop/0.0.171', { runSpecVersion: 2 })).toBe(
      'desktop_too_old',
    )
  })

  test('never lowers Desktop below the fetch build', () => {
    for (const [key, min] of Object.entries(SPONSORED_SKILL_MIN_CLIENT)) {
      if (!min.desktop) continue
      expect(
        compareSponsoredSkillVersions(
          min.desktop,
          SPONSORED_DESKTOP_SKILL_FETCH_MIN,
        ),
        key,
      ).toBeGreaterThanOrEqual(0)
    }
  })
})

describe('format 2 needs a build that parses it', () => {
  const ref = { id: 'acme-thing', version: '4.0.0' }
  const format2 = { packages: [], format: 2 }
  test('older Desktop and CLI builds are refused, run-spec ones included', () => {
    expect(
      sponsoredSkillClientRefusal({ client: 'desktop', clientVersion: 'desktop/0.0.173', skillRef: ref, skill: format2 }),
    ).toBe('desktop_too_old')
    expect(
      sponsoredSkillClientRefusal({ client: 'desktop', clientVersion: 'desktop/0.0.173', skillRef: ref, skill: format2, runSpecVersion: 1 }),
    ).toBe('desktop_too_old')
    expect(
      sponsoredSkillClientRefusal({ client: 'cli', clientVersion: 'cli/0.2.28', skillRef: ref, skill: format2 }),
    ).toBe('cli_too_old')
    expect(
      sponsoredSkillClientRefusal({ client: 'desktop', clientVersion: null, skillRef: ref, skill: format2 }),
    ).toBe('client_version_unknown')
  })

  test('a build at the floor, dev builds, web and format 1 are not refused for it', () => {
    expect(
      sponsoredSkillClientRefusal({
        client: 'desktop',
        clientVersion: `desktop/${SPONSORED_SKILL_FORMAT_2_MIN_CLIENT.desktop}`,
        skillRef: ref,
        skill: format2,
      }),
    ).toBeNull()
    expect(
      sponsoredSkillClientRefusal({ client: 'desktop', clientVersion: 'desktop/dev', skillRef: ref, skill: format2 }),
    ).toBeNull()
    expect(
      sponsoredSkillClientRefusal({ client: 'web', clientVersion: null, skillRef: ref, skill: format2 }),
    ).toBeNull()
    expect(
      sponsoredSkillClientRefusal({ client: 'desktop', clientVersion: 'desktop/0.0.173', skillRef: ref, skill: { packages: [], format: 1 } }),
    ).toBeNull()
  })
})
