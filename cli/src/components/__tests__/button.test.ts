import { describe, expect, test } from 'bun:test'

import { isButtonActivationKey } from '../button'

describe('Button keyboard activation', () => {
  test.each(['return', 'enter', 'space'])('activates for %s', (name) => {
    expect(isButtonActivationKey({ name } as never)).toBe(true)
  })

  test.each(['tab', 'escape', 'left'])('does not activate for %s', (name) => {
    expect(isButtonActivationKey({ name } as never)).toBe(false)
  })
})
