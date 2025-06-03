import { describe, expect, it } from 'bun:test'
import { getFilteredToolsInstructions } from '../tools'

describe('getFilteredToolsInstructions', () => {
  it('should match snapshot for ask mode', () => {
    const result = getFilteredToolsInstructions('ask')

    expect(result).toMatchSnapshot()
  })

  it('should match snapshot for lite mode', () => {
    const result = getFilteredToolsInstructions('lite')

    expect(result).toMatchSnapshot()
  })

  it('should match snapshot for normal mode', () => {
    const result = getFilteredToolsInstructions('normal')

    expect(result).toMatchSnapshot()
  })

  it('should match snapshot for max mode', () => {
    const result = getFilteredToolsInstructions('max')

    expect(result).toMatchSnapshot()
  })

  it('should match snapshot for experimental mode', () => {
    const result = getFilteredToolsInstructions('experimental')

    expect(result).toMatchSnapshot()
  })
})
