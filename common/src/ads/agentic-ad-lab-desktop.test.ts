import { expect, test } from 'bun:test'
import {
  labDesktopTestUrl,
  parseLabDesktopTestUrl,
} from './agentic-ad-lab-desktop'
import { latestSponsoredSkill } from './sponsored-skills/registry'
import {
  parseSponsoredSkill,
  sponsoredSkillSha256,
  renderSponsoredSkillProcedure,
  sponsoredProcedureNeedsDesktopTools,
} from './sponsored-skill'
import { requiredSkillBump } from './sponsored-skill-versions'
import { labAdFromSkill } from './agentic-ad-lab-skill'

const base = latestSponsoredSkill('supabase-persist-one-feature')!
const ref = {
  skillId: base.id,
  version: base.version,
  sha256: sponsoredSkillSha256(base),
}
test('Desktop handoff pins exactly one saved version, without credentials or a fetch host', () => {
  expect(parseLabDesktopTestUrl(labDesktopTestUrl(ref))).toEqual(ref)
  for (const url of [
    labDesktopTestUrl(ref) + '&host=https://evil.test',
    labDesktopTestUrl(ref) + '&skillId=other',
    labDesktopTestUrl(ref).replace('freebuff:', 'https:'),
    labDesktopTestUrl(ref) + '#fragment',
  ])
    expect(parseLabDesktopTestUrl(url)).toBeNull()
})
test('native declarations are hash-bound, validated, and require a major version', () => {
  const native = {
    ...base,
    desktop: {
      interactiveTerminal: true,
      browserOrigins: ['https://app.greptile.com'],
    },
  }
  expect(parseSponsoredSkill(native).ok).toBe(true)
  expect(sponsoredSkillSha256(native)).not.toBe(ref.sha256)
  expect(requiredSkillBump(base, native)).toBe('major')
  expect(
    sponsoredProcedureNeedsDesktopTools(renderSponsoredSkillProcedure(native)),
  ).toBe(true)
  expect(
    sponsoredProcedureNeedsDesktopTools(renderSponsoredSkillProcedure(base)),
  ).toBe(false)
  for (const origin of [
    'http://greptile.com',
    'https://greptile.com/path',
    'https://a:b@greptile.com',
    '*',
  ])
    expect(
      parseSponsoredSkill({ ...native, desktop: { browserOrigins: [origin] } })
        .ok,
    ).toBe(false)
})
test('publishing a skill keeps exact tested procedure and targeting', () => {
  const ad = labAdFromSkill(base, crypto.randomUUID())
  expect(ad.procedure).toBe(renderSponsoredSkillProcedure(base))
  expect(ad.targeting).toBe(base.fits)
})
