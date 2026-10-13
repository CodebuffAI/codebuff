import { describe, expect, test } from 'bun:test'

import {
  PROJECT_UNDERSTANDING_MAX_LIST_LENGTH,
  PROJECT_UNDERSTANDING_MAX_VALUE_LENGTH,
  buildProjectUnderstandingOutputSchema,
  normalizeProjectUnderstanding,
  projectUnderstandingHasFindings,
  projectUnderstandingTemplateSchema,
} from '../template'

import type { ProjectUnderstandingTemplate } from '../template'

const TEMPLATE: ProjectUnderstandingTemplate = {
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

describe('projectUnderstandingTemplateSchema', () => {
  test('accepts a well-formed template', () => {
    expect(projectUnderstandingTemplateSchema.parse(TEMPLATE)).toEqual(TEMPLATE)
  })

  test('rejects duplicate section and field keys', () => {
    const dupSection = {
      ...TEMPLATE,
      sections: [TEMPLATE.sections[0], TEMPLATE.sections[0]],
    }
    expect(
      projectUnderstandingTemplateSchema.safeParse(dupSection).success,
    ).toBe(false)
    const section = TEMPLATE.sections[1]
    const dupField = {
      ...TEMPLATE,
      sections: [
        { ...section, fields: [section.fields[0], section.fields[0]] },
      ],
    }
    expect(projectUnderstandingTemplateSchema.safeParse(dupField).success).toBe(
      false,
    )
  })

  test('rejects a section on the reserved size key', () => {
    const bad = {
      ...TEMPLATE,
      sections: [{ ...TEMPLATE.sections[1], key: 'size' }],
    }
    expect(projectUnderstandingTemplateSchema.safeParse(bad).success).toBe(
      false,
    )
  })

  test('rejects keys that are not snake_case', () => {
    const bad = {
      ...TEMPLATE,
      sections: [{ ...TEMPLATE.sections[1], key: 'Misc-Section' }],
    }
    expect(projectUnderstandingTemplateSchema.safeParse(bad).success).toBe(
      false,
    )
  })
})

describe('buildProjectUnderstandingOutputSchema', () => {
  test('requires every section and field, with unknown as an option', () => {
    const schema = buildProjectUnderstandingOutputSchema(TEMPLATE) as any
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

describe('normalizeProjectUnderstanding', () => {
  test('anything that is not an object is all-unknown', () => {
    for (const raw of [null, undefined, 'TypeScript', 42, ['x']]) {
      expect(normalizeProjectUnderstanding(TEMPLATE, raw)).toEqual(ALL_UNKNOWN)
    }
    expect(projectUnderstandingHasFindings(ALL_UNKNOWN)).toBe(false)
  })

  test('matches options case-insensitively and drops what does not fit', () => {
    const profile = normalizeProjectUnderstanding(TEMPLATE, {
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
    expect(projectUnderstandingHasFindings(profile)).toBe(true)
  })

  test('a single choice outside its options, or "unknown", is null', () => {
    expect(
      normalizeProjectUnderstanding(TEMPLATE, { stack: { language: 'Rust' } })
        .stack.language,
    ).toBeNull()
    expect(
      normalizeProjectUnderstanding(TEMPLATE, {
        stack: { language: 'unknown' },
      }).stack.language,
    ).toBeNull()
  })

  test('booleans take yes/no or a real boolean; anything else is unknown', () => {
    const value = (monorepo: unknown) =>
      normalizeProjectUnderstanding(TEMPLATE, { misc: { monorepo } }).misc
        .monorepo
    expect(value('yes')).toBe(true)
    expect(value('no')).toBe(false)
    expect(value(false)).toBe(false)
    expect(value('unknown')).toBeNull()
    expect(value('Yes')).toBeNull()
    expect(value(1)).toBeNull()
  })

  test('caps value length and list length', () => {
    const profile = normalizeProjectUnderstanding(TEMPLATE, {
      misc: {
        tools: [
          'x'.repeat(500),
          ...Array.from({ length: 100 }, (_, i) => `tool-${i}`),
        ],
      },
    })
    const tools = profile.misc.tools as string[]
    expect(tools).toHaveLength(PROJECT_UNDERSTANDING_MAX_LIST_LENGTH)
    expect(tools[0]).toHaveLength(PROJECT_UNDERSTANDING_MAX_VALUE_LENGTH)
  })

  test('a non-object section is all-unknown for that section only', () => {
    const profile = normalizeProjectUnderstanding(TEMPLATE, {
      stack: ['React'],
      misc: { monorepo: 'no' },
    })
    expect(profile.stack).toEqual(ALL_UNKNOWN.stack)
    expect(profile.misc.monorepo).toBe(false)
    // A "no" is a finding.
    expect(projectUnderstandingHasFindings(profile)).toBe(true)
  })
})
