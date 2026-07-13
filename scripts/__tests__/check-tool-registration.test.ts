import { describe, expect, test } from 'bun:test'

import { checkTool } from '../check-tool-registration'

describe('tool registration readiness checker', () => {
  test('covers every required registration and presentation layer', () => {
    const checks = checkTool('inspect_environment')
    expect(checks.map((check) => check.label)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('constants.ts'),
        expect.stringContaining('params schema'),
        expect.stringContaining('published SDK'),
        expect.stringContaining('runtime handler'),
        expect.stringContaining('SDK dispatch'),
        expect.stringContaining('generated agent tool type'),
        expect.stringContaining('initial .agents template'),
        expect.stringContaining('CLI generated'),
        expect.stringContaining('CLI renderer metadata'),
        expect.stringContaining('CLI renderer registry'),
        expect.stringContaining('docs/'),
      ]),
    )
    expect(checks.filter((check) => !check.ok)).toEqual([])
  })
})
