import { describe, expect, test } from 'bun:test'

import { PLACEHOLDER } from '@codebuff/agent-runtime/templates/types'

import { createBaseDeep } from '../base2/base-deep'
import { createBase2 } from '../base2/base2'
import { createCodeEditor } from '../editor/editor'
import {
  buildBroadAuditSection,
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
    expect(qualitySection).toContain('package-manager manifests')
    expect(qualitySection).toContain('Cargo `Cargo.toml`')
    expect(qualitySection).toContain('pip `pyproject.toml`/`requirements.txt`')
    expect(qualitySection).toContain('.NET `*.csproj`')
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

  test('buildBroadAuditSection contains broad-audit production-readiness guidance (not byte-frozen)', () => {
    // Broad audit guidance is allowed to evolve; only assert topic coverage.
    const broadAuditSection = buildBroadAuditSection('finalize')
    expect(broadAuditSection).toContain('Broad audit / exploration requests')
    expect(broadAuditSection).toContain(
      'assess this codebase for how production ready it is on a feature, security and code level',
    )
    expect(broadAuditSection).toContain('inspect_codebase_structure')
    expect(broadAuditSection).toContain('UI page wiring')
    expect(broadAuditSection).toContain('auth/error/loading states')
    expect(broadAuditSection).toContain('accessibility')
    expect(broadAuditSection).toContain('responsiveness')
    expect(broadAuditSection).toContain(
      'explicitly mark frontend/UI coverage out-of-scope',
    )
    expect(broadAuditSection).toContain('vertical feature slices')
    expect(broadAuditSection).toContain('language/framework capability packet')
    expect(broadAuditSection).toContain('inspect_feature_completeness')
    expect(broadAuditSection).toContain('evaluate_audit_coverage')
    expect(broadAuditSection).toContain('block a complete audit')
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
    expect(securityReviewSection).toContain(
      '# Security-Sensitive File Patterns',
    )
    expect(securityReviewSection).toContain('security-reviewer')
    expect(securityReviewSection).toContain('advisory')
    expect(securityReviewSection).toContain('pre-edit')
    expect(securityReviewSection).toContain('auth')
    expect(securityReviewSection).toContain('secrets')
    expect(securityReviewSection).toContain('read-only')
  })

  test('all three consumers interpolate shared sections and leave conditional sections gated', () => {
    // Frontend and language guidance are runtime placeholders so unrelated
    // repos do not receive prompt pollution.
    const base2 = createBase2('default')
    const baseDeep = createBaseDeep()
    const editor = createCodeEditor({ model: 'opus' })

    expect(base2.systemPrompt).toContain(qualitySection)
    expect(base2.systemPrompt).toContain(PLACEHOLDER.FRONTEND_SECTION)
    expect(base2.systemPrompt).toContain(PLACEHOLDER.LANGUAGE_PROFILE)
    expect(base2.systemPrompt).not.toContain(frontendSection)
    expect(base2.systemPrompt).toContain(gateAwarenessSection)
    expect(base2.systemPrompt).toContain(gitDisciplineSection)
    expect(base2.systemPrompt).toContain(securityReviewSection)

    expect(baseDeep.systemPrompt).toContain(qualitySection)
    expect(baseDeep.systemPrompt).toContain(PLACEHOLDER.FRONTEND_SECTION)
    expect(baseDeep.systemPrompt).toContain(PLACEHOLDER.LANGUAGE_PROFILE)
    expect(baseDeep.systemPrompt).not.toContain(frontendSection)
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
    expect(editor.instructionsPrompt).toContain(PLACEHOLDER.FRONTEND_SECTION)
    expect(editor.instructionsPrompt).toContain(PLACEHOLDER.LANGUAGE_PROFILE)
    expect(editor.instructionsPrompt).not.toContain(frontendSection)
  })
})
