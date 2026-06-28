import { describe, expect, test } from 'bun:test'

import { createBaseDeep } from '../base2/base-deep'
import { createBase2 } from '../base2/base2'
import { createCodeEditor } from '../editor/editor'
import {
  frontendSection,
  gateAwarenessSection,
  gitDisciplineSection,
  qualitySection,
  securityReviewSection,
} from '../base2/quality-prompt-section'

/**
 * `qualitySection` is byte-frozen: any accidental drift across the three
 * consumers (base2.ts, base-deep.ts, editor.ts) is caught here at test time.
 *
 * `frontendSection` is intentionally NOT byte-frozen — it is the one section
 * allowed to evolve as frontend best practices change (SPEC AC7 / R1.3).
 */
describe('shared craftsmanship prompt sections', () => {
  test('qualitySection is byte-stable (snapshot)', () => {
    expect(qualitySection).toMatchSnapshot()
  })

  test('qualitySection contains the required craftsmanship headings', () => {
    // Guard the semantic content without freezing the exact wording, so a
    // future tightening of prose does not silently drop a required topic.
    expect(qualitySection).toContain('# Code Craftsmanship')
    expect(qualitySection).toContain('**Conventions:**')
    expect(qualitySection).toContain('**Libraries/Frameworks:**')
    expect(qualitySection).toContain('**Style & Structure:**')
    expect(qualitySection).toContain('**Simplicity & Minimalism:**')
    expect(qualitySection).toContain('**Code Reuse:**')
    expect(qualitySection).toContain('**Code Hygiene:**')
  })

  test('frontendSection contains the required frontend topics (not byte-frozen)', () => {
    // frontendSection is allowed to evolve; only assert topic coverage.
    expect(frontendSection).toContain('# Frontend Development')
    expect(frontendSection).toContain('Accessibility')
    expect(frontendSection).toContain('Responsive Design')
    expect(frontendSection).toContain('Performance')
  })

  test('gitDisciplineSection contains the required git-discipline topics (not byte-frozen)', () => {
    // gitDisciplineSection is advisory guidance that may evolve; only assert
    // topic coverage so future tightening does not silently drop a rule.
    expect(gitDisciplineSection).toContain('# Git Discipline')
    expect(gitDisciplineSection).toContain('git-committer')
    expect(gitDisciplineSection).toContain('Never push')
    expect(gitDisciplineSection).toContain('Never alter git config')
    expect(gitDisciplineSection).toContain('secrets')
    expect(gitDisciplineSection).toContain('git_status')
    expect(gitDisciplineSection).toContain('git_branch')
  })

  test('securityReviewSection contains the required security-review topics (not byte-frozen)', () => {
    // securityReviewSection is advisory guidance that may evolve; only assert
    // topic coverage so future tightening does not silently drop a rule.
    expect(securityReviewSection).toContain('# Security-Sensitive File Patterns')
    expect(securityReviewSection).toContain('security-reviewer')
    expect(securityReviewSection).toContain('advisory')
    expect(securityReviewSection).toContain('pre-edit')
    expect(securityReviewSection).toContain('auth')
    expect(securityReviewSection).toContain('secrets')
    expect(securityReviewSection).toContain('read-only')
  })

  test('all three consumers interpolate the shared sections', () => {
    // Guards the wiring (R1.2): imports alone are not enough; the sections
    // must actually appear in the assembled prompts.
    const base2 = createBase2('default')
    const baseDeep = createBaseDeep()
    const editor = createCodeEditor({ model: 'opus' })

    expect(base2.systemPrompt).toContain(qualitySection)
    expect(base2.systemPrompt).toContain(frontendSection)
    expect(base2.systemPrompt).toContain(gateAwarenessSection)
    expect(base2.systemPrompt).toContain(gitDisciplineSection)
    expect(base2.systemPrompt).toContain(securityReviewSection)

    expect(baseDeep.systemPrompt).toContain(qualitySection)
    expect(baseDeep.systemPrompt).toContain(frontendSection)
    expect(baseDeep.systemPrompt).toContain(gateAwarenessSection)
    expect(baseDeep.systemPrompt).toContain(gitDisciplineSection)
    expect(baseDeep.systemPrompt).toContain(securityReviewSection)

    // gitDisciplineSection is intentionally NOT interpolated into the editor —
    // the editor is for code editing, not git work; the git-committer agent
    // owns the detailed commit workflow.
    // securityReviewSection is intentionally NOT interpolated into the editor
    // — the orchestrator decides when to spawn security-reviewer; the editor
    // implements the (already-reviewed) change.
    expect(editor.instructionsPrompt).toContain(qualitySection)
    expect(editor.instructionsPrompt).toContain(frontendSection)
  })
})