import { describe, expect, it } from 'bun:test'

import {
  simplifyReadFileResults,
  simplifyReadFileToolResult,
  simplifyTerminalCommandResults,
  simplifyTerminalCommandToolResult,
} from '../simplify-tool-results'

describe('simplifyToolResultsInMessages', () => {
  it('should simplify read_files results while preserving others', () => {
    const messageContent = `
<tool_result>
<tool>read_files</tool>
<result><read_file>
<path>test1.txt</path>
<content>content1</content>
<referenced_by>None</referenced_by>
</read_file>

<read_file>
<path>test2.txt</path>
<content>content2</content>
<referenced_by>None</referenced_by>
</read_file></result>
</tool_result>
<tool_result>
<tool>run_terminal_command</tool>
<result>ls -la output</result>
</tool_result>`

    const result = simplifyReadFileResults(messageContent)
    expect(result).toContain('Read the following files: test1.txt\ntest2.txt')
    expect(result).toContain('ls -la output') // Other tool results preserved
  })

  it('should handle array message content format', () => {
    const messageContent = [
      {},
      {
        text: `
<tool_result>
<tool>read_files</tool>
<result><read_file>
<path>test.txt</path>
<content>content</content>
<referenced_by>None</referenced_by>
</read_file></result>
</tool_result>`,
      },
    ]

    const result = simplifyReadFileResults(messageContent)
    expect(result).toContain('Read the following files: test.txt')
  })

  it('should return original content if no tool results present', () => {
    const messageContent = 'No tool results here'
    const result = simplifyReadFileResults(messageContent)
    expect(result).toBe('No tool results here')
  })

  it('should handle empty content', () => {
    const result = simplifyReadFileResults('')
    expect(result).toBe('')
  })

  it('should handle array message content with no text property', () => {
    const messageContent = [{}, {}]
    const result = simplifyReadFileResults(messageContent)
    expect(result).toBe('')
  })

  it('should handle array message content with undefined text property', () => {
    const messageContent = [{}, { text: undefined }]
    const result = simplifyReadFileResults(messageContent)
    expect(result).toBe('')
  })

  it('should handle multiple read_files results', () => {
    const messageContent = `
<tool_result>
<tool>read_files</tool>
<result><read_file>
<path>test1.txt</path>
<content>content1</content>
<referenced_by>None</referenced_by>
</read_file></result>
</tool_result>
<tool_result>
<tool>read_files</tool>
<result><read_file>
<path>test2.txt</path>
<content>content2</content>
<referenced_by>None</referenced_by>
</read_file></result>
</tool_result>`

    const result = simplifyReadFileResults(messageContent)
    expect(result).toContain('Read the following files: test1.txt')
    expect(result).toContain('Read the following files: test2.txt')
  })

  it('should handle malformed read_files result', () => {
    const messageContent = `
<tool_result>
<tool>read_files</tool>
<result>malformed content without read_file tags</result>
</tool_result>`

    const result = simplifyReadFileResults(messageContent)
    expect(result).toContain('Read the following files: ')
  })
})

describe('simplifyTerminalCommandResultsInMessages', () => {
  it('should simplify long terminal command output', () => {
    const messageContent = `
<tool_result>
<tool>run_terminal_command</tool>
<result>Very long terminal output that should be shortened</result>
</tool_result>`

    const result = simplifyTerminalCommandResults(messageContent)
    expect(result).toContain('[Output omitted]')
  })

  it('should preserve short terminal command output', () => {
    const shortOutput = 'Short output'
    const messageContent = `
<tool_result>
<tool>run_terminal_command</tool>
<result>${shortOutput}</result>
</tool_result>`

    const result = simplifyTerminalCommandResults(messageContent)
    expect(result).toContain(shortOutput)
  })

  it('should preserve other tool results', () => {
    const messageContent = `
<tool_result>
<tool>run_terminal_command</tool>
<result>Very long terminal output that should be shortened</result>
</tool_result>
<tool_result>
<tool>read_files</tool>
<result><read_file>
<path>test.txt</path>
<content>content</content>
<referenced_by>None</referenced_by>
</read_file></result>
</tool_result>`

    const result = simplifyTerminalCommandResults(messageContent)
    expect(result).toContain('[Output omitted]')
    expect(result).toContain(
      '<read_file>\n<path>test.txt</path>\n<content>content</content>\n<referenced_by>None</referenced_by>\n</read_file>'
    )
  })

  it('should handle multiple terminal command results', () => {
    const messageContent = `
<tool_result>
<tool>run_terminal_command</tool>
<result>First long output that should be shortened</result>
</tool_result>
<tool_result>
<tool>run_terminal_command</tool>
<result>Second long output that should also be shortened</result>
</tool_result>`

    const result = simplifyTerminalCommandResults(messageContent)
    const matches = result.match(/\[Output omitted\]/g) || []
    expect(matches.length).toBe(2)
  })

  it('should handle mixed short and long terminal outputs', () => {
    const messageContent = `
<tool_result>
<tool>run_terminal_command</tool>
<result>Very long terminal output that should be shortened</result>
</tool_result>
<tool_result>
<tool>run_terminal_command</tool>
<result>ok</result>
</tool_result>`

    const result = simplifyTerminalCommandResults(messageContent)
    expect(result).toContain('[Output omitted]')
    expect(result).toContain('ok')
  })

  it('should handle malformed terminal command result', () => {
    const messageContent = `
<tool_result>
<tool>run_terminal_command</tool>
<result></result>
</tool_result>`

    const result = simplifyTerminalCommandResults(messageContent)
    expect(result).toContain('<result></result>')
  })
})

describe('simplifyReadFileToolResult', () => {
  it('should extract file paths from read_files result', () => {
    const toolResult = {
      id: '1',
      name: 'read_files',
      result: `<read_file>
<path>test1.txt</path>
<content>content1</content>
<referenced_by>None</referenced_by>
</read_file>

<read_file>
<path>test2.txt</path>
<content>content2</content>
<referenced_by>None</referenced_by>
</read_file>`,
    }

    const simplified = simplifyReadFileToolResult(toolResult)
    expect(simplified.id).toBe('1')
    expect(simplified.name).toBe('read_files')
    expect(simplified.result).toBe(
      'Read the following files: test1.txt\ntest2.txt'
    )
  })

  it('should handle single file result', () => {
    const toolResult = {
      id: '1',
      name: 'read_files',
      result:
        '<read_file><path>test.txt</path><content>content</content><referenced_by>None</referenced_by></read_file>',
    }

    const simplified = simplifyReadFileToolResult(toolResult)
    expect(simplified.result).toBe('Read the following files: test.txt')
  })

  it('should handle empty read_files result', () => {
    const toolResult = {
      id: '1',
      name: 'read_files',
      result: '',
    }

    const simplified = simplifyReadFileToolResult(toolResult)
    expect(simplified.result).toBe('Read the following files: ')
  })

  it('should handle malformed read_file tags', () => {
    const toolResult = {
      id: '1',
      name: 'read_files',
      result:
        '<read_file>no path attribute<referenced_by>None</referenced_by></read_file>',
    }

    const simplified = simplifyReadFileToolResult(toolResult)
    expect(simplified.result).toBe('Read the following files: ')
  })

  it('should handle read_file tags with empty path', () => {
    const toolResult = {
      id: '1',
      name: 'read_files',
      result:
        '<read_file><path></path><content>content</content><referenced_by>None</referenced_by></read_file>',
    }

    const simplified = simplifyReadFileToolResult(toolResult)
    expect(simplified.result).toBe('Read the following files: ')
  })
})

describe('simplifyTerminalCommandResult', () => {
  it('should shorten long terminal output', () => {
    const toolResult = {
      id: '1',
      name: 'run_terminal_command',
      result: 'Very long terminal output that should be shortened',
    }

    const simplified = simplifyTerminalCommandToolResult(toolResult)
    expect(simplified.id).toBe('1')
    expect(simplified.name).toBe('run_terminal_command')
    expect(simplified.result).toBe('[Output omitted]')
  })

  it('should preserve short terminal output', () => {
    const shortOutput = 'ok'
    const toolResult = {
      id: '1',
      name: 'run_terminal_command',
      result: shortOutput,
    }

    const simplified = simplifyTerminalCommandToolResult(toolResult)
    expect(simplified.result).toBe(shortOutput)
  })

  it('should handle empty terminal output', () => {
    const toolResult = {
      id: '1',
      name: 'run_terminal_command',
      result: '',
    }

    const simplified = simplifyTerminalCommandToolResult(toolResult)
    expect(simplified.result).toBe('')
  })

  it('should handle output exactly matching omitted message length', () => {
    const toolResult = {
      id: '1',
      name: 'run_terminal_command',
      result: '[Output omitted]', // Same length as replacement
    }

    const simplified = simplifyTerminalCommandToolResult(toolResult)
    expect(simplified.result).toBe('[Output omitted]')
  })

  it('should handle output one character longer than omitted message', () => {
    const toolResult = {
      id: '1',
      name: 'run_terminal_command',
      result: '[Output omitted].', // One char longer than replacement
    }

    const simplified = simplifyTerminalCommandToolResult(toolResult)
    expect(simplified.result).toBe('[Output omitted]')
  })

  it('should handle output one character shorter than omitted message', () => {
    const toolResult = {
      id: '1',
      name: 'run_terminal_command',
      result: '[Output omit]', // One char shorter than replacement
    }

    const simplified = simplifyTerminalCommandToolResult(toolResult)
    expect(simplified.result).toBe('[Output omit]')
  })
})
