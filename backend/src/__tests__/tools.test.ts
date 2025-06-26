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
    'think_deeply',
    'create_plan',
    'browser_logs',
    'read_docs',
    'end_turn',
  ]

  const askModeTools = [
    'add_subgoal',
    'update_subgoal',
    'read_files',
    'find_files',
    'code_search',
    'think_deeply',
    'create_plan',
    'browser_logs',
    'read_docs',
    'end_turn',
  ]

  test('should return all tools for normal mode', () => {
    const instructions = getFilteredToolsInstructions('normal', false)
    for (const tool of allTools) {
      expect(instructions).toInclude(`### ${tool}`)
    }
  })

  test('should return a subset of tools for ask mode', () => {
    const instructions = getFilteredToolsInstructions('ask', false)
    for (const tool of askModeTools) {
      expect(instructions).toInclude(`### ${tool}`)
    }
    expect(instructions).not.toInclude(`### write_file`)
    expect(instructions).not.toInclude(`### str_replace`)
    expect(instructions).not.toInclude(`### run_terminal_command`)
  })

  test('should include read_docs tool in both modes', () => {
    const normalInstructions = getFilteredToolsInstructions('normal', false)
    const askInstructions = getFilteredToolsInstructions('ask', false)
    
    expect(normalInstructions).toInclude(`### read_docs`)
    expect(askInstructions).toInclude(`### read_docs`)
  })
})
