import * as path from 'path'
import * as fs from 'fs'
import { describe, it, expect } from 'bun:test'
import { execSync } from 'child_process'

// Sample code snippets for each language
const samples = {
  typescript: `
interface Greeter {
    greet(name: string): string;
}

class HelloGreeter implements Greeter {
    greet(name: string): string {
        return \`Hello, \${name}!\`;
    }
}

function createGreeter(): Greeter {
    return new HelloGreeter();
}

const greeter = createGreeter();
greeter.greet("World");
`,

  javascript: `
class Greeter {
    greet(name) {
        return \`Hello, \${name}!\`;
    }
}

function createGreeter() {
    return new Greeter();
}

const greeter = createGreeter();
greeter.greet("World");
`,

  python: `
from abc import ABC, abstractmethod

class Greeter(ABC):
    @abstractmethod
    def greet(self, name: str) -> str:
        pass

class HelloGreeter(Greeter):
    def greet(self, name: str) -> str:
        return f"Hello, {name}!"

def create_greeter() -> Greeter:
    return HelloGreeter()

greeter = create_greeter()
greeter.greet("World")
`,

  java: `
interface Greeter {
    String greet(String name);
}

class HelloGreeter implements Greeter {
    public String greet(String name) {
        return "Hello, " + name + "!";
    }
}

public class Main {
    public static Greeter createGreeter() {
        return new HelloGreeter();
    }

    public static void main(String[] args) {
        Greeter greeter = createGreeter();
        greeter.greet("World");
    }
}
`,

  csharp: `
interface IGreeter {
    string Greet(string name);
}

class HelloGreeter : IGreeter {
    public string Greet(string name) {
        return $"Hello, {name}!";
    }
}

class Program {
    static IGreeter CreateGreeter() {
        return new HelloGreeter();
    }

    static void Main() {
        var greeter = CreateGreeter();
        greeter.Greet("World");
    }
}
`,

  cpp: `
class Greeter {
public:
    virtual std::string greet(const std::string& name) = 0;
};

class HelloGreeter : public Greeter {
public:
    std::string greet(const std::string& name) override {
        return "Hello, " + name + "!";
    }
};

Greeter* createGreeter() {
    return new HelloGreeter();
}

int main() {
    auto greeter = createGreeter();
    greeter->greet("World");
    delete greeter;
    return 0;
}
`,

  c: `
typedef struct Greeter {
    void (*greet)(const char* name);
} Greeter;

void hello_greet(const char* name) {
    printf("Hello, %s!\\n", name);
}

Greeter* create_greeter() {
    Greeter* greeter = malloc(sizeof(Greeter));
    greeter->greet = hello_greet;
    return greeter;
}

int main() {
    Greeter* greeter = create_greeter();
    greeter->greet("World");
    free(greeter);
    return 0;
}
`,

  rust: `
trait Greeter {
    fn greet(&self, name: &str) -> String;
}

struct HelloGreeter;

impl Greeter for HelloGreeter {
    fn greet(&self, name: &str) -> String {
        format!("Hello, {}!", name)
    }
}

fn create_greeter() -> impl Greeter {
    HelloGreeter
}

fn main() {
    let greeter = create_greeter();
    greeter.greet("World");
}
`,

  ruby: `
class Greeter
  def greet(name)
    "Hello, #{name}!"
  end
end

def create_greeter
  Greeter.new
end

greeter = create_greeter
greeter.greet("World")
`,

  go: `
package main

type Greeter interface {
    Greet(name string) string
}

type HelloGreeter struct{}

func (g HelloGreeter) Greet(name string) string {
    return "Hello, " + name + "!"
}

func createGreeter() Greeter {
    return HelloGreeter{}
}

func main() {
    greeter := createGreeter()
    greeter.Greet("World")
}
`,

  php: `
<?php

interface Greeter {
    public function greet(string $name): string;
}

class HelloGreeter implements Greeter {
    public function greet(string $name): string {
        return "Hello, $name!";
    }
}

function createGreeter(): Greeter {
    return new HelloGreeter();
}

$greeter = createGreeter();
$greeter->greet("World");
`
}

// Helper function to run tree-sitter parsing in a separate Node process
async function parseFile(filePath: string, content: string) {
  const tempScriptPath = path.join(__dirname, 'temp-parse-file.js')
  const scriptContent = `
const Parser = require('tree-sitter')
const { Query } = require('tree-sitter')

// Language configs
const languageConfigs = [
  {
    extensions: ['.ts', '.tsx'],
    queryFile: 'tree-sitter-typescript-tags.scm',
    packageName: 'tree-sitter-typescript',
    getLanguage: (module) => module.typescript
  },
  {
    extensions: ['.js', '.jsx'],
    queryFile: 'tree-sitter-javascript-tags.scm',
    packageName: 'tree-sitter-javascript',
    getLanguage: (module) => module
  },
  {
    extensions: ['.py'],
    queryFile: 'tree-sitter-python-tags.scm',
    packageName: 'tree-sitter-python',
    getLanguage: (module) => module
  },
  {
    extensions: ['.java'],
    queryFile: 'tree-sitter-java-tags.scm',
    packageName: 'tree-sitter-java',
    getLanguage: (module) => module
  },
  {
    extensions: ['.cs'],
    queryFile: 'tree-sitter-c_sharp-tags.scm',
    packageName: 'tree-sitter-c-sharp',
    getLanguage: (module) => module
  },
  {
    extensions: ['.cpp', '.hpp'],
    queryFile: 'tree-sitter-cpp-tags.scm',
    packageName: 'tree-sitter-cpp',
    getLanguage: (module) => module
  },
  {
    extensions: ['.c', '.h'],
    queryFile: 'tree-sitter-c-tags.scm',
    packageName: 'tree-sitter-c',
    getLanguage: (module) => module
  },
  {
    extensions: ['.rs'],
    queryFile: 'tree-sitter-rust-tags.scm',
    packageName: 'tree-sitter-rust',
    getLanguage: (module) => module
  },
  {
    extensions: ['.rb'],
    queryFile: 'tree-sitter-ruby-tags.scm',
    packageName: 'tree-sitter-ruby',
    getLanguage: (module) => module
  },
  {
    extensions: ['.go'],
    queryFile: 'tree-sitter-go-tags.scm',
    packageName: 'tree-sitter-go',
    getLanguage: (module) => module
  },
  {
    extensions: ['.php'],
    queryFile: 'tree-sitter-php-tags.scm',
    packageName: 'tree-sitter-php',
    getLanguage: (module) => module.php
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

    // Execute the script with node and capture output
    const output = execSync(
      `node "${tempScriptPath}" "${filePath}" "${content.replace(/"/g, '\\"')}"`,
      {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe']
      }
    ).toString()

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

describe('language parsing', () => {
  it('should parse TypeScript', async () => {
    const result = await parseFile('test.ts', samples.typescript)
    
    expect(result.identifiers).toContain('Greeter')
    expect(result.identifiers).toContain('HelloGreeter')
    expect(result.identifiers).toContain('createGreeter')
    expect(result.identifiers).toContain('greet')
    
    expect(result.calls).toContain('HelloGreeter')
    expect(result.calls).toContain('createGreeter')
    expect(result.calls).toContain('greet')
  })

  it('should parse JavaScript', async () => {
    const result = await parseFile('test.js', samples.javascript)
    
    expect(result.identifiers).toContain('Greeter')
    expect(result.identifiers).toContain('createGreeter')
    expect(result.identifiers).toContain('greet')
    
    expect(result.calls).toContain('Greeter')
    expect(result.calls).toContain('createGreeter')
    expect(result.calls).toContain('greet')
  })

  it('should parse Python', async () => {
    const result = await parseFile('test.py', samples.python)
    
    expect(result.identifiers).toContain('Greeter')
    expect(result.identifiers).toContain('HelloGreeter')
    expect(result.identifiers).toContain('create_greeter')
    expect(result.identifiers).toContain('greet')
    
    expect(result.calls).toContain('create_greeter')
    expect(result.calls).toContain('greet')
  })

  it('should parse Java', async () => {
    const result = await parseFile('test.java', samples.java)
    
    expect(result.identifiers).toContain('Greeter')
    expect(result.identifiers).toContain('HelloGreeter')
    expect(result.identifiers).toContain('createGreeter')
    expect(result.identifiers).toContain('greet')
    
    expect(result.calls).toContain('HelloGreeter')
    expect(result.calls).toContain('createGreeter')
    expect(result.calls).toContain('greet')
  })

  it('should parse C#', async () => {
    const result = await parseFile('test.cs', samples.csharp)
    
    expect(result.identifiers).toContain('IGreeter')
    expect(result.identifiers).toContain('HelloGreeter')
    expect(result.identifiers).toContain('CreateGreeter')
    expect(result.identifiers).toContain('Greet')
  })

  it('should parse C++', async () => {
    const result = await parseFile('test.cpp', samples.cpp)
    
    expect(result.identifiers).toContain('Greeter')
    expect(result.identifiers).toContain('HelloGreeter')
    expect(result.identifiers).toContain('createGreeter')
    expect(result.identifiers).toContain('greet')
  })

  it('should parse C', async () => {
    const result = await parseFile('test.c', samples.c)
    
    expect(result.identifiers).toContain('Greeter')
    expect(result.identifiers).toContain('create_greeter')
    expect(result.identifiers).toContain('hello_greet')
  })

  it('should parse Rust', async () => {
    const result = await parseFile('test.rs', samples.rust)
    
    expect(result.identifiers).toContain('Greeter')
    expect(result.identifiers).toContain('HelloGreeter')
    expect(result.identifiers).toContain('create_greeter')
    expect(result.identifiers).toContain('greet')
    
    expect(result.calls).toContain('create_greeter')
    expect(result.calls).toContain('greet')
  })

  it('should parse Ruby', async () => {
    const result = await parseFile('test.rb', samples.ruby)
    
    expect(result.identifiers).toContain('Greeter')
    expect(result.identifiers).toContain('create_greeter')
    expect(result.identifiers).toContain('greet')
    
    expect(result.calls).toContain('create_greeter')
    expect(result.calls).toContain('greet')
    expect(result.calls).toContain('new')
  })

  it('should parse Go', async () => {
    const result = await parseFile('test.go', samples.go)
    
    expect(result.identifiers).toContain('Greeter')
    expect(result.identifiers).toContain('HelloGreeter')
    expect(result.identifiers).toContain('createGreeter')
    expect(result.identifiers).toContain('Greet')
    
    expect(result.calls).toContain('createGreeter')
    expect(result.calls).toContain('Greet')
  })

  it.skip('should parse PHP', async () => {
    const result = await parseFile('test.php', samples.php)
    
    expect(result.identifiers).toContain('Greeter')
    expect(result.identifiers).toContain('HelloGreeter')
    expect(result.identifiers).toContain('createGreeter')
    expect(result.identifiers).toContain('greet')
    
    expect(result.calls).toContain('HelloGreeter')
    expect(result.calls).toContain('createGreeter')
    expect(result.calls).toContain('greet')
  })

  it('should handle empty files', async () => {
    const result = await parseFile('empty.ts', '')
    expect(result.identifiers).toHaveLength(0)
    expect(result.calls).toHaveLength(0)
  })

  it('should handle invalid file extensions', async () => {
    const result = await parseFile('test.invalid', samples.typescript)
    expect(result.identifiers).toHaveLength(0)
    expect(result.calls).toHaveLength(0)
  })
})