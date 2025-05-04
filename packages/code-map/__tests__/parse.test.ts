import * as path from 'path'
import * as fs from 'fs'
import { describe, it, expect } from 'bun:test'
import { execSync } from 'child_process'

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

// Helper function to run tree-sitter parsing in a separate Node process
async function parseFile(filePath: string, content: string) {
  const tempScriptPath = path.join(__dirname, 'temp-parse-file.js')
  const scriptContent = `
const Parser = require('tree-sitter')
const { Query } = require('tree-sitter')

// Language configs (simplified from languages.ts)
const languageConfigs = [
  {
    extensions: ['.ts', '.tsx'],
    queryFile: 'tree-sitter-typescript-tags.scm',
    packageName: 'tree-sitter-typescript',
    getLanguage: (module) => module.typescript
  },
  {
    extensions: ['.py'],
    queryFile: 'tree-sitter-python-tags.scm',
    packageName: 'tree-sitter-python',
    getLanguage: (module) => module
  }
]

async function parseSourceCode(filePath, sourceCode) {
  const extension = require('path').extname(filePath)
  const config = languageConfigs.find(c => c.extensions.includes(extension))
  if (!config) return { identifiers: [], calls: [] }

  try {
    const parser = new Parser()
    const languageModule = require(config.packageName)
    const language = config.getLanguage(languageModule)
    parser.setLanguage(language)

    const queryFilePath = require('path').join(__dirname, '../tree-sitter-queries', config.queryFile)
    const queryString = require('fs').readFileSync(queryFilePath, 'utf8')
    const query = new Query(parser.getLanguage(), queryString)

    const tree = parser.parse(sourceCode)
    const captures = query.captures(tree.rootNode)

    const result = {}
    for (const capture of captures) {
      const { name, node } = capture
      if (!result[name]) {
        result[name] = []
      }
      result[name].push(node.text)
    }

    return {
      identifiers: [...new Set(result.identifier || [])],
      calls: [...new Set(result['call.identifier'] || [])]
    }
  } catch (err) {
    console.error('Error:', err)
    return { identifiers: [], calls: [] }
  }
}

const filePath = process.argv[2]
const sourceCode = process.argv[3]

parseSourceCode(filePath, sourceCode)
  .then(result => {
    console.log(JSON.stringify(result))
  })
  .catch(err => {
    console.error('Error:', err)
    process.exit(1)
  })
`

  try {
    // Write the temporary script
    fs.writeFileSync(tempScriptPath, scriptContent)

    // Execute the script with node
    const output = execSync(
      `node "${tempScriptPath}" "${filePath}" "${content.replace(/"/g, '\\"')}"`,
      {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe']
      }
    )

    // Parse the JSON output
    return JSON.parse(output)
  } finally {
    // Clean up the temporary script
    try {
      fs.unlinkSync(tempScriptPath)
    } catch (err) {
      console.warn('Failed to clean up temporary script:', err)
    }
  }
}

describe('tree-sitter parsing', () => {
  it('should correctly identify tokens and calls in TypeScript', async () => {
    const result = await parseFile('test.ts', tsFile)

    // Check identifiers
    expect(result.identifiers).toContain('Greeter')
    expect(result.identifiers).toContain('Greeting')
    expect(result.identifiers).toContain('createGreeter')
    expect(result.identifiers).toContain('greet')
    expect(result.identifiers).toContain('printGreeting')

    // Check calls
    expect(result.calls).toContain('createGreeter')
    expect(result.calls).toContain('printGreeting')
    expect(result.calls).toContain('greet')
  })

  it('should correctly identify tokens and calls in Python', async () => {
    const result = await parseFile('test.py', pyFile)

    // Check identifiers
    expect(result.identifiers).toContain('Greeter')
    expect(result.identifiers).toContain('Greeting')
    expect(result.identifiers).toContain('print_greeting')
    expect(result.identifiers).toContain('greet')

    // Check calls
    expect(result.calls).toContain('print_greeting')
    expect(result.calls).toContain('greet')
  })

  it('should handle empty files', async () => {
    const result = await parseFile('empty.ts', emptyFile)

    expect(result.identifiers).toHaveLength(0)
    expect(result.calls).toHaveLength(0)
  })
})
