// @ts-ignore
import { describe, expect, test } from 'bun:test'
import { Writable } from 'stream'
import { getToolCallString } from 'common/constants/tools'
import stripAnsi from 'strip-ansi'
import { toolRenderers } from '../tool-renderers'
import { createXMLStreamParser } from '../xml-stream-parser'

describe('Tool renderers with XML parser', () => {
  // Helper function to process XML through parser and get output
  async function processXML(xml: string): Promise<string> {
    let result = ''
    const processor = createXMLStreamParser(toolRenderers)

    const writable = new Writable({
      write(chunk, encoding, callback) {
        result += chunk.toString()
        callback()
      },
    })

    processor.pipe(writable)
    processor.write(xml)
    processor.end()

    // Wait for stream to finish
    await new Promise<void>((resolve) => {
      writable.on('finish', resolve)
    })

    return result
  }

  test('formats write_file tool call', async () => {
    const xml = getToolCallString('write_file', {
      path: 'test.ts',
      content: 'console.log("test");',
    })
    const output = await processXML(xml)
    const stripped = stripAnsi(output)
    expect(stripped).toBe('\n\n[Write File]\nEditing file at test.ts...\n\n\n')
  })

  test('formats read_files tool call', async () => {
    const xml = getToolCallString('read_files', {
      paths: 'file1.ts\nfile2.ts',
    })
    const output = await processXML(xml)
    const stripped = stripAnsi(output)
    expect(stripped).toBe('\n\n[Read Files]\nfile1.ts\nfile2.ts\n\n')
  })
})
