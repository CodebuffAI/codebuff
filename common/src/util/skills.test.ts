import { describe, expect, test } from 'bun:test'

import { formatAvailableSkillsXml } from './skills'

import type { SkillsMap } from '../types/skill'

describe('formatAvailableSkillsXml', () => {
  test('omits skills that only the user may invoke', () => {
    const skills: SkillsMap = {
      deploy: {
        name: 'deploy',
        description: 'Deploy the application',
        content: 'deployment instructions',
        disableModelInvocation: true,
        filePath: '/skills/deploy/SKILL.md',
      },
      review: {
        name: 'review',
        description: 'Review code changes',
        content: 'review instructions',
        filePath: '/skills/review/SKILL.md',
      },
    }

    const xml = formatAvailableSkillsXml(skills)

    expect(xml).toContain('<name>review</name>')
    expect(xml).not.toContain('deploy')
  })

  test('returns an empty listing when every skill is user-only', () => {
    const skills: SkillsMap = {
      deploy: {
        name: 'deploy',
        description: 'Deploy the application',
        content: 'deployment instructions',
        disableModelInvocation: true,
        filePath: '/skills/deploy/SKILL.md',
      },
    }

    expect(formatAvailableSkillsXml(skills)).toBe('')
  })
})
