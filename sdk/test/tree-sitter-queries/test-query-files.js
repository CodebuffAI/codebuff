// Test that tree-sitter query files are properly bundled and functional
const fs = require('fs')
const path = require('path')
const os = require('os')

// Import the SDK functionality we want to test
const { initialSessionState } = require('@codebuff/sdk')

// Create sample source files for different languages to test tree-sitter parsing
const testSourceFiles = {
  'calculator.ts': `
export class Calculator {
  private history: number[] = []
  
  add(a: number, b: number): number {
    const result = a + b
    this.history.push(result)
    return result
  }
  
  getHistory(): number[] {
    return this.history
  }
}

export function calculateSum(numbers: number[]): number {
  return numbers.reduce((sum, num) => sum + num, 0)
}
`,
  'server.py': `
import flask
from typing import List, Dict

class UserService:
    def __init__(self):
        self.users: Dict[str, str] = {}
    
    def create_user(self, username: str, email: str) -> bool:
        if username in self.users:
            return False
        self.users[username] = email
        return True
    
    def get_user(self, username: str) -> str:
        return self.users.get(username, '')

def process_data(items: List[str]) -> List[str]:
    return [item.strip().lower() for item in items]

app = flask.Flask(__name__)
user_service = UserService()
`,
  'utils.go': `
package utils

import (
    "fmt"
    "strings"
)

type Config struct {
    Host string
    Port int
    Debug bool
}

func NewConfig(host string, port int) *Config {
    return &Config{
        Host: host,
        Port: port,
        Debug: false,
    }
}

func (c *Config) GetAddress() string {
    return fmt.Sprintf("%s:%d", c.Host, c.Port)
}

func ProcessString(input string) string {
    return strings.TrimSpace(strings.ToLower(input))
}
`,
  'api.js': `
const express = require('express')
const axios = require('axios')

class ApiClient {
  constructor(baseURL, timeout = 5000) {
    this.baseURL = baseURL
    this.timeout = timeout
    this.client = axios.create({ baseURL, timeout })
  }
  
  async fetchData(endpoint) {
    try {
      const response = await this.client.get(endpoint)
      return response.data
    } catch (error) {
      console.error('API Error:', error.message)
      throw error
    }
  }
  
  async postData(endpoint, data) {
    return await this.client.post(endpoint, data)
  }
}

function createApp() {
  const app = express()
  app.use(express.json())
  return app
}

module.exports = { ApiClient, createApp }
`
}

async function testTreeSitterFunctionality() {
  console.log('🧪 Testing tree-sitter functionality with real source files...')
  
  // Create a temporary directory for our test
  const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk-tree-sitter-test-'))
  
  try {
    // Write test source files to temporary directory
    for (const [fileName, content] of Object.entries(testSourceFiles)) {
      const filePath = path.join(testDir, fileName)
      fs.writeFileSync(filePath, content)
    }
    
    console.log(`✅ Created test files in: ${testDir}`)
    
    // Test initialSessionState with our test files
    const sessionState = await initialSessionState(testDir, {
      projectFiles: testSourceFiles,
      knowledgeFiles: {},
      agentDefinitions: [],
      customToolDefinitions: [],
      maxAgentSteps: 25
    })
    
    console.log('✅ initialSessionState completed successfully')
    
    // Verify that fileTokenScores were generated
    const fileTokenScores = sessionState.fileContext.fileTokenScores
    
    if (!fileTokenScores || Object.keys(fileTokenScores).length === 0) {
      throw new Error('fileTokenScores is empty - tree-sitter parsing failed')
    }
    
    console.log(`✅ Generated token scores for ${Object.keys(fileTokenScores).length} files`)
    
    // Test each language file and verify expected tokens were found
    const expectedTokens = {
      'calculator.ts': ['Calculator', 'add', 'getHistory', 'calculateSum'],
      'server.py': ['UserService', 'create_user', 'get_user', 'process_data'],
      'utils.go': ['Config', 'NewConfig', 'GetAddress', 'ProcessString'],
      'api.js': ['ApiClient', 'fetchData', 'postData', 'createApp']
    }
    
    for (const [fileName, expectedTokensForFile] of Object.entries(expectedTokens)) {
      const tokensForFile = fileTokenScores[fileName]
      
      if (!tokensForFile) {
        throw new Error(`No tokens found for ${fileName} - tree-sitter parsing may have failed`)
      }
      
      const foundTokens = Object.keys(tokensForFile)
      const missingTokens = expectedTokensForFile.filter(token => !foundTokens.includes(token))
      
      if (missingTokens.length > 0) {
        console.warn(`⚠️  Missing expected tokens in ${fileName}: ${missingTokens.join(', ')}`)
        console.warn(`   Found tokens: ${foundTokens.slice(0, 10).join(', ')}${foundTokens.length > 10 ? '...' : ''}`)
      } else {
        console.log(`✅ ${fileName}: Found all expected tokens (${foundTokens.length} total)`)
      }
      
      // Verify that tokens have meaningful scores
      const tokenScores = Object.values(tokensForFile)
      const nonZeroScores = tokenScores.filter(score => score > 0)
      
      if (nonZeroScores.length === 0) {
        throw new Error(`All token scores are zero for ${fileName} - scoring logic may be broken`)
      }
      
      console.log(`✅ ${fileName}: ${nonZeroScores.length}/${tokenScores.length} tokens have positive scores`)
    }
    
    // Test that tokenCallers were generated (shows cross-file analysis works)
    const tokenCallers = sessionState.fileContext.tokenCallers
    if (tokenCallers && Object.keys(tokenCallers).length > 0) {
      console.log(`✅ Generated token callers for ${Object.keys(tokenCallers).length} files`)
    } else {
      console.log('ℹ️  No token callers generated (expected for single-file test)')
    }
    
    return true
    
  } finally {
    // Clean up temporary directory
    try {
      fs.rmSync(testDir, { recursive: true, force: true })
      console.log('✅ Cleaned up test files')
    } catch (error) {
      console.warn('⚠️  Failed to clean up test directory:', error.message)
    }
  }
}

function testQueryFilesExist() {
  console.log('🧪 Testing tree-sitter query files exist...')
  
  // Test for both CJS and ESM builds
  const testPaths = [
    // CJS build location
    path.join(__dirname, '../../dist/tree-sitter-queries'),
    // Alternative path for different build configurations
    path.join(__dirname, '../../tree-sitter-queries'),
  ]
  
  const expectedFiles = [
    'tree-sitter-c-tags.scm',
    'tree-sitter-c_sharp-tags.scm', 
    'tree-sitter-cpp-tags.scm',
    'tree-sitter-go-tags.scm',
    'tree-sitter-java-tags.scm',
    'tree-sitter-javascript-tags.scm',
    'tree-sitter-php-tags.scm',
    'tree-sitter-python-tags.scm',
    'tree-sitter-ruby-tags.scm',
    'tree-sitter-rust-tags.scm',
    'tree-sitter-typescript-tags.scm',
    'readme.md'
  ]
  
  let foundPath = null
  
  // Find the correct path where query files exist
  for (const testPath of testPaths) {
    if (fs.existsSync(testPath)) {
      foundPath = testPath
      break
    }
  }
  
  if (!foundPath) {
    throw new Error(`Tree-sitter query directory not found in any of: ${testPaths.join(', ')}`)
  }
  
  console.log(`✅ Found tree-sitter queries directory at: ${foundPath}`)
  
  // Check that all expected files exist
  const actualFiles = fs.readdirSync(foundPath)
  const missingFiles = expectedFiles.filter(file => !actualFiles.includes(file))
  
  if (missingFiles.length > 0) {
    throw new Error(`Missing tree-sitter query files: ${missingFiles.join(', ')}`)
  }
  
  console.log(`✅ All ${expectedFiles.length} expected query files found`)
  
  // Test that files have content and are readable
  for (const file of expectedFiles) {
    if (file.endsWith('.scm')) {
      const filePath = path.join(foundPath, file)
      const content = fs.readFileSync(filePath, 'utf8')
      
      if (content.length === 0) {
        throw new Error(`Query file ${file} is empty`)
      }
      
      // Basic validation that it looks like a tree-sitter query
      if (!content.includes('(') || !content.includes(')')) {
        throw new Error(`Query file ${file} doesn't appear to be a valid tree-sitter query`)
      }
      
      console.log(`✅ Query file ${file} is valid (${content.length} bytes)`)
    }
  }
  
  // Test that readme.md exists and has content
  const readmePath = path.join(foundPath, 'readme.md')
  const readmeContent = fs.readFileSync(readmePath, 'utf8')
  if (readmeContent.length === 0) {
    throw new Error('readme.md is empty')
  }
  
  console.log('✅ readme.md exists and has content')
  
  return true
}

// Run the tests
async function runAllTests() {
  try {
    // Test 1: Verify query files exist and are readable
    testQueryFilesExist()
    console.log('\n')
    
    // Test 2: Test actual tree-sitter functionality
    await testTreeSitterFunctionality()
    
    console.log('\n🎉 All tree-sitter query file tests passed!')
    console.log('   ✅ Query files are properly bundled')
    console.log('   ✅ Tree-sitter parsing works with real source files')
    console.log('   ✅ Token scores are generated correctly')
    process.exit(0)
  } catch (error) {
    console.error('\n❌ Tree-sitter query file test failed:', error.message)
    if (error.stack) {
      console.error('Stack trace:', error.stack)
    }
    process.exit(1)
  }
}

// Run async tests
runAllTests()
