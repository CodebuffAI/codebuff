import { afterEach, describe, expect, mock, spyOn, test } from 'bun:test'

import {
  createProjectUnderstandingClient,
  understandProject,
} from '../project-understanding'

import type { ProjectUnderstandingApi } from '../project-understanding'
import type { ProjectUnderstandingTemplate } from '@codebuff/common/project-understanding/template'
import type { Logger } from '@codebuff/common/types/contracts/logger'

const TEMPLATE: ProjectUnderstandingTemplate = {
  version: 3,
  sections: [
    {
      key: 'stack',
      title: 'Stack',
      fields: [{ key: 'frameworks', kind: 'names', label: 'Frameworks' }],
    },
  ],
}

const silent: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
}

afterEach(() => mock.restore())

/** understandProject over the real client, with `fetch` answering the due
 *  check as given. Records whether anything after the due check ran. */
async function runWithDueAnswer(answer: () => Promise<Response>) {
  const fetchSpy = spyOn(globalThis, 'fetch').mockImplementation((async (
    _url: unknown,
    init?: RequestInit,
  ) => {
    if (init?.method === 'POST') return new Response('{}', { status: 200 })
    return answer()
  }) as typeof fetch)
  const ran = { counted: false, agent: false }
  const outcome = await understandProject({
    api: createProjectUnderstandingClient({
      apiKey: 'key',
      projectKey: 'local:abc',
      surface: 'desktop',
      baseUrl: 'http://backend.test',
    }),
    countFiles: async () => {
      ran.counted = true
      return {
        fileCount: 1,
        fileCountIsLowerBound: false,
        testFileCount: 0,
        codeLineCount: 1,
        lineCountIsLowerBound: false,
        languages: [],
      }
    },
    runAgent: async () => {
      ran.agent = true
      return { output: { type: 'structuredOutput', value: {} } }
    },
    logger: silent,
  })
  return { outcome, ran, fetchSpy }
}

const json = (body: unknown, status = 200) =>
  Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  )

describe('understandProject due check', () => {
  test('due: false is not_due, and nothing runs', async () => {
    const { outcome, ran } = await runWithDueAnswer(() =>
      json({ due: false, template: null }),
    )
    expect(outcome).toBe('not_due')
    expect(ran).toEqual({ counted: false, agent: false })
  })

  test('due: true runs and reports', async () => {
    const { outcome, ran } = await runWithDueAnswer(() =>
      json({ due: true, template: TEMPLATE }),
    )
    expect(outcome).toBe('reported')
    expect(ran).toEqual({ counted: true, agent: true })
  })

  test('a failed check is check_failed, never not_due', async () => {
    for (const answer of [
      () => json({ error: 'nope' }, 500),
      () => json({ error: 'unauthorized' }, 401),
      () => Promise.reject(new TypeError('fetch failed')),
      () => Promise.resolve(new Response('<html>oops</html>', { status: 200 })),
      () => json({ due: 'yes' }),
      () => json({ due: true, template: { version: 'x', sections: 3 } }),
    ]) {
      const { outcome, ran } = await runWithDueAnswer(answer)
      expect(outcome).toBe('check_failed')
      expect(ran).toEqual({ counted: false, agent: false })
      mock.restore()
    }
  })

  test('a custom api that throws from checkDue is check_failed', async () => {
    const api: ProjectUnderstandingApi = {
      checkDue: async () => {
        throw new Error('down')
      },
      report: async () => true,
    }
    let counted = false
    const outcome = await understandProject({
      api,
      countFiles: async () => {
        counted = true
        throw new Error('not reached')
      },
      runAgent: async () => undefined,
      logger: silent,
    })
    expect(outcome).toBe('check_failed')
    expect(counted).toBe(false)
  })
})
