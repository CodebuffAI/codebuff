import { describe, expect, it } from 'bun:test'

import { formatHookRunHeader } from '../run-file-change-hooks'

describe('run_file_change_hooks header', () => {
  it('does not present an all-skipped run as a passing validation', () => {
    expect(
      formatHookRunHeader([
        {
          validationStatus: 'hooks_skipped',
          message:
            'Configured file-change hooks were skipped because none matched.',
        },
      ]),
    ).toBe('Validation skipped')
  })
})
