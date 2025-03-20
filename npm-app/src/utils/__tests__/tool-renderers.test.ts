// @ts-ignore
import { describe, test, expect } from 'bun:test'
import { toolRenderers } from '../tool-renderers'
import { createXMLStreamParser } from '../xml-stream-parser'
import { Writable } from 'stream'

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
    const xml = `<write_file><path>test.ts</path><content>console.log("test");</content></write_file>`
    const output = await processXML(xml)
    // Remove ANSI color codes for testing
    const stripped = output.replace(/\u001B\[\d+m/g, '')
    expect(stripped).toBe('[Write File]\nEditing file at test.ts...')
  })

  test('formats read_files tool call', async () => {
    const xml = `<read_files>file1.ts\nfile2.ts</read_files>`
    const output = await processXML(xml)
    // Remove ANSI color codes for testing
    const stripped = output.replace(/\u001B\[\d+m/g, '')
    expect(stripped).toBe('[Read Files]\nfile1.ts\nfile2.ts\n')
  })
})
