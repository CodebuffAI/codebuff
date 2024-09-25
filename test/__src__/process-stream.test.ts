import { test, expect, mock } from 'bun:test'
import { processStreamWithTags } from 'backend/process-stream'
import { range } from 'lodash'

test('processStreamWithFiles basic functionality', async () => {
  const mockStream = async function* () {
    yield 'before'
    yield '<file path="test.txt">file content</file>'
    yield 'after'
  }
  const onFileStart = mock((attributes: Record<string, string>) => '')
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
  expect(result.join('')).toEqual('beforeafter')
  expect(onFileStart).toHaveBeenCalledWith({ path: 'test.txt' })
  expect(onFile).toHaveBeenCalledWith('file content', { path: 'test.txt' })
})

test('processStreamWithTags handles tool_call for terminal command', async () => {
  const mockStream = async function* () {
    yield 'I will run bun install for you. '
    yield '<tool_call name="run_terminal_command">bun install</tool_call>'
  }
  const onToolCallStart = mock((attributes: Record<string, string>) => '')
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
  expect(result.join()).toEqual('I will run bun install for you. ')
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
    yield 'install</tool_call> thanks'
    yield 'cool'
  }
  const onToolCallStart = mock((attributes: Record<string, string>) => '')
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
  expect(result.join()).toEqual('I will run bun install for you.  thankscool')
  expect(onToolCallStart).toHaveBeenCalledWith({ name: 'run_terminal_command' })
  expect(onToolCall).toHaveBeenCalledWith('bun install', {
    name: 'run_terminal_command',
  })
})

test('processStreamWithTags handles tool_call with preamble and postamble', async () => {
  const mockStream = async function* () {
    yield range(30)
      .map(() => 'I will run bun install for you. ')
      .join('')
    yield '<tool_call '
    yield 'name="run_terminal_'
    yield 'command">bun '
    yield 'install</tool_call> thanks'
    yield 'cool'
    yield range(30)
      .map(() => 'it is done yes it is done ')
      .join('')
  }
  const onToolCallStart = mock((attributes: Record<string, string>) => '')
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
  expect(result.join()).toEqual(
    `I will run bun install for you. I will run bun install for you. I will run bun install for you. I will run bun install for you. I will run bun install for you. I will run bun install for you. I will run bun install for you. I will run bun install for you. I will run bun install for you. I will run bun install for you. I will run bun install for you. I will run bun install for you. I will run bun install for you. I will run bun install for you. I will run bun install for you. I will run bun install for you. I will run bun install for you. I will run bun install for you. I will run bun install for you. I will run bun install for you. I will run bun install for you. I will run bun install for you. I will, run bun in,stall for you. I wi,ll run bun install for you. I will run bun install for you. I will run bun install for you. I will run bun install for you. I will run bun install for you. I will run bun install for you. I will run bun install for you. , thankscoolit is done yes it is done it is done yes it is done it is done yes it is done it is done yes it is done it is done yes it is done it is done yes it is done it is done yes it is done it is done yes it is done it is done yes it is done it is done yes it is done it is done yes it is done it is done yes it is done it is done yes it is done it is done yes it is done it is done yes it is done it is done yes it is done it is done yes it is done it is done yes it is done it is done yes it is done it is done yes it is done it is done, yes it is done it is done yes it is done it is done yes it is done it is done yes it is done it is done yes it is done it is done yes it is done it is done yes it is done it is done yes it is done it is done yes it is done it is done yes it is done `
  )
  expect(onToolCallStart).toHaveBeenCalledWith({ name: 'run_terminal_command' })
  expect(onToolCall).toHaveBeenCalledWith('bun install', {
    name: 'run_terminal_command',
  })
})
