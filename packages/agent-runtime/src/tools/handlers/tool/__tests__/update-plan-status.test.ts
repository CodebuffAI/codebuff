import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import {
  applyTaskUpdate,
  handleUpdatePlanStatus,
  validatePlanStatusPath,
} from '../update-plan-status'

import type { CodebuffToolCall } from '@codebuff/common/tools/list'
import type { Logger } from '@codebuff/common/types/contracts/logger'

const silentLogger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
}

function makeCall(
  input: CodebuffToolCall<'update_plan_status'>['input'],
): CodebuffToolCall<'update_plan_status'> {
  return {
    toolName: 'update_plan_status',
    toolCallId: 'test-call',
    input,
  } as unknown as CodebuffToolCall<'update_plan_status'>
}

describe('validatePlanStatusPath', () => {
  test('accepts STATUS.md and LESSONS.md under .agents/sessions/<slug>/', () => {
    expect(validatePlanStatusPath('.agents/sessions/foo/STATUS.md')).toBeNull()
    expect(validatePlanStatusPath('.agents/sessions/foo/LESSONS.md')).toBeNull()
    expect(
      validatePlanStatusPath('./.agents/sessions/foo-bar/STATUS.md'),
    ).toBeNull()
  })

  test('rejects absolute paths', () => {
    expect(validatePlanStatusPath('/tmp/STATUS.md')).toMatch(/absolute/)
  })

  test('rejects path traversal', () => {
    expect(validatePlanStatusPath('.agents/sessions/../STATUS.md')).toMatch(
      /traversal/,
    )
  })

  test('rejects SPEC.md and other non-updatable names', () => {
    // SPEC.md is create-only — not allowed by update_plan_status.
    expect(validatePlanStatusPath('.agents/sessions/foo/SPEC.md')).toMatch(
      /only \.agents/,
    )
    expect(validatePlanStatusPath('.agents/sessions/foo/NOTES.md')).toMatch(
      /only \.agents/,
    )
  })

  test('rejects empty string', () => {
    expect(validatePlanStatusPath('')).toMatch(/non-empty/)
  })
})

describe('applyTaskUpdate', () => {
  test('toggles checkbox and preserves indentation/prose', () => {
    const lines = [
      'Intro paragraph the user wrote.',
      '',
      '  - [ ] P0-11 update_plan_status tool — pending review',
      '  - [ ] P0-12 follow-up',
    ]
    const result = applyTaskUpdate(lines, {
      task: 'P0-11 update_plan_status',
      completed: true,
    })
    expect(result.matched).toBe(true)
    expect(result.lines[2]).toBe(
      '  - [x] P0-11 update_plan_status tool — pending review',
    )
    expect(result.lines[0]).toBe('Intro paragraph the user wrote.')
    expect(result.lines[3]).toBe('  - [ ] P0-12 follow-up')
  })

  test('appends a note in parentheses without duplicating a tail note', () => {
    const lines = ['- [ ] Task A']
    const first = applyTaskUpdate(lines, {
      task: 'Task A',
      note: 'shipped',
    })
    expect(first.lines[0]).toBe('- [ ] Task A (shipped)')
    const second = applyTaskUpdate(first.lines, {
      task: 'Task A',
      note: 'shipped',
    })
    // Idempotent — does not append the same tail note twice.
    expect(second.lines[0]).toBe('- [ ] Task A (shipped)')
  })

  test('appends a note when similar text appears only inside existing prose', () => {
    const result = applyTaskUpdate(['- [ ] Task A (shipped to staging)'], {
      task: 'Task A',
      note: 'shipped',
    })
    expect(result.lines[0]).toBe('- [ ] Task A (shipped to staging) (shipped)')
  })

  test('returns matched=false when nothing matches', () => {
    const lines = ['- [ ] Task A']
    const result = applyTaskUpdate(lines, { task: 'unknown' })
    expect(result.matched).toBe(false)
    expect(result.lines).toEqual(lines)
  })

  test('applies tri-state status: in_progress', () => {
    const lines = ['- [ ] Task A']
    const result = applyTaskUpdate(lines, {
      task: 'Task A',
      status: 'in_progress',
    })
    expect(result.matched).toBe(true)
    expect(result.lines[0]).toBe('- [~] Task A')
  })

  test('applies tri-state status: blocked and cancelled', () => {
    const blocked = applyTaskUpdate(['- [ ] Task A'], {
      task: 'Task A',
      status: 'blocked',
    })
    expect(blocked.lines[0]).toBe('- [!] Task A')
    const cancelled = applyTaskUpdate(['- [ ] Task A'], {
      task: 'Task A',
      status: 'cancelled',
    })
    expect(cancelled.lines[0]).toBe('- [/] Task A')
  })

  test('status overrides completed when both are provided', () => {
    const lines = ['- [x] Task A']
    const result = applyTaskUpdate(lines, {
      task: 'Task A',
      status: 'in_progress',
      completed: true,
    })
    expect(result.lines[0]).toBe('- [~] Task A')
  })

  test('reverts a completed task back to pending via tri-state', () => {
    const lines = ['- [x] Task A']
    const result = applyTaskUpdate(lines, {
      task: 'Task A',
      status: 'pending',
    })
    expect(result.lines[0]).toBe('- [ ] Task A')
  })
})

describe('handleUpdatePlanStatus', () => {
  let prevCwd: string
  let tempDir: string

  beforeEach(() => {
    prevCwd = process.cwd()
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'update-plan-status-'))
    process.chdir(tempDir)
    fs.mkdirSync(path.join(tempDir, '.agents', 'sessions', 'demo'), {
      recursive: true,
    })
  })

  afterEach(() => {
    process.chdir(prevCwd)
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  test('rejects disallowed paths without touching disk', async () => {
    const result = await handleUpdatePlanStatus({
      previousToolCallFinished: Promise.resolve(),
      toolCall: makeCall({
        path: '/etc/passwd',
        append: { heading: 'oops', body: 'oops' },
      }),
      logger: silentLogger,
    })
    const value = result.output[0].value as { errorMessage?: string }
    expect(value.errorMessage).toMatch(/absolute paths/)
  })

  test('rejects when artifact does not yet exist', async () => {
    const result = await handleUpdatePlanStatus({
      previousToolCallFinished: Promise.resolve(),
      toolCall: makeCall({
        path: '.agents/sessions/demo/STATUS.md',
        append: { heading: 'h', body: 'b' },
      }),
      logger: silentLogger,
    })
    const value = result.output[0].value as { errorMessage?: string }
    expect(value.errorMessage).toMatch(/does not exist/)
  })

  test('rejects symlinked artifacts that resolve outside the project root', async () => {
    const outsideDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'update-plan-status-outside-'),
    )
    try {
      const outsideFile = path.join(outsideDir, 'STATUS.md')
      fs.writeFileSync(outsideFile, '- [ ] Task A\n')
      fs.symlinkSync(
        outsideFile,
        path.join(tempDir, '.agents/sessions/demo/STATUS.md'),
      )

      const result = await handleUpdatePlanStatus({
        previousToolCallFinished: Promise.resolve(),
        toolCall: makeCall({
          path: '.agents/sessions/demo/STATUS.md',
          updates: [{ task: 'Task A', completed: true }],
        }),
        logger: silentLogger,
      })

      const value = result.output[0].value as { errorMessage?: string }
      expect(value.errorMessage).toMatch(/resolves outside the project root/)
      expect(fs.readFileSync(outsideFile, 'utf8')).toBe('- [ ] Task A\n')
    } finally {
      fs.rmSync(outsideDir, { recursive: true, force: true })
    }
  })

  test('updates an inside-root symlink target without replacing the symlink', async () => {
    const target = path.join(tempDir, 'linked-STATUS.md')
    const symlinkPath = path.join(tempDir, '.agents/sessions/demo/STATUS.md')
    fs.writeFileSync(target, '- [ ] Task A\n')
    fs.symlinkSync(target, symlinkPath)

    const result = await handleUpdatePlanStatus({
      previousToolCallFinished: Promise.resolve(),
      toolCall: makeCall({
        path: '.agents/sessions/demo/STATUS.md',
        updates: [{ task: 'Task A', completed: true }],
      }),
      logger: silentLogger,
    })

    const value = result.output[0].value as { message?: string }
    expect(value.message).toMatch(/Updated 1 task line/)
    expect(fs.lstatSync(symlinkPath).isSymbolicLink()).toBe(true)
    expect(fs.readFileSync(target, 'utf8')).toBe('- [x] Task A\n')
  })

  test('updates a matching checklist line in place', async () => {
    const target = path.join(tempDir, '.agents/sessions/demo/STATUS.md')
    fs.writeFileSync(
      target,
      [
        '# Status',
        '',
        '_Author prose that must be preserved._',
        '',
        '- [ ] P0-11 update_plan_status tool',
        '- [ ] P0-12 follow-up work',
        '',
      ].join('\n'),
    )

    const result = await handleUpdatePlanStatus({
      previousToolCallFinished: Promise.resolve(),
      toolCall: makeCall({
        path: '.agents/sessions/demo/STATUS.md',
        updates: [
          {
            task: 'P0-11 update_plan_status',
            completed: true,
            note: 'shipped',
          },
        ],
      }),
      logger: silentLogger,
    })

    const value = result.output[0].value as { message?: string }
    expect(value.message).toMatch(/Updated 1 task line/)

    const next = fs.readFileSync(target, 'utf8')
    expect(next).toContain('_Author prose that must be preserved._')
    expect(next).toContain('- [x] P0-11 update_plan_status tool (shipped)')
    expect(next).toContain('- [ ] P0-12 follow-up work')
  })

  test('appends a delimited entry when requested', async () => {
    const target = path.join(tempDir, '.agents/sessions/demo/LESSONS.md')
    fs.writeFileSync(target, '# Lessons\n\nExisting note.\n')

    const result = await handleUpdatePlanStatus({
      previousToolCallFinished: Promise.resolve(),
      toolCall: makeCall({
        path: '.agents/sessions/demo/LESSONS.md',
        append: { heading: 'Resume notes', body: 'Next: CLI block.' },
      }),
      logger: silentLogger,
    })

    const value = result.output[0].value as { message?: string }
    expect(value.message).toMatch(/Appended entry "Resume notes"/)

    const next = fs.readFileSync(target, 'utf8')
    expect(next).toContain('Existing note.')
    expect(next).toContain('<!-- update_plan_status:appended -->')
    expect(next).toMatch(/## Resume notes — \d{4}-\d{2}-\d{2}T/)
    expect(next).toContain('Next: CLI block.')
  })

  test('reports no changes when nothing matches and no append given', async () => {
    const target = path.join(tempDir, '.agents/sessions/demo/STATUS.md')
    fs.writeFileSync(target, '- [ ] Task A\n')

    const result = await handleUpdatePlanStatus({
      previousToolCallFinished: Promise.resolve(),
      toolCall: makeCall({
        path: '.agents/sessions/demo/STATUS.md',
        updates: [{ task: 'nonexistent', completed: true }],
      }),
      logger: silentLogger,
    })

    const value = result.output[0].value as { message?: string }
    expect(value.message).toMatch(/No changes applied/)
    expect(fs.readFileSync(target, 'utf8')).toBe('- [ ] Task A\n')
  })

  test('sessionStatus creates STATE.json with the new status', async () => {
    const target = path.join(tempDir, '.agents/sessions/demo/STATUS.md')
    fs.writeFileSync(target, '# Status\n\n- [ ] Task A\n')

    const result = await handleUpdatePlanStatus({
      previousToolCallFinished: Promise.resolve(),
      toolCall: makeCall({
        path: '.agents/sessions/demo/STATUS.md',
        sessionStatus: 'paused',
      }),
      logger: silentLogger,
    })

    const value = result.output[0].value as { message?: string }
    expect(value.message).toMatch(/Session status -> paused/)

    const statePath = path.join(
      tempDir,
      '.agents',
      'sessions',
      'demo',
      'STATE.json',
    )
    expect(fs.existsSync(statePath)).toBe(true)
    const state = JSON.parse(fs.readFileSync(statePath, 'utf8'))
    expect(state.slug).toBe('demo')
    expect(state.status).toBe('paused')
    expect(state.schemaVersion).toBe(1)
  })

  test('currentTask updates the PLAN.md annotation', async () => {
    const planPath = path.join(tempDir, '.agents/sessions/demo/PLAN.md')
    fs.writeFileSync(planPath, '# Plan\n\n- [ ] P0-7 work\n- [ ] P0-8 other\n')

    const result = await handleUpdatePlanStatus({
      previousToolCallFinished: Promise.resolve(),
      toolCall: makeCall({
        path: '.agents/sessions/demo/PLAN.md',
        currentTask: 'P0-8 other',
      }),
      logger: silentLogger,
    })

    const value = result.output[0].value as { message?: string }
    expect(value.message).toMatch(/Current task -> "P0-8 other"/)

    const next = fs.readFileSync(planPath, 'utf8')
    expect(next).toContain('<!-- current-task: P0-8 other -->')
    // P0-7 must be preserved.
    expect(next).toContain('- [ ] P0-7 work')
  })

  test('currentTask with empty string clears the pointer', async () => {
    const planPath = path.join(tempDir, '.agents/sessions/demo/PLAN.md')
    fs.writeFileSync(
      planPath,
      '# Plan\n<!-- current-task: P0-7 -->\n- [ ] P0-7 work\n',
    )

    const result = await handleUpdatePlanStatus({
      previousToolCallFinished: Promise.resolve(),
      toolCall: makeCall({
        path: '.agents/sessions/demo/PLAN.md',
        currentTask: '',
      }),
      logger: silentLogger,
    })

    const value = result.output[0].value as { message?: string }
    expect(value.message).toMatch(/Current task pointer cleared/)

    const next = fs.readFileSync(planPath, 'utf8')
    expect(next).toContain('<!-- current-task: none -->')
    expect(next).not.toContain('<!-- current-task: P0-7 -->')
  })

  test('tri-state in_progress status auto-sets currentTask in PLAN.md', async () => {
    const planPath = path.join(tempDir, '.agents/sessions/demo/PLAN.md')
    fs.writeFileSync(planPath, '# Plan\n- [ ] P0-7 work\n- [ ] P0-8 other\n')

    const result = await handleUpdatePlanStatus({
      previousToolCallFinished: Promise.resolve(),
      toolCall: makeCall({
        path: '.agents/sessions/demo/PLAN.md',
        updates: [{ task: 'P0-7 work', status: 'in_progress' }],
      }),
      logger: silentLogger,
    })

    const value = result.output[0].value as { message?: string }
    expect(value.message).toMatch(/Current task -> "P0-7 work"/)

    const next = fs.readFileSync(planPath, 'utf8')
    expect(next).toContain('- [~] P0-7 work')
    expect(next).toContain('<!-- current-task: P0-7 work -->')
  })

  test('sessionStatus and currentTask together write both to STATE.json', async () => {
    const planPath = path.join(tempDir, '.agents/sessions/demo/PLAN.md')
    fs.writeFileSync(planPath, '# Plan\n- [ ] P0-7 work\n')

    const result = await handleUpdatePlanStatus({
      previousToolCallFinished: Promise.resolve(),
      toolCall: makeCall({
        path: '.agents/sessions/demo/PLAN.md',
        sessionStatus: 'active',
        currentTask: 'P0-7 work',
      }),
      logger: silentLogger,
    })

    const value = result.output[0].value as { message?: string }
    expect(value.message).toMatch(/Session status -> active/)
    expect(value.message).toMatch(/Current task -> "P0-7 work"/)

    const statePath = path.join(
      tempDir,
      '.agents',
      'sessions',
      'demo',
      'STATE.json',
    )
    const state = JSON.parse(fs.readFileSync(statePath, 'utf8'))
    expect(state.status).toBe('active')
    expect(state.currentTask).toBe('P0-7 work')
  })

  test('rejects unknown sessionStatus values', async () => {
    const target = path.join(tempDir, '.agents/sessions/demo/STATUS.md')
    fs.writeFileSync(target, '# Status\n')

    const result = await handleUpdatePlanStatus({
      previousToolCallFinished: Promise.resolve(),
      toolCall: makeCall({
        path: '.agents/sessions/demo/STATUS.md',
        // Bypass the zod schema by casting — the handler must still defend.
        sessionStatus: 'bogus' as 'active',
      }),
      logger: silentLogger,
    })

    const value = result.output[0].value as { errorMessage?: string }
    expect(value.errorMessage).toMatch(/unknown sessionStatus/)
  })
})
