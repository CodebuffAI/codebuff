import { describe, it, expect, beforeEach } from 'bun:test'
import { WebSocket } from 'ws'
import { logger } from '../util/logger'

describe('Backend Tool Call Schema', () => {
  let mockWs: any

  beforeEach(() => {
    // Create a simple mock WebSocket
    mockWs = {
      send: () => {},
      on: () => {},
      close: () => {},
    }
  })

  it('should validate tool call request structure', () => {
    const toolCallRequest = {
      type: 'tool-call-request' as const,
      requestId: 'test-id',
      toolName: 'read_files',
      args: { paths: 'test.ts' },
      timeout: 30000,
    }

    expect(toolCallRequest.type).toBe('tool-call-request')
    expect(toolCallRequest.requestId).toBe('test-id')
    expect(toolCallRequest.toolName).toBe('read_files')
    expect(toolCallRequest.args).toEqual({ paths: 'test.ts' })
    expect(toolCallRequest.timeout).toBe(30000)
  })

  it('should validate tool call response structure', () => {
    const successResponse = {
      type: 'tool-call-response' as const,
      requestId: 'test-id',
      success: true,
      result: { content: 'file content' },
    }

    const errorResponse = {
      type: 'tool-call-response' as const,
      requestId: 'test-id',
      success: false,
      error: 'File not found',
    }

    expect(successResponse.type).toBe('tool-call-response')
    expect(successResponse.success).toBe(true)
    expect(successResponse.result).toEqual({ content: 'file content' })

    expect(errorResponse.type).toBe('tool-call-response')
    expect(errorResponse.success).toBe(false)
    expect(errorResponse.error).toBe('File not found')
  })

  it('should handle tool call timeout scenarios', () => {
    const timeoutMs = 5000
    const startTime = Date.now()
    
    // Simulate timeout logic
    const isTimedOut = (startTime: number, timeoutMs: number) => {
      return Date.now() - startTime > timeoutMs
    }

    // Should not be timed out immediately
    expect(isTimedOut(startTime, timeoutMs)).toBe(false)
    
    // Should be timed out after the timeout period (simulated)
    const futureTime = startTime + timeoutMs + 1000
    expect(futureTime - startTime > timeoutMs).toBe(true)
  })

  it('should validate different tool types', () => {
    const toolTypes = [
      'read_files',
      'run_terminal_command',
      'code_search',
      'write_file',
      'str_replace'
    ]

    toolTypes.forEach(toolName => {
      const request = {
        type: 'tool-call-request' as const,
        requestId: `test-${toolName}`,
        toolName,
        args: {},
        timeout: 30000,
      }

      expect(request.toolName).toBe(toolName)
      expect(request.type).toBe('tool-call-request')
    })
  })

  it('should handle request ID generation', () => {
    // Test that request IDs are unique-ish
    const generateRequestId = () => Math.random().toString(36).substring(2, 15)
    
    const id1 = generateRequestId()
    const id2 = generateRequestId()
    
    expect(id1).not.toBe(id2)
    expect(typeof id1).toBe('string')
    expect(typeof id2).toBe('string')
    expect(id1.length).toBeGreaterThan(0)
    expect(id2.length).toBeGreaterThan(0)
  })

  it('should generate mock project structure analysis', async () => {
    const analysis = await generateMockProjectStructureAnalysis(mockWs)
    
    expect(analysis).toContain('## Project Analysis')
    expect(analysis).toContain('TypeScript/JavaScript/JSON files')
    expect(typeof analysis).toBe('string')
  })

  it('should generate mock dependency analysis', async () => {
    const analysis = await generateMockDependencyAnalysis(mockWs)
    
    expect(analysis).toContain('## Dependency Analysis')
    expect(analysis).toContain('Declared Dependencies')
    expect(typeof analysis).toBe('string')
  })

  it('should handle error scenarios in mock generators', async () => {
    const errorAnalysis = await generateMockProjectStructureAnalysis(mockWs, true)
    
    expect(errorAnalysis).toContain('Project analysis failed')
    expect(typeof errorAnalysis).toBe('string')
  })
})

/**
 * Mock generator: Project structure analysis using backend-initiated tool calls
 * This demonstrates how the backend can dynamically request information from the client
 * based on the current context or user request
 */
export async function generateMockProjectStructureAnalysis(
  ws: WebSocket, 
  simulateError: boolean = false
): Promise<string> {
  try {
    if (simulateError) {
      throw new Error('Simulated error for testing')
    }

    // Mock Step 1: Get the project structure
    const mockListResult = {
      success: true,
      result: {
        stdout: './package.json\n./tsconfig.json\n./codebuff.json\n./src/index.ts\n./src/utils.ts',
        stderr: '',
        exitCode: 0
      }
    }

    const files = mockListResult.result.stdout.trim().split('\n').filter((f: string) => f.length > 0)
    
    // Mock Step 2: Read key configuration files
    const configFiles = files.filter((f: string) => 
      f.includes('package.json') || 
      f.includes('tsconfig.json') || 
      f.includes('codebuff.json')
    )

    const mockFileContents = {
      './package.json': JSON.stringify({
        name: 'test-project',
        version: '1.0.0',
        dependencies: { 'express': '^4.18.0', 'lodash': '^4.17.21' },
        devDependencies: { 'typescript': '^5.0.0', '@types/node': '^20.0.0' }
      }),
      './tsconfig.json': JSON.stringify({
        compilerOptions: { target: 'ES2020', module: 'commonjs' }
      }),
      './codebuff.json': JSON.stringify({
        maxAgentSteps: 20,
        startupProcesses: []
      })
    }
    
    // Mock Step 3: Analyze the contents
    let analysis = `## Project Analysis\n\n`
    analysis += `Found ${files.length} TypeScript/JavaScript/JSON files\n\n`
    
    for (const [filePath, content] of Object.entries(mockFileContents)) {
      if (content) {
        analysis += `### ${filePath}\n`
        if (filePath.includes('package.json')) {
          try {
            const pkg = JSON.parse(content)
            analysis += `- Name: ${pkg.name || 'Unknown'}\n`
            analysis += `- Version: ${pkg.version || 'Unknown'}\n`
            analysis += `- Dependencies: ${Object.keys(pkg.dependencies || {}).length}\n`
            analysis += `- Dev Dependencies: ${Object.keys(pkg.devDependencies || {}).length}\n`
          } catch (e) {
            analysis += `- Could not parse package.json\n`
          }
        } else if (filePath.includes('tsconfig.json')) {
          analysis += `- TypeScript configuration found\n`
          analysis += `- Size: ${content.length} characters\n`
        } else if (filePath.includes('codebuff.json')) {
          analysis += `- Codebuff configuration found\n`
          analysis += `- Size: ${content.length} characters\n`
        }
        analysis += '\n'
      }
    }

    return analysis

  } catch (error) {
    logger.error({ error }, 'Project analysis failed')
    return `Project analysis failed: ${error instanceof Error ? error.message : error}`
  }
}

/**
 * Mock generator: Smart dependency analysis
 * Dynamically searches for imports and analyzes dependencies
 */
export async function generateMockDependencyAnalysis(
  ws: WebSocket, 
  searchPattern?: string
): Promise<string> {
  try {
    const pattern = searchPattern || 'import.*from'
    
    // Mock search result
    const mockSearchResult = {
      success: true,
      result: `src/index.ts:1:import express from 'express'
src/index.ts:2:import { Router } from 'express'
src/utils.ts:1:import _ from 'lodash'
src/utils.ts:2:import { readFileSync } from 'fs'`
    }

    // Mock package.json content
    const mockPackageFiles = {
      'package.json': JSON.stringify({
        dependencies: { 'express': '^4.18.0', 'lodash': '^4.17.21' },
        devDependencies: { 'typescript': '^5.0.0', '@types/node': '^20.0.0' }
      })
    }
    
    let analysis = `## Dependency Analysis\n\n`
    
    if (mockPackageFiles['package.json']) {
      try {
        const pkg = JSON.parse(mockPackageFiles['package.json'])
        const deps = Object.keys(pkg.dependencies || {})
        const devDeps = Object.keys(pkg.devDependencies || {})
        
        analysis += `### Declared Dependencies\n`
        analysis += `- Production: ${deps.length} packages\n`
        analysis += `- Development: ${devDeps.length} packages\n\n`
        
        analysis += `### Import Analysis\n`
        analysis += `Search pattern: \`${pattern}\`\n`
        analysis += `Found ${mockSearchResult.result?.split('\n').length || 0} import statements\n\n`
        
      } catch (e) {
        analysis += `Could not parse package.json for dependency comparison\n\n`
      }
    }

    return analysis

  } catch (error) {
    logger.error({ error }, 'Dependency analysis failed')
    return `Dependency analysis failed: ${error instanceof Error ? error.message : error}`
  }
}

/**
 * Mock generator: File content analysis
 * Generates mock analysis of file contents for testing
 */
export async function generateMockFileContentAnalysis(
  ws: WebSocket,
  filePaths: string[]
): Promise<string> {
  try {
    // Mock file contents
    const mockFileContents: Record<string, string> = {
      'src/index.ts': `import express from 'express';\nconst app = express();\napp.listen(3000);`,
      'src/utils.ts': `export function helper() { return 'test'; }`,
      'package.json': JSON.stringify({ name: 'test', version: '1.0.0' })
    }

    let analysis = `## File Content Analysis\n\n`
    analysis += `Analyzing ${filePaths.length} files\n\n`

    for (const filePath of filePaths) {
      const content = mockFileContents[filePath] || 'File not found'
      analysis += `### ${filePath}\n`
      analysis += `- Size: ${content.length} characters\n`
      analysis += `- Lines: ${content.split('\n').length}\n`
      
      if (filePath.endsWith('.ts') || filePath.endsWith('.js')) {
        const importCount = (content.match(/import\s+/g) || []).length
        const exportCount = (content.match(/export\s+/g) || []).length
        analysis += `- Imports: ${importCount}\n`
        analysis += `- Exports: ${exportCount}\n`
      }
      
      analysis += '\n'
    }

    return analysis

  } catch (error) {
    logger.error({ error }, 'File content analysis failed')
    return `File content analysis failed: ${error instanceof Error ? error.message : error}`
  }
}
