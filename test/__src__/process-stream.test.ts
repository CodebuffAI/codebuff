import { test, expect, mock } from 'bun:test'
import { processStreamWithTags } from 'backend/process-stream'

test('processStreamWithFiles basic functionality', async () => {
  const mockStream = async function* () {
    yield 'before'
    yield '<file path="test.txt">file content</file>'
    yield 'after'
  }
  const onFileStart = mock((attributes: Record<string, string>) => {})
  const onFile = mock((content: string, attributes: Record<string, string>) => {
    return false
  })
  const result = []
  for await (const chunk of processStreamWithTags(mockStream(), {
    file: {
      attributeNames: ['path'],
      onTagStart: onFileStart,
      onTagEnd: onFile,
    },
  })) {
    result.push(chunk)
  }
  expect(result).toEqual([
    'before',
    `<file path=\"test.txt\">`,
    '</file>',
    'after',
  ])
  expect(onFileStart).toHaveBeenCalledWith({ path: 'test.txt' })
  expect(onFile).toHaveBeenCalledWith('file content', { path: 'test.txt' })
})

test('processStreamWithTags handles tool_call for terminal command', async () => {
  const mockStream = async function* () {
    yield 'I will run bun install for you. '
    yield '<tool_call name="run_terminal_command">bun install</tool_call>'
  }
  const onToolCallStart = mock((attributes: Record<string, string>) => {})
  const onToolCall = mock(
    (content: string, attributes: Record<string, string>) => {
      return false
    }
  )
  const result = []
  for await (const chunk of processStreamWithTags(mockStream(), {
    tool_call: {
      attributeNames: ['name'],
      onTagStart: onToolCallStart,
      onTagEnd: onToolCall,
    },
  })) {
    result.push(chunk)
  }
  expect(result).toEqual([
    'I will run bun install for you. ',
    '<tool_call name="run_terminal_command">',
    '</tool_call>',
  ])
  expect(onToolCallStart).toHaveBeenCalledWith({ name: 'run_terminal_command' })
  expect(onToolCall).toHaveBeenCalledWith('bun install', {
    name: 'run_terminal_command',
  })
})

test('processStreamWithTags handles tool_call for terminal command split into many chunks', async () => {
  const mockStream = async function* () {
    yield 'I will run bun install for'
    yield ' you. <tool_call '
    yield 'name="run_terminal_'
    yield 'command">bun '
    yield 'install</tool_call>'
  }
  const onToolCallStart = mock((attributes: Record<string, string>) => {})
  const onToolCall = mock(
    (content: string, attributes: Record<string, string>) => {
      return false
    }
  )
  const result = []
  for await (const chunk of processStreamWithTags(mockStream(), {
    tool_call: {
      attributeNames: ['name'],
      onTagStart: onToolCallStart,
      onTagEnd: onToolCall,
    },
  })) {
    result.push(chunk)
  }
  expect(result).toEqual([
    'I will run bun install for',
    ' you. <tool_call ',
    'name="run_terminal_',
    'command">',
    '</tool_call>',
  ])
  expect(onToolCallStart).toHaveBeenCalledWith({ name: 'run_terminal_command' })
  expect(onToolCall).toHaveBeenCalledWith('bun install', {
    name: 'run_terminal_command',
  })
})
