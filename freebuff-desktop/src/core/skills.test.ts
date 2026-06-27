import { describe, expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

import { BUILTIN_SKILL_NAMES, SkillStore } from './skills'

function tempSkills() {
  const dir = mkdtempSync(join(tmpdir(), 'fbd-skills-'))
  return { store: new SkillStore({ skillsDir: dir }), dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) }
}

describe('SkillStore', () => {
  test('reads builtins without seeding', () => {
    const { store, cleanup } = tempSkills()
    try {
      const review = store.read('review')
      expect(review).toBeTruthy()
      expect(review!.builtin).toBe(true)
      expect(review!.prompt.length).toBeGreaterThan(0)
      expect(store.read('nope')).toBeNull()
    } finally {
      cleanup()
    }
  })

  test('seedDefaults writes builtin files; list includes them', () => {
    const { store, dir, cleanup } = tempSkills()
    try {
      store.seedDefaults()
      for (const name of BUILTIN_SKILL_NAMES) {
        expect(readFileSync(join(dir, `${name}.md`), 'utf8').length).toBeGreaterThan(0)
      }
      expect(store.list().map((s) => s.name).sort()).toEqual([...BUILTIN_SKILL_NAMES].sort())
    } finally {
      cleanup()
    }
  })

  test('a user-authored file overrides the builtin', () => {
    const { store, cleanup } = tempSkills()
    try {
      store.write('review', 'CUSTOM REVIEW PROMPT')
      expect(store.read('review')!.prompt).toBe('CUSTOM REVIEW PROMPT')
      // A brand-new skill is listed and not builtin.
      store.write('deploy', 'ship it')
      const deploy = store.read('deploy')!
      expect(deploy.builtin).toBe(false)
      expect(store.list().some((s) => s.name === 'deploy')).toBe(true)
    } finally {
      cleanup()
    }
  })
})
