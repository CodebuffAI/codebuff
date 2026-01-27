import { describe, expect, test } from 'bun:test'

import { parseTerminalOutput, RunTerminalCommandComponent } from '../run-terminal-command'

import type { ToolBlock } from '../types'
import type { ReactElement } from 'react'

// Use ChatTheme import for proper typing
import type { ChatTheme } from '../../../types/theme-system'

// Type for the render result content element
interface RenderContentElement extends ReactElement {
  props: {
    timeoutSeconds?: number
  }
}

// Helper to create a mock tool block
const createToolBlock = (
  command: string,
  output?: string,
  timeoutSeconds?: number,
): ToolBlock & { toolName: 'run_terminal_command' } => ({
  type: 'tool',
  toolName: 'run_terminal_command',
  toolCallId: 'test-tool-call-id',
  input: { command, ...(timeoutSeconds !== undefined && { timeout_seconds: timeoutSeconds }) },
  output,
})

// Helper to create JSON output in the format the component expects
const createJsonOutput = (stdout: string, stderr = ''): string => {
  return JSON.stringify([
    {
      type: 'json',
      value: {
        command: 'test',
        stdout,
        stderr,
        exitCode: 0,
      },
    },
  ])
}

describe('RunTerminalCommandComponent', () => {
  describe('render', () => {
    test('returns content and collapsedPreview', () => {
      const toolBlock = createToolBlock('ls -la', createJsonOutput('file1\nfile2'))
      const mockTheme = {} as ChatTheme
      const mockOptions = {
        availableWidth: 80,
        indentationOffset: 0,
        labelWidth: 10,
      }

      const result = RunTerminalCommandComponent.render(toolBlock, mockTheme, mockOptions)

      expect(result).toBeDefined()
      expect(result.content).toBeDefined()
      expect(result.collapsedPreview).toBe('$ ls -la')
    })

    test('preserves leading whitespace in stdout (tree output)', () => {
      // Simulate tree command output with leading spaces for indentation
      const treeOutput = `├── src
│   ├── index.ts
│   └── utils
│       └── helper.ts
└── package.json`

      const { output } = parseTerminalOutput(createJsonOutput(treeOutput))

      expect(output).toBe(treeOutput)
      // Verify leading characters are preserved (├ has no leading space, but indented lines do)
      expect(output?.startsWith('├')).toBe(true)
      expect(output).toContain('│   ├')
      expect(output).toContain('│       └')
    })

    test('preserves leading spaces in table-like output', () => {
      // Simulate output with leading spaces for alignment
      const tableOutput = `  Name        Size     Modified
  file1.txt   1.2KB    2024-01-15
  file2.txt   3.4MB    2024-01-16`

      const { output } = parseTerminalOutput(createJsonOutput(tableOutput))

      expect(output).toBe(tableOutput)
      // Verify leading spaces are preserved
      expect(output?.startsWith('  ')).toBe(true)
    })

    test('preserves leading spaces in indented code output', () => {
      // Simulate indented output like grep with context
      const indentedOutput = `    function hello() {
        console.log("world")
    }`

      const { output } = parseTerminalOutput(createJsonOutput(indentedOutput))

      expect(output).toBe(indentedOutput)
      expect(output?.startsWith('    ')).toBe(true)
    })

    test('removes trailing whitespace while preserving leading whitespace', () => {
      const outputWithTrailing = '  leading preserved\ntrailing removed   \n\n'
      const expectedOutput = '  leading preserved\ntrailing removed'

      const { output } = parseTerminalOutput(createJsonOutput(outputWithTrailing))

      expect(output).toBe(expectedOutput)
      // Leading spaces preserved
      expect(output?.startsWith('  ')).toBe(true)
      // Trailing whitespace removed
      expect(output?.endsWith('removed')).toBe(true)
    })

    test('handles raw string output (non-JSON) and preserves leading whitespace', () => {
      const rawOutput = '    indented raw output'
      const { output } = parseTerminalOutput(rawOutput)

      expect(output).toBe(rawOutput)
      expect(output?.startsWith('    ')).toBe(true)
    })

    test('handles combined stdout and stderr with leading whitespace', () => {
      const stdout = '  stdout with leading space\n'
      const stderr = '  stderr with leading space'

      const { output } = parseTerminalOutput(
        JSON.stringify([
          {
            type: 'json',
            value: { stdout, stderr, exitCode: 0 },
          },
        ]),
      )

      expect(output).toContain('  stdout with leading space')
      expect(output).toContain('  stderr with leading space')
    })

    test('handles output that is only whitespace', () => {
      const whitespaceOnly = '   '
      const { output } = parseTerminalOutput(createJsonOutput(whitespaceOnly))

      // trimEnd() on whitespace-only string returns empty string, which becomes null
      expect(output).toBe(null)
    })

    test('handles empty output', () => {
      const { output } = parseTerminalOutput(createJsonOutput(''))

      expect(output).toBe(null)
    })
  })

  describe('timeout extraction', () => {
    const mockTheme = {} as ChatTheme
    const mockOptions = {
      availableWidth: 80,
      indentationOffset: 0,
      labelWidth: 10,
    }

    test('passes undefined timeoutSeconds when timeout_seconds not provided', () => {
      const toolBlock = createToolBlock('ls -la', createJsonOutput('output'))

      const result = RunTerminalCommandComponent.render(toolBlock, mockTheme, mockOptions)

      expect((result.content as RenderContentElement).props.timeoutSeconds).toBeUndefined()
    })

    test('passes timeoutSeconds for positive timeout', () => {
      const toolBlock = createToolBlock('npm test', createJsonOutput('tests passed'), 60)

      const result = RunTerminalCommandComponent.render(toolBlock, mockTheme, mockOptions)

      expect((result.content as RenderContentElement).props.timeoutSeconds).toBe(60)
    })

    test('passes timeoutSeconds for no timeout (-1)', () => {
      const toolBlock = createToolBlock('long-running-task', createJsonOutput('done'), -1)

      const result = RunTerminalCommandComponent.render(toolBlock, mockTheme, mockOptions)

      expect((result.content as RenderContentElement).props.timeoutSeconds).toBe(-1)
    })
  })

  describe('parseTerminalOutput', () => {
    test('handles error messages', () => {
      const errorPayload = JSON.stringify([
        {
          type: 'json',
          value: {
            command: 'test',
            errorMessage: 'Something went wrong',
            stdout: '',
            stderr: '',
            exitCode: 1,
          },
        },
      ])

      const { output, startingCwd } = parseTerminalOutput(errorPayload)

      expect(output).toBe('Error: Something went wrong')
      expect(startingCwd).toBeUndefined()
    })

    test('extracts startingCwd when present', () => {
      const payloadWithCwd = JSON.stringify([
        {
          type: 'json',
          value: {
            command: 'pwd',
            stdout: '/project\n',
            stderr: '',
            exitCode: 0,
            startingCwd: '/project',
          },
        },
      ])

      const { output, startingCwd } = parseTerminalOutput(payloadWithCwd)

      expect(output).toBe('/project')
      expect(startingCwd).toBe('/project')
    })
  })
})
