import fs from 'fs'
import path from 'path'
import { Writable } from 'stream'

// @ts-ignore
import { describe, expect, test } from 'bun:test'
import { getToolCallString } from '@codebuff/common/constants/tools'
import stripAnsi from 'strip-ansi'

import { defaultToolCallRenderer } from '../tool-renderers'
import { createXMLStreamParser } from '../xml-stream-parser'

const toolRenderers = {
  run_terminal_command: defaultToolCallRenderer,
  write_file: defaultToolCallRenderer,
  read_files: defaultToolCallRenderer,
}

describe('Saxy Stream Processor', () => {
  test('pipes output to writable stream', async () => {
    const xml = getToolCallString('run_terminal_command', {
      command: 'echo hello',
    })
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
      getToolCallString('run_terminal_command', { command: 'ls' }) +
      getToolCallString('read_files', { paths: 'file.txt' })
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
      getToolCallString('run_terminal_command', { command: 'ls' }) +
      'Some text between tool calls' +
      getToolCallString('read_files', { paths: 'file.txt' })
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
    const terminalCommand = getToolCallString('run_terminal_command', {
      command: 'npm install',
    })
    const codeSearch = getToolCallString('code_search', { pattern: 'function' })

    // Split the XML into chunks
    const chunks = [
      terminalCommand.slice(0, 15),
      terminalCommand.slice(15, 30),
      terminalCommand.slice(30, 40),
      terminalCommand.slice(40, 50),
      terminalCommand.slice(50),
      codeSearch.slice(0, 15),
      codeSearch.slice(15),
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
    const fullOutput = stripAnsi(outputChunks.join(''))
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

  test('handles xml entities in chunks correctly', async () => {
    // This test demonstrates an issue where chunks containing & are delayed
    const chunks = ['start', ' <tag>before & after</tag> ', 'end']

    const outputChunks: string[] = []

    const writable = new Writable({
      write(chunk, encoding, callback) {
        const chunkStr = chunk.toString()
        outputChunks.push(chunkStr)
        callback()
      },
    })

    const processor = createXMLStreamParser(toolRenderers)
    processor.pipe(writable)

    // Process each chunk with a small delay
    for (const chunk of chunks) {
      processor.write(chunk)
      await new Promise((resolve) => setTimeout(resolve, 5))
    }
    processor.end()

    // Wait for stream to finish
    await new Promise<void>((resolve) => {
      writable.on('finish', resolve)
    })

    // The test should fail because the chunk containing & is delayed
    expect(outputChunks.join('')).toEqual(chunks.join(''))
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
