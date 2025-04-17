import fs from 'fs'
import path from 'path'
import { Writable } from 'stream'

// @ts-ignore
import { describe, expect, test } from 'bun:test'

import { defaultToolCallRenderer } from '../tool-renderers'
import { createXMLStreamParser } from '../xml-stream-parser'

const toolRenderers = {
  run_terminal_command: defaultToolCallRenderer,
  write_file: defaultToolCallRenderer,
  read_files: defaultToolCallRenderer,
}

describe('Saxy Stream Processor', () => {
  test('pipes output to writable stream', async () => {
    const xml =
      '<run_terminal_command><command>echo hello</command></run_terminal_command>'
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

    // Wait for the stream to finish
    await new Promise<void>((resolve) => {
      writable.on('finish', resolve)
    })

    expect(result).toContain('Run Terminal Command')
    expect(result).toContain('echo hello')
  })

  test('handles multiple tool calls in sequence', async () => {
    const xml =
      '<run_terminal_command><command>ls</command></run_terminal_command><read_files><paths>file.txt</paths></read_files>'
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

    // Wait for the stream to finish
    await new Promise<void>((resolve) => {
      writable.on('finish', resolve)
    })

    expect(result).toContain('Run Terminal Command')
    expect(result).toContain('ls')
    expect(result).toContain('Read Files')
    expect(result).toContain('file.txt')
  })

  test('handles text content between tool calls', async () => {
    const xml =
      '<run_terminal_command><command>ls</command></run_terminal_command>Some text between tool calls<read_files><paths>file.txt</paths></read_files>'
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

    // Wait for the stream to finish
    await new Promise<void>((resolve) => {
      writable.on('finish', resolve)
    })

    expect(result).toContain('Run Terminal Command')
    expect(result).toContain('ls')
    expect(result).toContain('Some text between tool calls')
    expect(result).toContain('Read Files')
    expect(result).toContain('file.txt')
  })

  test('processes chunks incrementally with output verification', async () => {
    // Define chunks that will be written one at a time
    const chunks = [
      '<run_terminal_',
      'command><comm',
      'and>npm ',
      'install',
      '</command></run_terminal_command>',
      '<code_search><patt',
      'ern>function</pattern></code_search>',
    ]

    // Array to store output chunks as they're produced
    const outputChunks: string[] = []

    // Create a writable stream that captures each output chunk
    const writable = new Writable({
      write(chunk, encoding, callback) {
        const chunkStr = chunk.toString()
        outputChunks.push(chunkStr)
        callback()
      },
    })

    // Create the processor
    const processor = createXMLStreamParser(toolRenderers)
    processor.pipe(writable)

    // Process each chunk with a small delay between them
    for (const chunk of chunks) {
      processor.write(chunk)
      // Small delay to simulate real-world streaming
      await new Promise((resolve) => setTimeout(resolve, 5))
    }
    processor.end()

    // Wait for the stream to finish
    await new Promise<void>((resolve) => {
      writable.on('finish', resolve)
    })

    // Verify the complete output
    const fullOutput = outputChunks.join('')
    expect(fullOutput).toContain('Run Terminal Command')
    expect(fullOutput).toContain('npm install')
    expect(fullOutput).toContain('Code Search')
    expect(fullOutput).toContain('function')

    // Verify incremental output - but don't make assumptions about which chunks contain what
    // Just check that we got multiple output chunks (incremental processing)
    expect(outputChunks.length).toBeGreaterThan(1)

    // Check that the terminal command appears before the code search in the output
    const terminalCommandIndex = fullOutput.indexOf('Run Terminal Command')
    const codeSearchIndex = fullOutput.indexOf('Code Search')
    expect(terminalCommandIndex).toBeLessThan(codeSearchIndex)
  })

  test('processes text content incrementally', async () => {
    // Define chunks that will be written one at a time
    const chunks = ['hi', 'hi2', 'hi3 <yo>\nyo\n</yo>']

    // Array to store output chunks as they're produced
    const outputChunks: string[] = []

    // Create a writable stream that captures each output chunk
    const writable = new Writable({
      write(chunk, encoding, callback) {
        const chunkStr = chunk.toString()
        outputChunks.push(chunkStr)
        callback()
      },
    })

    // Create the processor
    const processor = createXMLStreamParser(toolRenderers)
    processor.pipe(writable)

    // Process each chunk with a small delay between them
    for (const chunk of chunks) {
      processor.write(chunk)
      // Small delay to simulate real-world streaming
      await new Promise((resolve) => setTimeout(resolve, 5))
    }
    processor.end()

    // Wait for the stream to finish
    await new Promise<void>((resolve) => {
      writable.on('finish', resolve)
    })

    // Verify the complete output
    const fullOutput = outputChunks.join('')
    expect(fullOutput).toEqual('hihi2hi3 <yo>\nyo\n</yo>')

    expect(outputChunks.length).toBeGreaterThan(3)
  })

  test('real world example write to 4 files', async () => {
    // Read the file content directly - no need for complex unescaping
    const response = fs.readFileSync(
      path.join(__dirname, './response-example-4-files.txt'),
      'utf-8'
    )

    // Array to store output chunks as they're produced
    const outputChunks: string[] = []

    // Create a writable stream that captures each output chunk
    const writable = new Writable({
      write(chunk, encoding, callback) {
        const chunkStr = chunk.toString()
        outputChunks.push(chunkStr)
        callback()
      },
    })

    let writeFileStartCount = 0
    let writeFileEndCount = 0
    const testToolRenderers = {
      ...toolRenderers,
      write_file: {
        ...defaultToolCallRenderer,
        onToolStart: (toolName: string) => {
          writeFileStartCount++
          return 'Write File'
        },
        onParamStart: (paramName: string, toolName: string) => {
          return null
        },
        onParamEnd: (paramName: string, toolName: string, content: string) => {
          return null
        },
        onToolEnd: (toolName: string, params: Record<string, string>) => {
          writeFileEndCount++
          return null
        },
      },
    }

    // Create the processor
    const processor = createXMLStreamParser(testToolRenderers)
    processor.pipe(writable)

    processor.write(response)
    processor.end()

    // Wait for the stream to finish
    await new Promise<void>((resolve) => {
      writable.on('finish', resolve)
    })

    // Verify the complete output
    const fullOutput = outputChunks.join('')
    expect(fullOutput).toContain('Write File') // Check for expected output without worrying about formatting
    expect(writeFileEndCount).toBe(4)
    // We expect multiple chunks for a large response
    expect(outputChunks.length).toBeGreaterThan(1)
  })
})
