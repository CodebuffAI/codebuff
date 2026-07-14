import { describe, expect, test } from 'bun:test'

import { formatAvailableSkillsXml } from '../skills'

describe('formatAvailableSkillsXml', () => {
  test('renders a compact one-line catalog while preserving skill awareness', () => {
    const output = formatAvailableSkillsXml({
      analyze: {
        name: 'analyze',
        description:
          'Read-only repository analysis with evidence and inference.',
        content: '# Analyze',
        filePath: '/skills/analyze/SKILL.md',
      },
      review: {
        name: 'review',
        description:
          'Review code changes for correctness, security, and quality.',
        content: '# Review',
        filePath: '/skills/review/SKILL.md',
      },
    })

    expect(output).toContain(
      '<skill name="analyze" description="Read-only repository analysis with evidence and inference."/>',
    )
    expect(output).toContain('<skill name="review"')
    expect(output).not.toContain('<name>')
    expect(output).not.toContain('<description>')
  })

  test('normalizes and bounds descriptions without losing the skill name', () => {
    const output = formatAvailableSkillsXml({
      large: {
        name: 'large & safe',
        description: `Detailed\n description ${'x'.repeat(300)}`,
        content: '# Large',
        filePath: '/skills/large/SKILL.md',
      },
    })

    expect(output).toContain('name="large &amp; safe"')
    expect(output).toContain('description="Detailed description ')
    expect(output).toContain('…"/>')
    expect(output.length).toBeLessThan(280)
  })
})
