import { describe, expect, test } from 'bun:test'

import {
  renderSponsoredSkillProcedure,
  sponsoredSkillSha256,
} from './sponsored-skill'
import {
  deliveredSponsoredSkillForProcedure,
  deliveredSponsoredSkillForRef,
  sponsoredSkillDeliveryPath,
} from './sponsored-skill-delivery'
import { SPONSORED_SKILLS } from './sponsored-skills/registry'

const skills = [...SPONSORED_SKILLS.values()]

// The public mirror ships no skills (`all.ts` is emptied there).
describe('delivered skill checks', () => {
  const skill = skills[0]
  if (!skill) return
  const raw = JSON.parse(JSON.stringify(skill)) as unknown
  const procedure = renderSponsoredSkillProcedure(skill)

  test('kept only for exactly its procedure', () => {
    expect(deliveredSponsoredSkillForProcedure(raw, procedure)?.id).toBe(
      skill.id,
    )
    expect(
      deliveredSponsoredSkillForProcedure(raw, `${procedure}\nExtra step.`),
    ).toBeNull()
    expect(deliveredSponsoredSkillForProcedure(raw, 'Free text.')).toBeNull()
    expect(deliveredSponsoredSkillForProcedure(undefined, procedure)).toBeNull()
    expect(
      deliveredSponsoredSkillForProcedure({ id: skill.id }, procedure),
    ).toBeNull()
  })

  test('kept only for the recorded version and hash', () => {
    const ref = {
      id: skill.id,
      version: skill.version,
      sha256: sponsoredSkillSha256(skill),
    }
    expect(deliveredSponsoredSkillForRef(raw, ref)?.version).toBe(skill.version)
    expect(
      deliveredSponsoredSkillForRef(raw, { ...ref, sha256: 'sha256:00' }),
    ).toBeNull()
    expect(
      deliveredSponsoredSkillForRef(raw, { ...ref, version: '0.0.0' }),
    ).toBeNull()
  })
})

test('the re-fetch path', () => {
  expect(
    sponsoredSkillDeliveryPath({
      id: 'rill-walkthrough-link',
      version: '1.0.1',
      sha256: 'sha256:ab',
    }),
  ).toBe(
    '/api/v1/ads/sponsored-skills/rill-walkthrough-link/1.0.1?sha256=sha256%3Aab',
  )
})
