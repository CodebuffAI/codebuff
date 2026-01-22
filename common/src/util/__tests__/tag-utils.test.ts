import { describe, it, expect } from 'bun:test'

import { closeXml, getStopSequences } from '../xml'

describe('closeXml', () => {
  it('creates closing tag for simple name', () => {
    expect(closeXml('div')).toBe('</div>')
  })

  it('creates closing tag for tool name', () => {
    expect(closeXml('read_files')).toBe('</read_files>')
  })

  it('creates closing tag for camelCase name', () => {
    expect(closeXml('readFiles')).toBe('</readFiles>')
  })

  it('creates closing tag for snake_case name', () => {
    expect(closeXml('write_file')).toBe('</write_file>')
  })

  it('creates closing tag for name with numbers', () => {
    expect(closeXml('param1')).toBe('</param1>')
  })

  it('creates closing tag for single character name', () => {
    expect(closeXml('a')).toBe('</a>')
  })

  it('creates closing tag for long name', () => {
    expect(closeXml('very_long_tool_name_with_many_parts')).toBe(
      '</very_long_tool_name_with_many_parts>',
    )
  })

  it('handles empty string', () => {
    expect(closeXml('')).toBe('</>')
  })
})

describe('getStopSequences', () => {
  it('returns empty array for empty input', () => {
    expect(getStopSequences([])).toEqual([])
  })

  it('creates stop sequence for single tool name', () => {
    expect(getStopSequences(['read_files'])).toEqual(['</codebuff_tool_read_files>'])
  })

  it('creates stop sequences for multiple tool names', () => {
    expect(getStopSequences(['read_files', 'write_file', 'command'])).toEqual([
      '</codebuff_tool_read_files>',
      '</codebuff_tool_write_file>',
      '</codebuff_tool_command>',
    ])
  })

  it('preserves order of tool names', () => {
    const tools = ['z_tool', 'a_tool', 'm_tool']
    const result = getStopSequences(tools)
    expect(result).toEqual([
      '</codebuff_tool_z_tool>',
      '</codebuff_tool_a_tool>',
      '</codebuff_tool_m_tool>',
    ])
  })

  it('handles camelCase tool names', () => {
    expect(getStopSequences(['readFiles', 'writeFile'])).toEqual([
      '</codebuff_tool_readFiles>',
      '</codebuff_tool_writeFile>',
    ])
  })

  it('handles tool names with numbers', () => {
    expect(getStopSequences(['tool1', 'tool2'])).toEqual([
      '</codebuff_tool_tool1>',
      '</codebuff_tool_tool2>',
    ])
  })

  it('handles single character tool names', () => {
    expect(getStopSequences(['a', 'b', 'c'])).toEqual([
      '</codebuff_tool_a>',
      '</codebuff_tool_b>',
      '</codebuff_tool_c>',
    ])
  })

  it('works with readonly array', () => {
    const tools: readonly string[] = ['read_files', 'write_file']
    expect(getStopSequences(tools)).toEqual([
      '</codebuff_tool_read_files>',
      '</codebuff_tool_write_file>',
    ])
  })

  it('returns new array (does not mutate input)', () => {
    const tools = ['read_files']
    const result = getStopSequences(tools)
    expect(result).not.toBe(tools)
  })
})
