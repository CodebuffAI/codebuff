import { expect, test } from 'bun:test'

import {
  findByokWordingViolations,
  formatByokWordingViolations,
} from '../byok-wording-guard'

test('retained markdown avoids unallowlisted hosted-product wording', () => {
  const violations = findByokWordingViolations()

  expect(formatByokWordingViolations(violations)).toBe(
    'Focused BYOK wording guard passed: no unallowlisted hosted-product wording found.',
  )
  expect(violations).toEqual([])
})
