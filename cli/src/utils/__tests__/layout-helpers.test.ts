import { describe, expect, test } from 'bun:test'
import { computeSmartColumns } from '../layout-helpers'

describe('computeSmartColumns', () => {
  test('uses item count if less than max columns', () => {
    expect(computeSmartColumns(1, 3)).toBe(1)
    expect(computeSmartColumns(2, 3)).toBe(2)
    expect(computeSmartColumns(3, 3)).toBe(3)
  })

  test('uses max columns if divisible', () => {
    expect(computeSmartColumns(6, 3)).toBe(3) // 2 rows of 3
    expect(computeSmartColumns(9, 3)).toBe(3) // 3 rows of 3
    expect(computeSmartColumns(8, 4)).toBe(4) // 2 rows of 4
  })

  test('handles 4 items on 3 column screen (2x2)', () => {
    expect(computeSmartColumns(4, 3)).toBe(2)
  })

  test('handles prime numbers by maximizing width', () => {
    expect(computeSmartColumns(5, 3)).toBe(3) // 3 + 2 is better than 2 + 2 + 1
    expect(computeSmartColumns(7, 4)).toBe(4) // 4 + 3
  })

  test('handles 4 items on 4 column screen', () => {
    expect(computeSmartColumns(4, 4)).toBe(4)
  })

  test('handles large counts', () => {
    // Loop starts at maxColumns (4). 10 % 4 != 0. 10 % 3 != 0. 10 % 2 == 0. So returns 2.
    // 2 cols x 5 rows
    expect(computeSmartColumns(10, 4)).toBe(2)
  })
})
