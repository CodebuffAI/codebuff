import { Writable } from 'stream'

// @ts-ignore
import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test'
import { getToolCallString } from 'common/constants/tools'
import * as projectFileTree from 'common/project-file-tree'
import stripAnsi from 'strip-ansi'

import * as projectFiles from '../../project-files'
import { toolRenderers } from '../tool-renderers'
import { createXMLStreamParser } from '../xml-stream-parser'

describe('Tool renderers with XML parser', () => {
  beforeEach(() => {
    spyOn(projectFileTree, 'isFileIgnored').mockImplementation(() => false)
    spyOn(projectFiles, 'getProjectRoot').mockImplementation(() => false)
  })

  afterEach(() => {
    mock.restore()
  })

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
      content: 'console.log("test");\n',
    })
    const output = await processXML(xml)
    const stripped = stripAnsi(output)
    expect(stripped).toBe('\n\n[Write File]\nEditing file at test.ts...\n\n')
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
