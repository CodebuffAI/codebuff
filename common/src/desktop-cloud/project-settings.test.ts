import { expect, test } from 'bun:test'
import {
  cloudProjectSettingsSchema,
  cloudProjectSettingsUpdateSchema,
  firstUnstorableChar,
  unstorableProjectSettingsRefusal,
  unstorableSkillsRefusal,
} from './project-settings'

test('old projects default to empty settings while writes reject malformed and oversized skills', () => {
  expect(cloudProjectSettingsSchema.parse({})).toEqual({
    startupScript: '',
    skills: [],
  })
  const skill = {
    name: 'review',
    description: 'Review changes',
    instructions: 'Read the diff.',
  }
  expect(
    cloudProjectSettingsSchema.safeParse({ skills: [skill, skill] }).success,
  ).toBe(false)
  expect(
    cloudProjectSettingsSchema.safeParse({
      skills: [{ ...skill, name: '../escape' }],
    }).success,
  ).toBe(false)
  expect(
    cloudProjectSettingsSchema.safeParse({ startupScript: 'x'.repeat(16001) })
      .success,
  ).toBe(false)
  expect(
    cloudProjectSettingsSchema.safeParse({
      skills: [{ ...skill, instructions: 'x'.repeat(50001) }],
    }).success,
  ).toBe(false)
  expect(
    cloudProjectSettingsUpdateSchema.safeParse({ settings: {} }).success,
  ).toBe(false)
  expect(
    cloudProjectSettingsUpdateSchema.safeParse({ revision: -1, settings: {} })
      .success,
  ).toBe(false)
  expect(
    cloudProjectSettingsUpdateSchema.safeParse({
      revision: 1,
      userId: 'another',
      settings: {},
    }).success,
  ).toBe(false)
})

test('skill packages reject escaping resource paths', () => {
  for (const path of [
    '../secret',
    '/etc/passwd',
    'dir/../../secret',
    'dir\\secret',
  ]) {
    expect(
      cloudProjectSettingsSchema.safeParse({
        skills: [
          {
            name: 'review',
            description: 'Review',
            instructions: 'Read resource',
            files: [{ path, contents: 'data' }],
          },
        ],
      }).success,
    ).toBe(false)
  }
})

// `jsonb` refuses a NUL and an unpaired surrogate at the `::jsonb` cast every
// settings write goes through, and the schemas above take both: that is the
// 500 behind a Save that did nothing. See `unstorableSkillsRefusal`.
const NUL = String.fromCharCode(0)
const HIGH_SURROGATE = String.fromCharCode(0xd800)
const LOW_SURROGATE = String.fromCharCode(0xdc00)

const storableSkill = {
  name: 'review',
  description: 'Review changes',
  instructions: 'Read the diff.',
}

test('a character jsonb cannot store is located by codepoint and offset', () => {
  expect(firstUnstorableChar('plain text')).toBeUndefined()
  // Tab, newline and carriage return are stored verbatim, and an emoji is a
  // surrogate pair, not a lone one: none of them may be refused.
  expect(firstUnstorableChar('tab\tline\r\nend \u{1f600}')).toBeUndefined()
  // A C0 control other than NUL is storable, so it stays allowed.
  expect(firstUnstorableChar(`${String.fromCharCode(1)}bell`)).toBeUndefined()
  expect(firstUnstorableChar(`ok${NUL}no`)).toEqual({
    index: 2,
    kind: 'nul',
    label: 'U+0000',
  })
  expect(firstUnstorableChar(`a${HIGH_SURROGATE}`)).toEqual({
    index: 1,
    kind: 'surrogate',
    label: 'U+D800',
  })
  expect(firstUnstorableChar(`${LOW_SURROGATE}b`)).toEqual({
    index: 0,
    kind: 'surrogate',
    label: 'U+DC00',
  })
})

test('an unstorable skill is refused by name, field and offset', () => {
  expect(unstorableSkillsRefusal([storableSkill])).toBeUndefined()
  expect(
    unstorableSkillsRefusal([
      { ...storableSkill, instructions: `Read${NUL} the diff.` },
    ]),
  ).toBe(
    'Skill "review" cannot be saved: its instructions contain a NUL character (U+0000) at position 4. Remove it and save again.',
  )
  expect(
    unstorableSkillsRefusal([
      { ...storableSkill, description: `R${HIGH_SURROGATE}` },
    ]),
  ).toBe(
    'Skill "review" cannot be saved: its description contains an unpaired surrogate (U+D800) at position 1. Remove it and save again.',
  )
  expect(
    unstorableSkillsRefusal([
      {
        ...storableSkill,
        files: [{ path: 'docs/notes.md', contents: `a${NUL}b` }],
      },
    ]),
  ).toBe(
    'Skill "review" cannot be saved: its file "docs/notes.md" contains a NUL character (U+0000) at position 1. Remove it and save again.',
  )
  expect(
    unstorableSkillsRefusal([
      {
        ...storableSkill,
        files: [{ path: `docs/${LOW_SURROGATE}.md`, contents: 'fine' }],
      },
    ]),
  ).toBe(
    'Skill "review" cannot be saved: a file path contains an unpaired surrogate (U+DC00) at position 5. Rename the file and save again.',
  )
  // The library is sent whole, so the poisoned skill is named even when it is
  // not the one being edited — that is why a save that only deletes another
  // skill kept failing.
  expect(
    unstorableSkillsRefusal([
      storableSkill,
      { ...storableSkill, name: 'stale', instructions: `x${NUL}` },
    ]),
  ).toContain('Skill "stale"')
})

test('a project startup script is refused the same way as its skills', () => {
  expect(
    unstorableProjectSettingsRefusal({ startupScript: '', skills: [] }),
  ).toBeUndefined()
  expect(
    unstorableProjectSettingsRefusal({
      startupScript: `bun${NUL} install`,
      skills: [],
    }),
  ).toBe(
    'The startup script cannot be saved: it contains a NUL character (U+0000) at position 3. Remove it and save again.',
  )
  expect(
    unstorableProjectSettingsRefusal({
      startupScript: 'bun install',
      skills: [{ ...storableSkill, instructions: `x${NUL}` }],
    }),
  ).toContain('its instructions contain a NUL character')
})
