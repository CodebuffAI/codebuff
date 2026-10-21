import { describe, expect, test } from 'bun:test'
import { templatesGuidance } from '../guidance'

const template = { id: 'crm', name: 'CRM' }

describe('starter template context', () => {
  for (const runtime of ['desktop', 'cloud'] as const) {
    for (const mode of ['build', 'plan'] as const) {
      test(`${runtime} ${mode} starts from the selected template's existing code`, () => {
        const prompt = templatesGuidance(mode, runtime, template)
        expect(prompt).toContain('already selected the "CRM" starter template')
        expect(prompt).toContain('Its starter code was installed during project creation')
        expect(prompt).toContain('Treat the current workspace files as the source of truth')
        expect(prompt).toContain('existing README.md')
        expect(prompt).toContain('Preserve changes that have already been made')
        expect(prompt).toContain('Do not search for, choose, or apply another template')
        expect(prompt).not.toContain('Call template_list')
        if (mode === 'plan') {
          expect(prompt).toContain('plan changes to that code')
          expect(prompt).not.toContain('run bun install')
          expect(prompt).not.toContain('show it with')
        } else {
          expect(prompt).toContain("adapt that code to the user's request")
          expect(prompt).toContain("Make only the changes needed for the user's request")
          expect(prompt).toContain(runtime === 'cloud' ? 'cloud_show_dev_server' : 'register_preview')
        }
      })
    }
  }

  test('projects without provenance must inspect their existing code before selecting a starter', () => {
    for (const mode of ['build', 'plan'] as const) {
      const prompt = templatesGuidance(mode)
      expect(prompt).toContain('new chat or newly created project may already contain a selected template or other code')
      expect(prompt).toContain('workspace is empty')
      expect(prompt).not.toContain('project is new or empty')
    }
  })
})
