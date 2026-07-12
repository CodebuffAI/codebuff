import { describe, expect, test } from 'bun:test'

import {
  buildMissingCompanionWarning,
  isNonTrivialSessionPlan,
  validatePlanArtifactPath,
} from '../create-plan'

describe('isNonTrivialSessionPlan', () => {
  test('returns false for paths outside .agents/sessions', () => {
    expect(
      isNonTrivialSessionPlan(
        'docs/PLAN.md',
        '- [ ] one\n- [ ] two\n- [ ] three',
      ),
    ).toBe(false)
  })

  test('returns false for trivial session plans', () => {
    expect(
      isNonTrivialSessionPlan('.agents/sessions/foo/PLAN.md', 'short note'),
    ).toBe(false)
  })

  test('returns true with multiple task markers in a session PLAN.md', () => {
    expect(
      isNonTrivialSessionPlan(
        '.agents/sessions/foo/PLAN.md',
        '- [ ] one\n- [x] two',
      ),
    ).toBe(true)
  })

  test('returns true for long session PLAN.md content', () => {
    expect(
      isNonTrivialSessionPlan('.agents/sessions/foo/PLAN.md', 'a'.repeat(600)),
    ).toBe(true)
  })
})

describe('buildMissingCompanionWarning', () => {
  const planPath = '.agents/sessions/foo/PLAN.md'
  const planContent = '- [ ] one\n- [ ] two\n- [x] three'

  test('returns null for non-session paths', () => {
    expect(
      buildMissingCompanionWarning({
        planPath: 'PLAN.md',
        planContent,
        queuedPaths: [],
      }),
    ).toBeNull()
  })

  test('returns null for trivial plans', () => {
    expect(
      buildMissingCompanionWarning({
        planPath,
        planContent: 'tiny',
        queuedPaths: [],
      }),
    ).toBeNull()
  })

  test('warns about missing STATUS.md and LESSONS.md', () => {
    const warning = buildMissingCompanionWarning({
      planPath,
      planContent,
      queuedPaths: [planPath],
    })
    expect(warning).toBeTruthy()
    expect(warning!).toContain('.agents/sessions/foo/STATUS.md')
    expect(warning!).toContain('.agents/sessions/foo/LESSONS.md')
  })

  test('does not warn when companion paths are also queued', () => {
    expect(
      buildMissingCompanionWarning({
        planPath,
        planContent,
        queuedPaths: [
          planPath,
          '.agents/sessions/foo/STATUS.md',
          '.agents/sessions/foo/LESSONS.md',
        ],
      }),
    ).toBeNull()
  })

  test('warns only about missing companion when one is queued', () => {
    const warning = buildMissingCompanionWarning({
      planPath,
      planContent,
      queuedPaths: [planPath, '.agents/sessions/foo/STATUS.md'],
    })
    expect(warning).toBeTruthy()
    expect(warning!).toContain('.agents/sessions/foo/LESSONS.md')
    expect(warning!).not.toContain('STATUS.md.')
  })

  test('warning encourages updating STATUS.md/LESSONS.md in lockstep', () => {
    const warning = buildMissingCompanionWarning({
      planPath,
      planContent,
      queuedPaths: [planPath],
    })
    expect(warning).toBeTruthy()
    expect(warning!).toContain('STATUS.md/LESSONS.md stay in lockstep')
  })
})

describe('validatePlanArtifactPath', () => {
  test('accepts the four allowed artifact basenames under .agents/sessions/<slug>/', () => {
    for (const name of ['SPEC.md', 'PLAN.md', 'STATUS.md', 'LESSONS.md']) {
      expect(
        validatePlanArtifactPath(`.agents/sessions/foo-bar/${name}`),
      ).toBeNull()
    }
  })

  test('accepts a leading ./ prefix', () => {
    expect(
      validatePlanArtifactPath('./.agents/sessions/foo/PLAN.md'),
    ).toBeNull()
  })

  test('rejects absolute paths', () => {
    const err = validatePlanArtifactPath('/tmp/.agents/sessions/foo/PLAN.md')
    expect(err).toBeTruthy()
    expect(err!).toContain('absolute paths are not allowed')
  })

  test('rejects windows-style absolute paths', () => {
    const err = validatePlanArtifactPath('C:/work/.agents/sessions/foo/PLAN.md')
    expect(err).toBeTruthy()
    expect(err!).toContain('absolute paths are not allowed')
  })

  test('rejects path traversal segments', () => {
    const err = validatePlanArtifactPath('.agents/sessions/../etc/PLAN.md')
    expect(err).toBeTruthy()
    expect(err!).toContain('path traversal')
  })

  test('rejects disallowed artifact names', () => {
    const err = validatePlanArtifactPath('.agents/sessions/foo/NOTES.md')
    expect(err).toBeTruthy()
    expect(err!).toContain('only .agents/sessions/<slug>/')
  })

  test('rejects writes outside .agents/sessions', () => {
    const err = validatePlanArtifactPath('docs/PLAN.md')
    expect(err).toBeTruthy()
    expect(err!).toContain('only .agents/sessions/<slug>/')
  })

  test('rejects empty/whitespace path', () => {
    expect(validatePlanArtifactPath('')).toBeTruthy()
    expect(validatePlanArtifactPath('   ')).toBeTruthy()
  })
})
