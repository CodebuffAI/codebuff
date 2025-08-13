import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  spyOn,
  mock,
} from 'bun:test'

import { validateAgent } from '../cli'
import * as SpinnerMod from '../utils/spinner'

describe('validateAgent agent pass-through', () => {
  let fetchSpy: ReturnType<typeof spyOn>
  let spinnerSpy: ReturnType<typeof spyOn>

  beforeEach(() => {
    fetchSpy = spyOn(globalThis as any, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ valid: true }),
    } as any)

    spinnerSpy = spyOn(SpinnerMod.Spinner, 'get').mockReturnValue({
      start: () => {},
      stop: () => {},
    } as any)
  })

  afterEach(() => {
    mock.restore()
  })

  it('passes published agent id unchanged to backend (publisher/name@version)', async () => {
    const agent = 'codebuff/file-explorer@0.0.1'
    await validateAgent(agent, {})

    expect(fetchSpy).toHaveBeenCalled()
    const url = (fetchSpy.mock.calls[0] as any[])[0] as string
    const u = new URL(url)
    expect(u.searchParams.get('agentId')).toBe(agent)
  })

  it('short-circuits when agent is found locally (by id)', async () => {
    const agent = 'codebuff/file-explorer@0.0.1'
    fetchSpy.mockClear()

    await validateAgent(agent, {
      [agent]: { displayName: 'File Explorer' },
    })

    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
