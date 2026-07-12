import fs from 'fs'
import * as os from 'os'
import * as path from 'path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import {
  ACTIVE_SESSION_POINTER_FILENAME,
  appendPlanEvent,
  EVENTS_FILENAME,
  PLAN_EVENT_KINDS,
  readPlanEvents,
  clearActiveSessionPointer,
  clearPlanState,
  getSessionDirForArtifact,
  getSessionSlugForArtifact,
  isSessionPlanPath,
  isValidPlanSlug,
  normalizePlanPath,
  PLAN_ARTIFACT_NAMES,
  PLAN_SESSION_STATUSES,
  PLAN_TASK_STATUSES,
  readActiveSessionPointer,
  readCurrentTaskAnnotation,
  readPlanState,
  setCurrentTaskAnnotation,
  setCurrentTaskAnnotationLines,
  setProjectRootResolver,
  STATE_FILENAME,
  TASK_MARK_STATUS,
  TASK_STATUS_MARK,
  TRI_STATE_CHECKBOX_LINE_RE,
  UPDATABLE_PLAN_ARTIFACT_NAMES,
  validatePlanArtifactPath,
  validatePlanStatusPath,
  writeActiveSessionPointer,
  writePlanState,
  parsePlanTasks,
  preflightPlan,
} from '../plan-artifacts'

describe('durable plan artifact policy', () => {
  test('preflights stable task IDs, dependencies, and execution contracts', () => {
    const plan = [
      '- [x] P1-T1 Establish schema',
      '  - Acceptance: schema is versioned',
      '  - Validate: bun test schema',
      '- [ ] P1-T2 Add executor',
      '  - Depends on: P1-T1',
      '  - Acceptance: resumes the next task',
      '  - Validate: bun test executor',
    ].join('\n')

    expect(parsePlanTasks(plan)).toHaveLength(2)
    expect(preflightPlan(plan)).toMatchObject({
      ok: true,
      nextTaskId: 'P1-T2',
      errors: [],
      warnings: [],
    })
  })

  test('preflight rejects duplicate and missing dependency IDs', () => {
    const result = preflightPlan(
      ['- [ ] P1-T1 First', '- [ ] P1-T1 Duplicate', '  - Depends on: P0-T9'].join(
        '\n',
      ),
    )
    expect(result.ok).toBe(false)
    expect(result.errors).toContain('Duplicate task ID: P1-T1')
    expect(result.errors).toContain('P1-T1 depends on missing task P0-T9')
  })

  test('defines the required durable plan artifact names in canonical order', () => {
    expect(PLAN_ARTIFACT_NAMES).toEqual([
      'SPEC.md',
      'PLAN.md',
      'STATUS.md',
      'LESSONS.md',
    ])
    // PLAN.md is updatable for P0.18 tri-state toggles and the P0.19
    // current-task pointer annotation. SPEC.md remains create-only.
    expect(UPDATABLE_PLAN_ARTIFACT_NAMES).toEqual([
      'PLAN.md',
      'STATUS.md',
      'LESSONS.md',
    ])
  })

  test('exposes the tri-state task status vocabulary', () => {
    expect(PLAN_TASK_STATUSES).toEqual([
      'pending',
      'in_progress',
      'done',
      'cancelled',
      'blocked',
    ])
    expect(TASK_STATUS_MARK.pending).toBe(' ')
    expect(TASK_STATUS_MARK.in_progress).toBe('~')
    expect(TASK_STATUS_MARK.done).toBe('x')
    expect(TASK_STATUS_MARK.cancelled).toBe('/')
    expect(TASK_STATUS_MARK.blocked).toBe('!')
  })

  test('round-trips checkbox marks through TASK_MARK_STATUS', () => {
    expect(TASK_MARK_STATUS[' ']).toBe('pending')
    expect(TASK_MARK_STATUS['~']).toBe('in_progress')
    expect(TASK_MARK_STATUS.x).toBe('done')
    expect(TASK_MARK_STATUS.X).toBe('done')
    expect(TASK_MARK_STATUS['/']).toBe('cancelled')
    expect(TASK_MARK_STATUS['!']).toBe('blocked')
  })

  test('exposes session status vocabulary in canonical order', () => {
    expect(PLAN_SESSION_STATUSES).toEqual([
      'draft',
      'ready',
      'active',
      'executing',
      'validating',
      'reviewing',
      'blocked',
      'paused',
      'completed',
      'archived',
    ])
  })

  test('normalizes backslashes without collapsing traversal segments', () => {
    expect(normalizePlanPath('.agents\\sessions\\demo\\PLAN.md')).toBe(
      '.agents/sessions/demo/PLAN.md',
    )
    expect(normalizePlanPath('.agents/sessions/../demo/PLAN.md')).toBe(
      '.agents/sessions/../demo/PLAN.md',
    )
  })

  test('validatePlanArtifactPath accepts all durable artifact names', () => {
    for (const name of PLAN_ARTIFACT_NAMES) {
      expect(
        validatePlanArtifactPath(`.agents/sessions/demo/${name}`),
      ).toBeNull()
      expect(
        validatePlanArtifactPath(`./.agents/sessions/demo/${name}`),
      ).toBeNull()
    }
  })

  test('validatePlanArtifactPath rejects absolute, traversal, and unknown artifact paths', () => {
    expect(
      validatePlanArtifactPath('/tmp/.agents/sessions/demo/PLAN.md'),
    ).toMatch(/absolute paths/)
    expect(
      validatePlanArtifactPath('C:/work/.agents/sessions/demo/PLAN.md'),
    ).toMatch(/absolute paths/)
    expect(
      validatePlanArtifactPath('.agents/sessions/../demo/PLAN.md'),
    ).toMatch(/path traversal/)
    expect(validatePlanArtifactPath('.agents/sessions/demo/NOTES.md')).toMatch(
      /only \.agents\/sessions\/<slug>\//,
    )
    expect(validatePlanArtifactPath('')).toMatch(/non-empty/)
  })

  test('validatePlanStatusPath accepts PLAN.md, STATUS.md, and LESSONS.md', () => {
    expect(validatePlanStatusPath('.agents/sessions/demo/PLAN.md')).toBeNull()
    expect(validatePlanStatusPath('.agents/sessions/demo/STATUS.md')).toBeNull()
    expect(
      validatePlanStatusPath('.agents/sessions/demo/LESSONS.md'),
    ).toBeNull()
    expect(
      validatePlanStatusPath('./.agents/sessions/demo/STATUS.md'),
    ).toBeNull()
    // SPEC.md is still create-only.
    expect(validatePlanStatusPath('.agents/sessions/demo/SPEC.md')).toMatch(
      /only \.agents\/sessions\/<slug>\//,
    )
  })

  test('recognizes session PLAN.md paths and extracts artifact session directories', () => {
    expect(isSessionPlanPath('.agents/sessions/demo/PLAN.md')).toBe(true)
    expect(isSessionPlanPath('./.agents/sessions/demo/PLAN.md')).toBe(true)
    expect(isSessionPlanPath('.agents/sessions/demo/STATUS.md')).toBe(false)

    expect(getSessionDirForArtifact('.agents/sessions/demo/PLAN.md')).toBe(
      '.agents/sessions/demo',
    )
    expect(getSessionDirForArtifact('./.agents/sessions/demo/LESSONS.md')).toBe(
      '.agents/sessions/demo',
    )
    expect(getSessionDirForArtifact('docs/PLAN.md')).toBeNull()

    expect(getSessionSlugForArtifact('.agents/sessions/demo/PLAN.md')).toBe(
      'demo',
    )
    expect(getSessionSlugForArtifact('docs/PLAN.md')).toBeNull()
  })

  test('isValidPlanSlug accepts allowed slug characters and rejects others', () => {
    expect(isValidPlanSlug('demo')).toBe(true)
    expect(isValidPlanSlug('foo-bar_2024.v1')).toBe(true)
    expect(isValidPlanSlug('')).toBe(false)
    expect(isValidPlanSlug('with space')).toBe(false)
    expect(isValidPlanSlug('with/slash')).toBe(false)
    expect(isValidPlanSlug('..')).toBe(false)
  })

  test('TRI_STATE_CHECKBOX_LINE_RE matches all supported checkbox marks', () => {
    const samples: Array<[string, string]> = [
      ['- [ ] P0-1', ' '],
      ['- [x] P0-2', 'x'],
      ['- [X] P0-3', 'X'],
      ['- [~] P0-4', '~'],
      ['- [/] P0-5', '/'],
      ['- [!] P0-6', '!'],
      ['  - [x] indented', 'x'],
    ]
    for (const [line, expectedMark] of samples) {
      const match = line.match(TRI_STATE_CHECKBOX_LINE_RE)
      expect(match).not.toBeNull()
      expect(match![2]).toBe(expectedMark)
    }
  })

  test('TRI_STATE_CHECKBOX_LINE_RE rejects non-checklist lines', () => {
    expect('paragraph text'.match(TRI_STATE_CHECKBOX_LINE_RE)).toBeNull()
    expect('---'.match(TRI_STATE_CHECKBOX_LINE_RE)).toBeNull()
    expect('- plain bullet'.match(TRI_STATE_CHECKBOX_LINE_RE)).toBeNull()
  })
})

describe('current-task annotation', () => {
  test('reads an existing pointer annotation', () => {
    const body =
      '# Plan\n\n<!-- current-task: P0-12 follow-up -->\n\n- [ ] work\n'
    expect(readCurrentTaskAnnotation(body)).toBe('P0-12 follow-up')
  })

  test('returns null for "none" and empty annotations', () => {
    expect(
      readCurrentTaskAnnotation('# Plan\n<!-- current-task: none -->\n'),
    ).toBeNull()
    expect(
      readCurrentTaskAnnotation('# Plan\n<!-- current-task: -->\n'),
    ).toBeNull()
  })

  test('returns null when no annotation is present', () => {
    expect(readCurrentTaskAnnotation('# Plan\n- [ ] work\n')).toBeNull()
  })

  test('setCurrentTaskAnnotation inserts after the first H1 when missing', () => {
    const body = '# Plan\n\n- [ ] work\n'
    const next = setCurrentTaskAnnotation(body, 'P0-7')
    expect(next).toContain('# Plan')
    expect(next.indexOf('<!-- current-task: P0-7 -->')).toBeGreaterThan(
      next.indexOf('# Plan'),
    )
  })

  test('setCurrentTaskAnnotation rewrites an existing annotation', () => {
    const body = '# Plan\n<!-- current-task: P0-7 -->\n- [ ] work\n'
    const next = setCurrentTaskAnnotation(body, 'P0-8')
    expect(next).toContain('<!-- current-task: P0-8 -->')
    expect(next).not.toContain('<!-- current-task: P0-7 -->')
  })

  test('setCurrentTaskAnnotation with null writes "none"', () => {
    const body = '# Plan\n<!-- current-task: P0-7 -->\n'
    const next = setCurrentTaskAnnotation(body, null)
    expect(next).toContain('<!-- current-task: none -->')
  })

  test('setCurrentTaskAnnotationLines inserts after the first H1 when missing', () => {
    const lines = ['# Plan', '', '- [ ] work', '']
    const next = setCurrentTaskAnnotationLines(lines, 'P0-7')
    const annotationIdx = next.findIndex((line) =>
      line.startsWith('<!-- current-task:'),
    )
    expect(annotationIdx).toBeGreaterThan(0)
    expect(next[annotationIdx]).toBe('<!-- current-task: P0-7 -->')
    // Original H1 must be preserved at index 0.
    expect(next[0]).toBe('# Plan')
  })

  test('setCurrentTaskAnnotationLines rewrites an existing annotation in place', () => {
    const lines = ['# Plan', '<!-- current-task: P0-7 -->', '- [ ] work', '']
    const next = setCurrentTaskAnnotationLines(lines, 'P0-8')
    expect(next[1]).toBe('<!-- current-task: P0-8 -->')
    // Surrounding content must be preserved.
    expect(next[0]).toBe('# Plan')
    expect(next[2]).toBe('- [ ] work')
  })

  test('setCurrentTaskAnnotationLines with null writes "none"', () => {
    const lines = ['# Plan', '<!-- current-task: P0-7 -->', '- [ ] work']
    const next = setCurrentTaskAnnotationLines(lines, null)
    expect(next[1]).toBe('<!-- current-task: none -->')
  })

  test('setCurrentTaskAnnotationLines inserts at top when no H1 is present', () => {
    const lines = ['- [ ] work']
    const next = setCurrentTaskAnnotationLines(lines, 'P0-7')
    expect(next[0]).toBe('<!-- current-task: P0-7 -->')
    expect(next[1]).toBe('- [ ] work')
  })

  test('setCurrentTaskAnnotation and setCurrentTaskAnnotationLines agree on rewrite output', () => {
    const body = '# Plan\n<!-- current-task: P0-7 -->\n- [ ] work\n'
    const lines = body.split('\n')
    expect(setCurrentTaskAnnotation(body, 'P0-8')).toBe(
      setCurrentTaskAnnotationLines(lines, 'P0-8').join('\n'),
    )
  })
})

describe('STATE.json session state', () => {
  let tempDir: string
  let originalResolver: () => string

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-state-'))
    originalResolver = () => tempDir
    setProjectRootResolver(originalResolver)
  })

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  test('readPlanState returns null when no STATE.json exists', () => {
    expect(readPlanState('demo')).toBeNull()
  })

  test('writePlanState creates STATE.json with sensible defaults', () => {
    const state = writePlanState('demo', { currentTask: 'P0-7' })
    expect(state).not.toBeNull()
    expect(state!.schemaVersion).toBe(2)
    expect(state!.revision).toBe(1)
    expect(state!.slug).toBe('demo')
    expect(state!.status).toBe('active')
    expect(state!.currentTask).toBe('P0-7')
    expect(state!.createdAt).toMatch(/T.*Z$/)

    const onDisk = JSON.parse(
      fs.readFileSync(
        path.join(tempDir, '.agents', 'sessions', 'demo', STATE_FILENAME),
        'utf8',
      ),
    )
    expect(onDisk.slug).toBe('demo')
    expect(onDisk.currentTask).toBe('P0-7')
  })

  test('writePlanState preserves createdAt across patches', async () => {
    const first = writePlanState('demo', { status: 'active' })
    expect(first).not.toBeNull()
    const originalCreatedAt = first!.createdAt
    // Small delay to ensure updatedAt advances.
    await new Promise((resolve) => setTimeout(resolve, 5))
    const second = writePlanState('demo', { status: 'paused' })
    expect(second).not.toBeNull()
    expect(second!.createdAt).toBe(originalCreatedAt)
    expect(second!.status).toBe('paused')
    expect(second!.updatedAt >= first!.updatedAt).toBe(true)
  })

  test('writePlanState normalizes an invalid status to "active"', () => {
    const stateDir = path.join(tempDir, '.agents', 'sessions', 'demo')
    fs.mkdirSync(stateDir, { recursive: true })
    fs.writeFileSync(
      path.join(stateDir, STATE_FILENAME),
      JSON.stringify({
        schemaVersion: 1,
        slug: 'demo',
        status: 'bogus',
        currentTask: null,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      }),
      'utf8',
    )
    const state = readPlanState('demo')
    expect(state).not.toBeNull()
    expect(state!.status).toBe('active')
    expect(state!.createdAt).toBe('2024-01-01T00:00:00.000Z')
  })

  test('clearPlanState removes the file and returns true', () => {
    writePlanState('demo', { status: 'paused' })
    expect(clearPlanState('demo')).toBe(true)
    expect(readPlanState('demo')).toBeNull()
  })

  test('clearPlanState returns false when no STATE.json exists', () => {
    expect(clearPlanState('demo')).toBe(false)
  })

  test('writePlanState rejects invalid slugs', () => {
    expect(writePlanState('with space', { status: 'active' })).toBeNull()
    expect(writePlanState('..', { status: 'active' })).toBeNull()
  })
})

describe('active session pointer', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-pointer-'))
    setProjectRootResolver(() => tempDir)
  })

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  test('readActiveSessionPointer returns null when the file is missing', () => {
    expect(readActiveSessionPointer()).toBeNull()
  })

  test('writeActiveSessionPointer persists the slug', () => {
    expect(writeActiveSessionPointer('demo')).toBe(true)
    expect(readActiveSessionPointer()).toBe('demo')
    const onDisk = fs.readFileSync(
      path.join(tempDir, '.agents', ACTIVE_SESSION_POINTER_FILENAME),
      'utf8',
    )
    expect(onDisk).toBe('demo\n')
  })

  test('readActiveSessionPointer rejects slugs containing newlines', () => {
    fs.mkdirSync(path.join(tempDir, '.agents'), { recursive: true })
    fs.writeFileSync(
      path.join(tempDir, '.agents', ACTIVE_SESSION_POINTER_FILENAME),
      'foo\nbar',
      'utf8',
    )
    expect(readActiveSessionPointer()).toBeNull()
  })

  test('readActiveSessionPointer rejects invalid slugs', () => {
    fs.mkdirSync(path.join(tempDir, '.agents'), { recursive: true })
    fs.writeFileSync(
      path.join(tempDir, '.agents', ACTIVE_SESSION_POINTER_FILENAME),
      'has spaces',
      'utf8',
    )
    expect(readActiveSessionPointer()).toBeNull()
  })

  test('writeActiveSessionPointer rejects invalid slugs', () => {
    expect(writeActiveSessionPointer('has space')).toBe(false)
  })

  test('clearActiveSessionPointer removes the file', () => {
    writeActiveSessionPointer('demo')
    expect(clearActiveSessionPointer()).toBe(true)
    expect(readActiveSessionPointer()).toBeNull()
  })

  test('clearActiveSessionPointer returns false when nothing to clear', () => {
    expect(clearActiveSessionPointer()).toBe(false)
  })
})

describe('appendPlanEvent / readPlanEvents', () => {
  test('appendPlanEvent appends a JSON line and readPlanEvents returns entries in order', () => {
    writeActiveSessionPointer('demo')
    const first = appendPlanEvent('demo', {
      kind: 'task_update',
      summary: 'Completed P0.13a',
      payload: { task: 'P0.13a', status: 'completed' },
    })
    const second = appendPlanEvent('demo', {
      kind: 'append_lesson',
      summary: 'Keep EVENTS.jsonl append-only',
    })
    expect(first).not.toBeNull()
    expect(second).not.toBeNull()
    const events = readPlanEvents('demo')
    expect(events).toHaveLength(2)
    expect(events[0]).toMatchObject({
      kind: 'task_update',
      summary: 'Completed P0.13a',
    })
    expect(events[1]).toMatchObject({
      kind: 'append_lesson',
      summary: 'Keep EVENTS.jsonl append-only',
    })
    expect(typeof events[0].ts).toBe('string')
    expect(new Date(events[0].ts).getTime()).not.toBeNaN()
  })

  test('appendPlanEvent creates the session directory and EVENTS file if missing', () => {
    const result = appendPlanEvent('fresh-session', {
      kind: 'session_status',
      summary: 'Started Milestone 4',
    })
    expect(result).not.toBeNull()
    const events = readPlanEvents('fresh-session')
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      kind: 'session_status',
      summary: 'Started Milestone 4',
    })
  })

  test('readPlanEvents returns an empty array when no EVENTS file exists', () => {
    expect(readPlanEvents('no-such-session')).toEqual([])
  })

  test('appendPlanEvent returns null for a slug containing path separators', () => {
    const result = appendPlanEvent('foo/bar', {
      kind: 'task_update',
      summary: 'should not be written',
    })
    expect(result).toBeNull()
    expect(readPlanEvents('foo/bar')).toEqual([])
  })
})
