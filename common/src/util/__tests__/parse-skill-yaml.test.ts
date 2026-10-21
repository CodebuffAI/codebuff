import { describe, expect, test } from 'bun:test'

import matter from 'gray-matter'

import { parseSkillFileContent } from '../parse-skill'

// AB827V0 #288: skill frontmatter is user-controlled, and gray-matter's own
// YAML engine is js-yaml 3 (below the GHSA-mh29-5h37-fv8m floor). Frontmatter
// now goes through `yaml` instead; these pin that a merge-key payload stays
// inert and that ordinary frontmatter still parses.
describe('skill frontmatter YAML', () => {
  test('a merge-key payload neither throws nor reaches Object.prototype', () => {
    const content = [
      '---',
      'name: demo-skill',
      'description: A skill',
      'base: &base',
      '  __proto__:',
      '    polluted: yes',
      'merged:',
      '  <<: *base',
      '---',
      'Body',
    ].join('\n')
    parseSkillFileContent(content, {
      directoryName: 'demo-skill',
      filePath: '/tmp/demo-skill/SKILL.md',
    })
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })

  test('ordinary frontmatter still parses', () => {
    const skill = parseSkillFileContent(
      ['---', 'name: demo-skill', 'description: Does a thing', '---', 'Body'].join('\n'),
      { directoryName: 'demo-skill', filePath: '/tmp/demo-skill/SKILL.md' },
    )
    expect(skill?.name).toBe('demo-skill')
    expect(skill?.description).toBe('Does a thing')
  })

  // gray-matter's DEFAULT engine (still used by the web docs) calls js-yaml 3's
  // `safeLoad`, which js-yaml 4 removed; patches/gray-matter@4.0.3.patch
  // switches it to `load`, which is safe by default in 4. Without the patch
  // this throws "Function yaml.safeLoad is removed in js-yaml 4".
  test("gray-matter's default engine runs on js-yaml 4 and refuses JS tags", () => {
    const fresh = (s: string) => matter(s, { excerpt: false })
    expect(fresh('---\ntitle: Hello\n---\nBody').data).toEqual({ title: 'Hello' })
    expect(() =>
      fresh('---\nf: !!js/function "function () {}"\n---\n'),
    ).toThrow('unknown tag')
  })
})
