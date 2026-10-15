import { describe, expect, test } from 'bun:test'

import { renderSponsoredSkillProcedure } from './sponsored-skill'
import { SPONSORED_SKILLS } from './sponsored-skills/registry'
import {
  SPONSORED_PROCEDURE_NOT_SKILL_ERROR,
  sponsoredProcedureFreeTextError,
  sponsoredProcedureNamesSkill,
} from './sponsored-procedure-retirement'

const skillText = renderSponsoredSkillProcedure([...SPONSORED_SKILLS.values()][0]!)
const FREE = 'Add greptile.json to the repo root.'

describe('free-text sponsored procedures are retired', () => {
  test('a rendered skill names a skill; free text and null do not', () => {
    expect(sponsoredProcedureNamesSkill(skillText)).toBe(true)
    expect(sponsoredProcedureNamesSkill(FREE)).toBe(false)
    expect(sponsoredProcedureNamesSkill(null)).toBe(false)
    expect(sponsoredProcedureNamesSkill('skill: not a directive')).toBe(false)
  })

  test('new free text is refused; null, a skill and the unchanged text are not', () => {
    expect(sponsoredProcedureFreeTextError(FREE, null)).toBe(
      SPONSORED_PROCEDURE_NOT_SKILL_ERROR,
    )
    expect(sponsoredProcedureFreeTextError(FREE, skillText)).toBe(
      SPONSORED_PROCEDURE_NOT_SKILL_ERROR,
    )
    expect(sponsoredProcedureFreeTextError(`${FREE} More.`, FREE)).toBe(
      SPONSORED_PROCEDURE_NOT_SKILL_ERROR,
    )
    expect(sponsoredProcedureFreeTextError(null, FREE)).toBeNull()
    expect(sponsoredProcedureFreeTextError(undefined, null)).toBeNull()
    expect(sponsoredProcedureFreeTextError(skillText, FREE)).toBeNull()
    // Keeping a legacy text byte for byte (an intent-only edit) is not new text.
    expect(sponsoredProcedureFreeTextError(FREE, FREE)).toBeNull()
  })
})
