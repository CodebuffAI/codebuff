import { describe, test, expect } from 'bun:test'

import type { SkillDefinition, SkillsMap } from '@codebuff/common/types/skill'

import {
  SLASH_COMMANDS,
  SLASHLESS_COMMAND_IDS,
  getSlashCommandsWithSkills,
  type SlashCommand,
} from '../slash-commands'

/**
 * Helper: build a minimal SkillDefinition for tests.
 */
function makeSkill(overrides: Partial<SkillDefinition> = {}): SkillDefinition {
  return {
    name: 'demo-skill',
    description: 'A demo skill.',
    content: '---\nname: demo-skill\ndescription: A demo skill.\n---\nbody',
    filePath: '/fake/.agents/skills/demo-skill/SKILL.md',
    ...overrides,
  }
}

/**
 * Helper: build a SkillsMap from a list of SkillDefinition objects.
 */
function makeSkillsMap(skills: SkillDefinition[]): SkillsMap {
  const map: SkillsMap = {}
  for (const skill of skills) {
    map[skill.name] = skill
  }
  return map
}

describe('slash-commands module', () => {
  describe('SLASH_COMMANDS', () => {
    test('is a non-empty array', () => {
      expect(Array.isArray(SLASH_COMMANDS)).toBe(true)
      expect(SLASH_COMMANDS.length).toBeGreaterThan(0)
    })

    test('every entry has a unique id', () => {
      const ids = SLASH_COMMANDS.map((cmd) => cmd.id)
      const unique = new Set(ids)
      expect(ids.length).toBe(unique.size)
    })

    test('every entry has id, label, and a non-empty description', () => {
      for (const cmd of SLASH_COMMANDS) {
        expect(typeof cmd.id).toBe('string')
        expect(cmd.id.length).toBeGreaterThan(0)
        expect(typeof cmd.label).toBe('string')
        expect(cmd.label.length).toBeGreaterThan(0)
        expect(typeof cmd.description).toBe('string')
        expect(cmd.description.length).toBeGreaterThan(0)
      }
    })

    test('contains the durable-plan command quartet plus /plan', () => {
      for (const id of [
        'plan',
        'resume-plan',
        'update-plan',
        'plan-status',
        'lessons',
      ]) {
        expect(SLASH_COMMANDS.find((cmd) => cmd.id === id)).toBeDefined()
      }
    })

    test('/plan description does not claim a hosted model (model-agnostic under BYOK)', () => {
      const plan = SLASH_COMMANDS.find((cmd) => cmd.id === 'plan')
      expect(plan).toBeDefined()
      expect(plan!.description).not.toMatch(/GPT[-\s]?5\.4/i)
      expect(plan!.description).not.toMatch(/GPT[-\s]?5/i)
    })

    test('/review description does not claim a hosted model (model-agnostic under BYOK)', () => {
      const review = SLASH_COMMANDS.find((cmd) => cmd.id === 'review')
      expect(review).toBeDefined()
      expect(review!.description).not.toMatch(/GPT[-\s]?5\.4/i)
      expect(review!.description).not.toMatch(/GPT[-\s]?5/i)
    })

    test('description strings never contain "GPT 5.4" anywhere across the registry', () => {
      for (const cmd of SLASH_COMMANDS) {
        expect(cmd.description).not.toMatch(/GPT[-\s]?5\.4/i)
      }
    })

    test('durable-plan aliases resolve to the right commands', () => {
      const rp = SLASH_COMMANDS.find((cmd) =>
        cmd.aliases?.includes('rp'),
      )
      expect(rp?.id).toBe('resume-plan')

      const up = SLASH_COMMANDS.find((cmd) =>
        cmd.aliases?.includes('up'),
      )
      expect(up?.id).toBe('update-plan')

      const ps = SLASH_COMMANDS.find((cmd) =>
        cmd.aliases?.includes('ps'),
      )
      expect(ps?.id).toBe('plan-status')

      const lesson = SLASH_COMMANDS.find((cmd) =>
        cmd.aliases?.includes('lesson'),
      )
      expect(lesson?.id).toBe('lessons')
    })

    test('agent:general exposes insertText shortcut instead of an executable command', () => {
      const agent = SLASH_COMMANDS.find((cmd) => cmd.id === 'agent:general')
      expect(agent).toBeDefined()
      expect(agent!.insertText).toBe('@general-agent ')
    })
  })

  describe('SLASHLESS_COMMAND_IDS', () => {
    test('is a Set of lowercased ids', () => {
      expect(SLASHLESS_COMMAND_IDS).toBeInstanceOf(Set)
      expect(SLASHLESS_COMMAND_IDS.size).toBeGreaterThan(0)
      for (const id of SLASHLESS_COMMAND_IDS) {
        expect(id).toBe(id.toLowerCase())
      }
    })

    test('contains exactly the commands flagged implicitCommand: true', () => {
      const implicit = new Set(
        SLASH_COMMANDS.filter((cmd) => cmd.implicitCommand).map((cmd) =>
          cmd.id.toLowerCase(),
        ),
      )
      expect(SLASHLESS_COMMAND_IDS).toEqual(implicit)
    })

    test('does not contain non-implicit commands like info, bash, or feedback', () => {
      expect(SLASHLESS_COMMAND_IDS.has('info')).toBe(false)
      expect(SLASHLESS_COMMAND_IDS.has('bash')).toBe(false)
      expect(SLASHLESS_COMMAND_IDS.has('feedback')).toBe(false)
      expect(SLASHLESS_COMMAND_IDS.has('review')).toBe(false)
      expect(SLASHLESS_COMMAND_IDS.has('plan')).toBe(false)
    })

    test('does not include aliases (only command ids)', () => {
      // 'h' is an alias of 'help', 'quit' is an alias of 'exit', etc.
      const allAliases = new Set(
        SLASH_COMMANDS.flatMap((cmd) => cmd.aliases ?? []),
      )
      for (const alias of allAliases) {
        expect(SLASHLESS_COMMAND_IDS.has(alias)).toBe(false)
      }
    })
  })

  describe('getSlashCommandsWithSkills', () => {
    test('returns all base slash commands when skills map is empty', () => {
      const result = getSlashCommandsWithSkills({})
      expect(result.length).toBe(SLASH_COMMANDS.length)
      expect(result[0]).toEqual(SLASH_COMMANDS[0])
      expect(result[result.length - 1]).toEqual(
        SLASH_COMMANDS[SLASH_COMMANDS.length - 1],
      )
    })

    test('appends exactly one skill:<name> entry per skill', () => {
      const skills = makeSkillsMap([
        makeSkill({ name: 'alpha', description: 'alpha skill' }),
        makeSkill({ name: 'beta', description: 'beta skill' }),
        makeSkill({ name: 'gamma', description: 'gamma skill' }),
      ])
      const result = getSlashCommandsWithSkills(skills)
      expect(result.length).toBe(SLASH_COMMANDS.length + 3)
      const skillEntries = result.slice(-3)
      expect(skillEntries[0].id).toBe('skill:alpha')
      expect(skillEntries[0].label).toBe('skill:alpha')
      expect(skillEntries[1].id).toBe('skill:beta')
      expect(skillEntries[2].id).toBe('skill:gamma')
    })

    test('preserves the base commands unmodified at the start of the returned array', () => {
      const skills = makeSkillsMap([makeSkill({ name: 'solo' })])
      const result = getSlashCommandsWithSkills(skills)
      for (let i = 0; i < SLASH_COMMANDS.length; i++) {
        expect(result[i]).toEqual(SLASH_COMMANDS[i])
      }
    })

    test('skill command entries do not carry implicitCommand or insertText', () => {
      const skills = makeSkillsMap([makeSkill({ name: 'plain' })])
      const result = getSlashCommandsWithSkills(skills)
      const skillEntry = result.find((cmd) => cmd.id === 'skill:plain')
      expect(skillEntry).toBeDefined()
      expect(skillEntry!.implicitCommand).toBeUndefined()
      expect(skillEntry!.insertText).toBeUndefined()
      expect(skillEntry!.aliases).toBeUndefined()
    })

    test('truncates skill descriptions longer than 50 characters with an ellipsis', () => {
      const longDescription =
        'This is a very long skill description that definitely exceeds the maximum menu length.'
      expect(longDescription.length).toBeGreaterThan(50)
      const skills = makeSkillsMap([
        makeSkill({ name: 'wordy', description: longDescription }),
      ])
      const result = getSlashCommandsWithSkills(skills)
      const wordy = result.find((cmd) => cmd.id === 'skill:wordy')
      expect(wordy).toBeDefined()
      expect(wordy!.description.length).toBe(50)
      expect(wordy!.description.endsWith('…')).toBe(true)
    })

    test('does not truncate skill descriptions at exactly 50 characters', () => {
      const exact = 'A'.repeat(50) // boundary: 50 chars exactly
      const skills = makeSkillsMap([
        makeSkill({ name: 'fifty', description: exact }),
      ])
      const result = getSlashCommandsWithSkills(skills)
      const fifty = result.find((cmd) => cmd.id === 'skill:fifty')
      expect(fifty!.description).toBe(exact)
      expect(fifty!.description.endsWith('…')).toBe(false)
    })

    test('does not truncate skill descriptions shorter than 50 characters', () => {
      const short = 'Short.'
      const skills = makeSkillsMap([
        makeSkill({ name: 'brief', description: short }),
      ])
      const result = getSlashCommandsWithSkills(skills)
      const brief = result.find((cmd) => cmd.id === 'skill:brief')
      expect(brief!.description).toBe(short)
    })

    test('handles a skill description with exactly 51 characters (truncates)', () => {
      const justOver = 'B'.repeat(51)
      const skills = makeSkillsMap([
        makeSkill({ name: 'over', description: justOver }),
      ])
      const result = getSlashCommandsWithSkills(skills)
      const over = result.find((cmd) => cmd.id === 'skill:over')
      expect(over!.description.length).toBe(50)
      expect(over!.description.endsWith('…')).toBe(true)
    })

    test('produces stable output order for an empty + non-empty skills pair', () => {
      const empty = getSlashCommandsWithSkills({})
      const withSkills = getSlashCommandsWithSkills(
        makeSkillsMap([makeSkill({ name: 'z' })]),
      )
      // All base commands must appear in the same positions in both runs.
      for (let i = 0; i < SLASH_COMMANDS.length; i++) {
        expect(withSkills[i].id).toBe(empty[i].id)
      }
    })

    test('all returned entries satisfy the SlashCommand type contract', () => {
      const skills = makeSkillsMap([makeSkill({ name: 'typed' })])
      const result = getSlashCommandsWithSkills(skills)
      for (const cmd of result as SlashCommand[]) {
        expect(typeof cmd.id).toBe('string')
        expect(typeof cmd.label).toBe('string')
        expect(typeof cmd.description).toBe('string')
      }
    })
  })
})
