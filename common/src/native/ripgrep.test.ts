import { describe, it, expect } from 'bun:test'
import { getRgPath } from './ripgrep.js'

describe('ripgrep', () => {
  it('should return a valid rg path', async () => {
    const path = await getRgPath()
    expect(path).toBeString()
    expect(Bun.file(path).size).toBeGreaterThan(0)
  })
})