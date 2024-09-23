import { test, expect, mock } from 'bun:test'
import { processStreamWithTags } from 'backend/process-stream'

test('processStreamWithFiles basic functionality', async () => {
  const mockStream = async function* () {
    yield 'before'
    yield '<file path="test.txt">file content</file>'
    yield 'after'
  }
  const onFileStart = mock((attributes: Record<string, string>) => {})
  const onFile = mock((content: string, attributes: Record<string, string>) => {})
  const result = []
  for await (const chunk of processStreamWithTags(
    mockStream(),
    {
      file: {
        attributeNames: ['path'],
        onTagStart: onFileStart,
        onTagEnd: onFile,
      },
    }
  )) {
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
