import { test, expect, mock } from 'bun:test'
import { processStreamWithFiles } from '../process-stream'
test('processStreamWithFiles basic functionality', async () => {
  const mockStream = async function* () {
    yield 'before'
    yield '<file path="test.txt">file content</file>'
    yield 'after'
  }
  const onFileStart = mock((filePath: string) => {})
  const onFile = mock((filePath: string, content: string) => {})
  const result = []
  for await (const chunk of processStreamWithFiles(
    mockStream(),
    onFileStart,
    onFile
  )) {
    result.push(chunk)
  }
  expect(result).toEqual([
    'before',
    `<file path=\"test.txt\">`,
    '</file>',
    'after',
  ])
  expect(onFileStart).toHaveBeenCalledWith('test.txt')
  expect(onFile).toHaveBeenCalledWith('test.txt', 'file content')
})
