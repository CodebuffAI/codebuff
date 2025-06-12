import { describe, expect, test } from 'bun:test'
import { getFilteredToolsInstructions } from '../tools'

describe('getFilteredToolsInstructions', () => {
  const allTools = [
    'add_subgoal',
    'update_subgoal',
    'write_file',
    'str_replace',
    'read_files',
    'find_files',
    'code_search',
    'run_terminal_command',
    'research',
    'think_deeply',
    'create_plan',
    'browser_logs',
    'end_turn',
  ]

  const askModeTools = [
    'add_subgoal',
    'update_subgoal',
    'read_files',
    'find_files',
    'code_search',
    'research',
    'think_deeply',
    'create_plan',
    'browser_logs',
    'end_turn',
  ]

  test('should return all tools for normal mode', () => {
    const instructions = getFilteredToolsInstructions('normal')
    for (const tool of allTools) {
      expect(instructions).toInclude(`### ${tool}`)
    }
    expect(instructions).not.toInclude(`### kill_terminal`)
    expect(instructions).not.toInclude(`### sleep`)
  })

  test('should return a subset of tools for ask mode', () => {
    const instructions = getFilteredToolsInstructions('ask')
    for (const tool of askModeTools) {
      expect(instructions).toInclude(`### ${tool}`)
    }
    expect(instructions).not.toInclude(`### write_file`)
    expect(instructions).not.toInclude(`### str_replace`)
    expect(instructions).not.toInclude(`### run_terminal_command`)
    expect(instructions).not.toInclude(`### kill_terminal`)
    expect(instructions).not.toInclude(`### sleep`)
  })

  test('should not include manager-only tools', () => {
    const normalInstructions = getFilteredToolsInstructions('normal')
    expect(normalInstructions).not.toInclude('kill_terminal')
    expect(normalInstructions).not.toInclude('sleep')

    const askInstructions = getFilteredToolsInstructions('ask')
    expect(askInstructions).not.toInclude('kill_terminal')
    expect(askInstructions).not.toInclude('sleep')
  })
})
