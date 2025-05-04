import * as path from 'path'
import { describe, it, expect, beforeAll, mock } from 'bun:test'
import { getFileTokenScores } from '../parse'
import { PathOrFileDescriptor } from 'node:fs'

// Test data
const tsFile = `
interface Greeter {
    greet(name: string): string;
}

class Greeting implements Greeter {
    private prefix: string;

    constructor(prefix: string) {
        this.prefix = prefix;
    }

    greet(name: string): string {
        return \`\${this.prefix}, \${name}!\`;
    }

    static printGreeting(greeter: Greeter, name: string): void {
        console.log(greeter.greet(name));
    }
}

function createGreeter(prefix: string): Greeter {
    return new Greeting(prefix);
}

const greeting = createGreeter('Hello');
Greeting.printGreeting(greeting, 'World');
`

const pyFile = `
from abc import ABC, abstractmethod

class Greeter(ABC):
    @abstractmethod
    def greet(self, name: str) -> str:
        pass

class Greeting(Greeter):
    def __init__(self, prefix: str):
        self.prefix = prefix

    def greet(self, name: str) -> str:
        return f'{self.prefix}, {name}!'

def print_greeting(greeter: Greeter, name: str):
    print(greeter.greet(name))

if __name__ == "__main__":
    greeting = Greeting("Hello")
    print_greeting(greeting, "World")
`

const multiDefFile1 = `
export function utils() {
    console.log('utils from file 1');
}
`

const multiDefFile2 = `
// This file is deeper in the directory structure, so it will have a lower base score
export function utils() {
    console.log('utils from file 2');
}
`

const noDefsOnlyCallsFile = `
import { utils } from './utils';
utils();
console.log('no definitions here');
`

const noCallsOnlyDefsFile = `
export function unusedFunction() {
    console.log('never called');
}
`

const emptyFile = ''

// Pre-read query files
let tsQueryFile: string
let pyQueryFile: string

beforeAll(async () => {
  tsQueryFile = await Bun.file(
    path.join(__dirname, '../tree-sitter-queries/tree-sitter-typescript-tags.scm')
  ).text()
  pyQueryFile = await Bun.file(
    path.join(__dirname, '../tree-sitter-queries/tree-sitter-python-tags.scm')
  ).text()

  // Mock fs module to handle virtual test files and query files
  mock.module('fs', () => ({
    readFileSync: ((
      filePath: PathOrFileDescriptor,
      options?:
        | { encoding?: BufferEncoding | null; flag?: string }
        | BufferEncoding
        | null
    ): string | Buffer => {
      const filePathStr = filePath.toString()

      // Handle query files first
      if (filePathStr.includes('tree-sitter-typescript-tags.scm')) {
        return tsQueryFile
      }
      if (filePathStr.includes('tree-sitter-python-tags.scm')) {
        return pyQueryFile
      }

      const fileName = path.basename(filePathStr)
      let content: string

      switch (fileName) {
        case 'test.ts':
          content = tsFile
          break
        case 'test.py':
          content = pyFile
          break
        case 'utils1.ts':
          content = multiDefFile1
          break
        case 'utils2.ts':
          content = multiDefFile2
          break
        case 'consumer.ts':
          content = noDefsOnlyCallsFile
          break
        case 'unused.ts':
          content = noCallsOnlyDefsFile
          break
        case 'empty.ts':
          content = emptyFile
          break
        default:
          // Return empty string for unknown files instead of throwing
          content = ''
      }

      // Match fs.readFileSync's behavior:
      // - Return string if encoding is specified
      // - Return Buffer if no encoding or encoding is null
      if (typeof options === 'string') {
        return content
      }
      if (options && typeof options === 'object' && options.encoding) {
        return content
      }
      return Buffer.from(content)
    })
  }))
})

describe('getFileTokenScores', () => {
  it.skip('should correctly identify tokens and calls in TypeScript', async () => {
    const result = await getFileTokenScores('/root', ['test.ts'])

    // Check token identification
    expect(result.tokenScores['test.ts']).toHaveProperty('Greeter')
    expect(result.tokenScores['test.ts']).toHaveProperty('Greeting')
    expect(result.tokenScores['test.ts']).toHaveProperty('createGreeter')
    expect(result.tokenScores['test.ts']).toHaveProperty('greet')
    expect(result.tokenScores['test.ts']).toHaveProperty('printGreeting')

    // Check calls
    expect(result.tokenCallers['test.ts']['Greeting']).toContain('test.ts')
    expect(result.tokenCallers['test.ts']['createGreeter']).toContain('test.ts')
    expect(result.tokenCallers['test.ts']['printGreeting']).toContain('test.ts')
    expect(result.tokenCallers['test.ts']['greet']).toContain('test.ts')
  })

  it.skip('should correctly identify tokens and calls in Python', async () => {
    const result = await getFileTokenScores('/root', ['test.py'])

    // Check token identification
    expect(result.tokenScores['test.py']).toHaveProperty('Greeter')
    expect(result.tokenScores['test.py']).toHaveProperty('Greeting')
    expect(result.tokenScores['test.py']).toHaveProperty('print_greeting')
    expect(result.tokenScores['test.py']).toHaveProperty('greet')

    // Check calls
    expect(result.tokenCallers['test.py']['Greeting']).toContain('test.py')
    expect(result.tokenCallers['test.py']['print_greeting']).toContain(
      'test.py'
    )
    expect(result.tokenCallers['test.py']['greet']).toContain('test.py')
  })

  it.skip('should use highest scoring definition when token is defined in multiple files', async () => {
    const result = await getFileTokenScores('/root', [
      'utils1.ts',
      'deep/utils2.ts',
      'consumer.ts',
    ])

    // utils1.ts has a higher score (shallower path)
    expect(result.tokenCallers['utils1.ts']['utils']).toContain('consumer.ts')
    // utils2.ts should not be chosen as the defining file
    expect(result.tokenCallers['deep/utils2.ts']['utils']).toBeUndefined()
  })

  it('should handle files with no definitions', async () => {
    const result = await getFileTokenScores('/root', ['consumer.ts'])

    // No definitions, only calls
    expect(Object.keys(result.tokenScores['consumer.ts'])).toHaveLength(0)
    // External calls are tracked but not mapped to callers since definition is unknown
    expect(Object.keys(result.tokenCallers)).toHaveLength(0)
  })

  it.skip('should handle files with no calls', async () => {
    const result = await getFileTokenScores('/root', ['unused.ts'])

    // Has definition but no calls
    expect(result.tokenScores['unused.ts']).toHaveProperty('unusedFunction')
    expect(result.tokenCallers['unused.ts']['unusedFunction']).toEqual([])
  })

  it('should handle empty files', async () => {
    const result = await getFileTokenScores('/root', ['empty.ts'])

    // No definitions or calls
    expect(Object.keys(result.tokenScores['empty.ts'] || {})).toHaveLength(0)
    expect(Object.keys(result.tokenCallers)).toHaveLength(0)
  })
})
