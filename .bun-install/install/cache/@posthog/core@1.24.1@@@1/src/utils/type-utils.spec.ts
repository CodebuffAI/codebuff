import { isNumber, isPositiveNumber } from './type-utils'

describe('type-utils', () => {
  describe('isNumber', () => {
    it.each([
      [1, true],
      [0, true],
      [-1, true],
      [0.1, true],
      [Infinity, true],
      [-Infinity, true],
      [NaN, false],
      [null, false],
      [undefined, false],
      ['1', false],
      [{}, false],
    ])('isNumber(%p) returns %p', (value, expected) => {
      expect(isNumber(value)).toBe(expected)
    })
  })

  describe('isPositiveNumber', () => {
    it.each([
      [1, true],
      [0.1, true],
      [Infinity, true],
      [0, false],
      [-1, false],
      [NaN, false],
      [null, false],
      [undefined, false],
      ['1', false],
      [{}, false],
    ])('isPositiveNumber(%p) returns %p', (value, expected) => {
      expect(isPositiveNumber(value)).toBe(expected)
    })
  })
})
