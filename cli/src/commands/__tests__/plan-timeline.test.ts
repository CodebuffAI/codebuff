import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import fs from 'fs'
import os from 'os'
import path from 'path'

import { setProjectRoot } from '../../project-files'
import { appendPlanEvent } from '@codebuff/common/util/plan-artifacts'

import {
  formatPlanTimelineReport,
  parsePlanTimelineArgs,
  readPlanTimeline,
  resolvePlanTimelinePath,
} from '../plan-timeline'

describe('plan-timeline command', () => {
  let tempDir: string
  let prevCwd: string

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-timeline-'))
    prevCwd = process.cwd()
    process.chdir(tempDir)
    setProjectRoot(tempDir)
  })

  afterEach(() => {
    process.chdir(prevCwd)
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  describe('formatPlanTimelineReport', () => {
    test('renders a header and one line per event, and a hint when empty', () => {
      const events = [
        {
          ts: '2026-06-23T00:00:00.000Z',
          kind: 'task_update' as const,
          summary: 'Completed P0.13a',
        },
        {
          ts: '2026-06-23T00:01:00.000Z',
          kind: 'append_lesson' as const,
          summary: 'Keep EVENTS.jsonl append-only',
        },
      ]
      const report = formatPlanTimelineReport('demo', events)
      expect(report).toContain('Timeline for demo (2 events):')
      expect(report).toContain('Completed P0.13a')
      expect(report).toContain('Keep EVENTS.jsonl append-only')

      const empty = formatPlanTimelineReport('demo', [])
      expect(empty).toContain('No events recorded for session "demo"')
      expect(empty).toContain('EVENTS.jsonl is created automatically')
    })
  })

  describe('parsePlanTimelineArgs + readPlanTimeline + resolvePlanTimelinePath', () => {
    test('parses a bare slug, reads events back, and resolves the on-disk path', () => {
      appendPlanEvent('demo-session', {
        kind: 'task_update',
        summary: 'Completed P0.13a',
      })

      const parsed = parsePlanTimelineArgs('demo-session')
      expect(parsed).toEqual({ slug: 'demo-session', kind: undefined })

      const resolved = resolvePlanTimelinePath('demo-session')
      expect(resolved).not.toBeNull()
      expect(resolved).toBe(
        path.join(tempDir, '.agents', 'sessions', 'demo-session', 'EVENTS.jsonl'),
      )

      const events = readPlanTimeline('demo-session')
      expect(events).toHaveLength(1)
      expect(events[0]).toMatchObject({
        kind: 'task_update',
        summary: 'Completed P0.13a',
      })
    })

    test('parses --kind flag and filters events when reading the timeline', () => {
      appendPlanEvent('kind-filter-session', {
        kind: 'task_update',
        summary: 'Completed P0.13a',
      })
      appendPlanEvent('kind-filter-session', {
        kind: 'append_lesson',
        summary: 'Keep EVENTS.jsonl append-only',
      })
      appendPlanEvent('kind-filter-session', {
        kind: 'task_update',
        summary: 'Completed P0.13b',
      })

      const parsed = parsePlanTimelineArgs('kind-filter-session --kind task_update')
      expect(parsed).toEqual({ slug: 'kind-filter-session', kind: 'task_update' })

      const all = readPlanTimeline('kind-filter-session')
      expect(all).toHaveLength(3)

      const filtered = readPlanTimeline('kind-filter-session', 'task_update')
      expect(filtered).toHaveLength(2)
      expect(filtered.every((e) => e.kind === 'task_update')).toBe(true)

      const lessons = readPlanTimeline('kind-filter-session', 'append_lesson')
      expect(lessons).toHaveLength(1)
      expect(lessons[0].summary).toBe('Keep EVENTS.jsonl append-only')
    })

    test('normalizes a leading .agents/sessions/ prefix and strips a trailing .md', () => {
      const parsed = parsePlanTimelineArgs('.agents/sessions/prefix-session.md')
      expect(parsed).toEqual({ slug: 'prefix-session', kind: undefined })

      appendPlanEvent('prefix-session', {
        kind: 'task_update',
        summary: 'Normalized prefix path',
      })

      const resolved = resolvePlanTimelinePath('prefix-session')
      expect(resolved).toBe(
        path.join(tempDir, '.agents', 'sessions', 'prefix-session', 'EVENTS.jsonl'),
      )

      const events = readPlanTimeline('prefix-session')
      expect(events).toHaveLength(1)
      expect(events[0].summary).toBe('Normalized prefix path')
    })
  })
})
