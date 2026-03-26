import fs from 'fs'
import os from 'os'
import path from 'path'

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import { appendLogEntry, generateMorningReport } from '../morning-report'

import type { EvalbuffLogEntry } from '../morning-report'

let tmpDir: string
let logPath: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evalbuff-report-test-'))
  logPath = path.join(tmpDir, 'evalbuff-log.jsonl')
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

function makeEntry(overrides: Partial<EvalbuffLogEntry> = {}): EvalbuffLogEntry {
  return {
    taskId: 'task-001',
    timestamp: '2026-03-25T08:00:00.000Z',
    oldScore: 5.0,
    newScore: null,
    docEdit: null,
    scoreComparison: null,
    costUsd: 0.5,
    durationMs: 60_000,
    criteriaLevel: 1,
    ...overrides,
  }
}

describe('generateMorningReport', () => {
  it('generates valid report from JSONL log with all stats', () => {
    const entries: EvalbuffLogEntry[] = [
      makeEntry({
        taskId: 'task-001',
        oldScore: 5.0,
        newScore: 7.5,
        docEdit: { path: 'patterns/api.md', reasoning: 'Agent missed API pattern' },
        scoreComparison: 'improved',
        costUsd: 1.2,
        durationMs: 120_000,
      }),
      makeEntry({
        taskId: 'task-002',
        timestamp: '2026-03-25T09:00:00.000Z',
        oldScore: 8.0,
        costUsd: 0.8,
        durationMs: 90_000,
      }),
    ]

    for (const entry of entries) {
      appendLogEntry(logPath, entry)
    }

    const report = generateMorningReport(logPath)

    expect(report).toContain('# Evalbuff Morning Report')
    expect(report).toContain('Iterations | 2')
    expect(report).toContain('$2.00')
    expect(report).toContain('Docs Attempted | 1')
    expect(report).toContain('Docs Kept (improved score) | 1')
    expect(report).toContain('task-001')
    expect(report).toContain('task-002')
    expect(report).toContain('patterns/api.md')
  })

  it('generates empty report when log file does not exist', () => {
    const report = generateMorningReport(
      path.join(tmpDir, 'nonexistent.jsonl'),
    )
    expect(report).toContain('No iterations were run')
    expect(report).toContain('Iterations | 0')
  })

  it('generates empty report when log file is empty', () => {
    fs.writeFileSync(logPath, '')
    const report = generateMorningReport(logPath)
    expect(report).toContain('No iterations were run')
  })

  it('shows errors table when iterations have errors', () => {
    appendLogEntry(
      logPath,
      makeEntry({
        taskId: 'task-fail',
        error: 'Agent timed out after 300s',
      }),
    )

    const report = generateMorningReport(logPath)
    expect(report).toContain('## Errors')
    expect(report).toContain('task-fail')
    expect(report).toContain('Agent timed out')
  })

  it('shows score trajectory section', () => {
    appendLogEntry(logPath, makeEntry({ taskId: 'task-a', oldScore: 3.0 }))
    appendLogEntry(logPath, makeEntry({ taskId: 'task-b', oldScore: 7.0 }))

    const report = generateMorningReport(logPath)
    expect(report).toContain('## Score Trajectory')
    expect(report).toContain('task-a')
    expect(report).toContain('task-b')
  })

  it('shows doc changes with score impact', () => {
    appendLogEntry(
      logPath,
      makeEntry({
        taskId: 'task-doc',
        oldScore: 4.0,
        newScore: 6.5,
        docEdit: { path: 'conventions/naming.md', reasoning: 'Naming was wrong' },
        scoreComparison: 'improved',
      }),
    )
    appendLogEntry(
      logPath,
      makeEntry({
        taskId: 'task-revert',
        oldScore: 5.0,
        newScore: 4.0,
        docEdit: { path: 'patterns/bad.md', reasoning: 'Did not help' },
        scoreComparison: 'worse',
      }),
    )

    const report = generateMorningReport(logPath)
    expect(report).toContain('## Doc Changes')
    expect(report).toContain('4.0 -> 6.5')
    expect(report).toContain('Yes') // kept
    expect(report).toContain('5.0 -> 4.0')
    expect(report).toContain('No') // reverted
  })
})

describe('appendLogEntry', () => {
  it('appends JSONL entries that can be parsed back', () => {
    const entry1 = makeEntry({ taskId: 'a' })
    const entry2 = makeEntry({ taskId: 'b' })

    appendLogEntry(logPath, entry1)
    appendLogEntry(logPath, entry2)

    const lines = fs
      .readFileSync(logPath, 'utf-8')
      .trim()
      .split('\n')
    expect(lines).toHaveLength(2)
    expect(JSON.parse(lines[0]).taskId).toBe('a')
    expect(JSON.parse(lines[1]).taskId).toBe('b')
  })
})
