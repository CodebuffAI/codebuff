import { describe, expect, test } from 'bun:test'

import {
  WORKSPACE_PROFILE_MAX_LIST_LENGTH,
  WORKSPACE_PROFILE_MAX_VALUE_LENGTH,
  buildWorkspaceProfileOutputSchema,
  normalizeWorkspaceProfile,
  workspaceProfileHasFindings,
  workspaceProfileTemplateSchema,
} from '../template'

import type { WorkspaceProfileTemplate } from '../template'

const TEMPLATE: WorkspaceProfileTemplate = {
  version: 3,
  sections: [
    {
      key: 'stack',
      title: 'Stack',
      fields: [
        {
          key: 'language',
          kind: 'choice',
          label: 'Main language',
          options: ['TypeScript', 'Python'],
        },
        {
          key: 'frameworks',
          kind: 'choices',
          label: 'Frameworks',
          options: ['React', 'Next.js'],
          allowOther: true,
        },
        {
          key: 'app_kinds',
          kind: 'choices',
          label: 'App kinds',
          options: ['Web app', 'CLI tool'],
        },
      ],
    },
    {
      key: 'misc',
      title: 'Misc',
      fields: [
        { key: 'tools', kind: 'names', label: 'Tools' },
        { key: 'monorepo', kind: 'boolean', label: 'Monorepo' },
      ],
    },
  ],
}

const ALL_UNKNOWN = {
  stack: { language: null, frameworks: [], app_kinds: [] },
  misc: { tools: [], monorepo: null },
}

describe('workspaceProfileTemplateSchema', () => {
  test('accepts a well-formed template', () => {
    expect(workspaceProfileTemplateSchema.parse(TEMPLATE)).toEqual(TEMPLATE)
  })

  test('rejects duplicate section and field keys', () => {
    const dupSection = {
      ...TEMPLATE,
      sections: [TEMPLATE.sections[0], TEMPLATE.sections[0]],
    }
    expect(workspaceProfileTemplateSchema.safeParse(dupSection).success).toBe(
      false,
    )
    const section = TEMPLATE.sections[1]
    const dupField = {
      ...TEMPLATE,
      sections: [
        { ...section, fields: [section.fields[0], section.fields[0]] },
      ],
    }
    expect(workspaceProfileTemplateSchema.safeParse(dupField).success).toBe(
      false,
    )
  })

  test('rejects a section on the reserved size key', () => {
    const bad = {
      ...TEMPLATE,
      sections: [{ ...TEMPLATE.sections[1], key: 'size' }],
    }
    expect(workspaceProfileTemplateSchema.safeParse(bad).success).toBe(false)
  })

  test('rejects keys that are not snake_case', () => {
    const bad = {
      ...TEMPLATE,
      sections: [{ ...TEMPLATE.sections[1], key: 'Misc-Section' }],
    }
    expect(workspaceProfileTemplateSchema.safeParse(bad).success).toBe(false)
  })
})

describe('buildWorkspaceProfileOutputSchema', () => {
  test('requires every section and field, with unknown as an option', () => {
    const schema = buildWorkspaceProfileOutputSchema(TEMPLATE) as any
    expect(schema.required).toEqual(['stack', 'misc'])
    expect(schema.properties.stack.required).toEqual([
      'language',
      'frameworks',
      'app_kinds',
    ])
    expect(schema.properties.stack.properties.language.enum).toEqual([
      'TypeScript',
      'Python',
      'unknown',
    ])
    expect(schema.properties.stack.properties.app_kinds.items.enum).toEqual([
      'Web app',
      'CLI tool',
    ])
    expect(schema.properties.stack.properties.frameworks.items.enum).toBe(
      undefined,
    )
    expect(schema.properties.misc.properties.monorepo.enum).toEqual([
      'yes',
      'no',
      'unknown',
    ])
  })
})

describe('normalizeWorkspaceProfile', () => {
  test('anything that is not an object is all-unknown', () => {
    for (const raw of [null, undefined, 'TypeScript', 42, ['x']]) {
      expect(normalizeWorkspaceProfile(TEMPLATE, raw)).toEqual(ALL_UNKNOWN)
    }
    expect(workspaceProfileHasFindings(ALL_UNKNOWN)).toBe(false)
  })

  test('matches options case-insensitively and drops what does not fit', () => {
    const profile = normalizeWorkspaceProfile(TEMPLATE, {
      stack: {
        language: 'typescript',
        frameworks: ['react', '  Remix  ', 'REACT', 'unknown', '', 7],
        app_kinds: ['web APP', 'Spaceship'],
      },
      misc: { tools: ['Make', 'make', 'Just'], monorepo: 'yes' },
      extra: { anything: true },
    })
    expect(profile).toEqual({
      stack: {
        language: 'TypeScript',
        frameworks: ['React', 'Remix'],
        app_kinds: ['Web app'],
      },
      misc: { tools: ['Make', 'Just'], monorepo: true },
    })
    expect(workspaceProfileHasFindings(profile)).toBe(true)
  })

  test('a single choice outside its options, or "unknown", is null', () => {
    expect(
      normalizeWorkspaceProfile(TEMPLATE, { stack: { language: 'Rust' } }).stack
        .language,
    ).toBeNull()
    expect(
      normalizeWorkspaceProfile(TEMPLATE, { stack: { language: 'unknown' } })
        .stack.language,
    ).toBeNull()
  })

  test('booleans take yes/no or a real boolean; anything else is unknown', () => {
    const value = (monorepo: unknown) =>
      normalizeWorkspaceProfile(TEMPLATE, { misc: { monorepo } }).misc.monorepo
    expect(value('yes')).toBe(true)
    expect(value('no')).toBe(false)
    expect(value(false)).toBe(false)
    expect(value('unknown')).toBeNull()
    expect(value('Yes')).toBeNull()
    expect(value(1)).toBeNull()
  })

  test('caps value length and list length', () => {
    const profile = normalizeWorkspaceProfile(TEMPLATE, {
      misc: {
        tools: [
          'x'.repeat(500),
          ...Array.from({ length: 100 }, (_, i) => `tool-${i}`),
        ],
      },
    })
    const tools = profile.misc.tools as string[]
    expect(tools).toHaveLength(WORKSPACE_PROFILE_MAX_LIST_LENGTH)
    expect(tools[0]).toHaveLength(WORKSPACE_PROFILE_MAX_VALUE_LENGTH)
  })

  test('a non-object section is all-unknown for that section only', () => {
    const profile = normalizeWorkspaceProfile(TEMPLATE, {
      stack: ['React'],
      misc: { monorepo: 'no' },
    })
    expect(profile.stack).toEqual(ALL_UNKNOWN.stack)
    expect(profile.misc.monorepo).toBe(false)
    // A "no" is a finding.
    expect(workspaceProfileHasFindings(profile)).toBe(true)
  })
})
