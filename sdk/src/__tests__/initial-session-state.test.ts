import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import os from 'os'
import path from 'path'

import { describe, expect, test, beforeEach } from 'bun:test'
import { z } from 'zod/v4'

import { initialSessionState } from '../run-state'

import type { MockStatResult } from '@codebuff/common/testing/mock-types'
import type { Logger } from '@codebuff/common/types/contracts/logger'
import type { CodebuffFileSystem } from '@codebuff/common/types/filesystem'

describe('Initial Session State', () => {
  let mockFs: CodebuffFileSystem
  let mockLogger: Logger

  beforeEach(() => {
    mockFs = {
      readFile: async (path: string) => {
        if (path.includes('src/index.ts')) {
          return 'console.log("Hello world");'
        }
        if (path.includes('src/utils.ts')) {
          return 'export function add(a: number, b: number) { return a + b; }'
        }
        if (path.includes('knowledge.md')) {
          return '# Knowledge\n\nThis is a knowledge file.'
        }
        if (path.includes('README.md')) {
          return '# Project\n\nThis is a readme.'
        }
        if (path.includes('.gitignore')) {
          return 'node_modules/\n.git/'
        }
        if (path.includes('.codebuffignore')) {
          return ''
        }
        if (path.includes('.manicodeignore')) {
          return ''
        }
        throw new Error(`File not found: ${path}`)
      },
      readdir: async (path: string) => {
        if (path.includes('test-project')) {
          return [
            { name: 'src', isDirectory: () => true, isFile: () => false },
            { name: '.git', isDirectory: () => true, isFile: () => false },
            {
              name: 'knowledge.md',
              isDirectory: () => false,
              isFile: () => true,
            },
            { name: 'README.md', isDirectory: () => false, isFile: () => true },
            {
              name: '.gitignore',
              isDirectory: () => false,
              isFile: () => true,
            },
          ]
        }
        if (path.includes('src')) {
          return [
            { name: 'index.ts', isDirectory: () => false, isFile: () => true },
            { name: 'utils.ts', isDirectory: () => false, isFile: () => true },
          ]
        }
        return []
      },
      stat: async (path: string): Promise<MockStatResult> => ({
        isDirectory: () => path.includes('src') || path.includes('.git'),
        isFile: () => !path.includes('src') && !path.includes('.git'),
      }),
      exists: async (path: string) => {
        if (path.includes('.gitignore')) return true
        if (path.includes('.codebuffignore')) return true
        if (path.includes('.manicodeignore')) return true
        if (path.includes('src')) return true
        if (path.includes('.git')) return true
        if (path.includes('knowledge.md')) return true
        if (path.includes('README.md')) return true
        return false
      },
      mkdir: async () => {},
      writeFile: async () => {},
    } as unknown as CodebuffFileSystem

    mockLogger = {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
    }
  })

  test('creates initial session state with explicit projectFiles', async () => {
    const projectFiles = {
      'src/index.ts': 'console.log("Hello world");',
      'src/utils.ts':
        'export function add(a: number, b: number) { return a + b; }',
      'knowledge.md': '# Knowledge\n\nThis is a knowledge file.',
    }

    const sessionState = await initialSessionState({
      cwd: '/test-project',
      projectFiles,
      fs: mockFs,
      logger: mockLogger,
    })

    expect(sessionState.fileContext.fileTree).toBeDefined()
    expect(sessionState.fileContext.fileTree.length).toBeGreaterThan(0)
    expect(sessionState.fileContext.fileTokenScores).toBeDefined()
    expect(sessionState.mainAgentState.agentId).toBe('main-agent')
    expect(sessionState.mainAgentState.messageHistory).toEqual([])
  })

  test('discovers project files automatically when projectFiles is undefined', async () => {
    const sessionState = await initialSessionState({
      cwd: '/test-project',
      projectFiles: undefined,
      fs: mockFs,
      logger: mockLogger,
    })

    expect(sessionState.fileContext.fileTree).toBeDefined()
    expect(sessionState.mainAgentState.agentId).toBe('main-agent')
    expect(sessionState.mainAgentState.messageHistory).toEqual([])
  })

  test('derives knowledgeFiles from projectFiles when not provided', async () => {
    const projectFiles = {
      'src/index.ts': 'console.log("Hello world");',
      'knowledge.md': '# Knowledge\n\nThis is a knowledge file.',
      'claude.md': '# Claude context\n\nThis is claude context.',
      'README.md': '# Project\n\nThis is a readme.',
    }

    const sessionState = await initialSessionState({
      cwd: '/test-project',
      projectFiles,
      knowledgeFiles: undefined,
      fs: mockFs,
      logger: mockLogger,
    })

    expect(sessionState.fileContext.knowledgeFiles).toBeDefined()
    expect(sessionState.fileContext.knowledgeFiles['knowledge.md']).toBe(
      '# Knowledge\n\nThis is a knowledge file.',
    )
    expect(sessionState.fileContext.knowledgeFiles['claude.md']).toBeUndefined()
    expect(sessionState.fileContext.knowledgeFiles['README.md']).toBeUndefined()
  })

  test('derives reads knowledgeFiles from claude.md when knowledge.md is not present', async () => {
    const projectFiles = {
      'src/index.ts': 'console.log("Hello world");',
      'claude.md': '# Claude context\n\nThis is claude context.',
      'README.md': '# Project\n\nThis is a readme.',
    }

    const sessionState = await initialSessionState({
      cwd: '/test-project',
      projectFiles,
      knowledgeFiles: undefined,
      fs: mockFs,
      logger: mockLogger,
    })

    expect(sessionState.fileContext.knowledgeFiles).toBeDefined()
    expect(
      sessionState.fileContext.knowledgeFiles['knowledge.md'],
    ).toBeUndefined()
    expect(sessionState.fileContext.knowledgeFiles['claude.md']).toEqual(
      '# Claude context\n\nThis is claude context.',
    )
    expect(sessionState.fileContext.knowledgeFiles['README.md']).toBeUndefined()
  })

  test('respects explicit knowledgeFiles when provided', async () => {
    const projectFiles = {
      'src/index.ts': 'console.log("Hello world");',
      'knowledge.md': '# Knowledge\n\nThis is a knowledge file.',
    }

    const knowledgeFiles = {
      'custom-knowledge.md': '# Custom Knowledge\n\nThis is custom knowledge.',
    }

    const sessionState = await initialSessionState({
      cwd: '/test-project',
      projectFiles,
      knowledgeFiles,
      fs: mockFs,
      logger: mockLogger,
    })

    expect(sessionState.fileContext.knowledgeFiles).toEqual(knowledgeFiles)
    expect(
      sessionState.fileContext.knowledgeFiles['knowledge.md'],
    ).toBeUndefined()
  })

  test('sets maxAgentSteps when provided', async () => {
    const projectFiles = {
      'src/index.ts': 'console.log("Hello world");',
    }

    const sessionState = await initialSessionState({
      cwd: '/test-project',
      projectFiles,
      maxAgentSteps: 10,
      fs: mockFs,
      logger: mockLogger,
    })

    expect(sessionState.mainAgentState.stepsRemaining).toBe(10)
  })

  test('includes custom agent definitions', async () => {
    const projectFiles = {
      'src/index.ts': 'console.log("Hello world");',
    }

    const agentDefinitions = [
      {
        id: 'custom-agent',
        displayName: 'Custom Agent',
        spawnerPrompt: 'A custom agent',
        model: 'anthropic/claude-4-sonnet-20250522',
        outputMode: 'last_message' as const,
        includeMessageHistory: false,
        inheritParentSystemPrompt: false,
        mcpServers: {},
        toolNames: [],
        spawnableAgents: [],
        inputSchema: {},
        systemPrompt: 'Custom system prompt',
        instructionsPrompt: '',
        stepPrompt: '',
      },
    ]

    const sessionState = await initialSessionState({
      cwd: '/test-project',
      projectFiles,
      agentDefinitions,
      fs: mockFs,
      logger: mockLogger,
    })

    expect(sessionState.fileContext.agentTemplates).toBeDefined()
    expect(
      sessionState.fileContext.agentTemplates['custom-agent'],
    ).toBeDefined()
    expect(
      sessionState.fileContext.agentTemplates['custom-agent'].displayName,
    ).toBe('Custom Agent')
  })

  test('includes custom tool definitions', async () => {
    const projectFiles = {
      'src/index.ts': 'console.log("Hello world");',
    }

    const inputSchema = z.object({ input: z.string() })
    const customToolDefinitions = [
      {
        toolName: 'custom_tool',
        inputSchema,
        description: 'A custom tool',
        endsAgentStep: false,
        exampleInputs: [],
        execute: async (input: any) => [],
      },
    ]

    const sessionState = await initialSessionState({
      cwd: '/test-project',
      projectFiles,
      customToolDefinitions,
      fs: mockFs,
      logger: mockLogger,
    })

    expect(sessionState.fileContext.customToolDefinitions).toBeDefined()
    expect(
      sessionState.fileContext.customToolDefinitions?.['custom_tool'],
    ).toBeDefined()
    expect(
      sessionState.fileContext.customToolDefinitions?.['custom_tool']
        ?.description,
    ).toBe('A custom tool')
  })

  test('populates system info correctly', async () => {
    const projectFiles = {
      'src/index.ts': 'console.log("Hello world");',
    }

    const sessionState = await initialSessionState({
      cwd: '/test-project',
      projectFiles,
      fs: mockFs,
      logger: mockLogger,
    })

    expect(sessionState.fileContext.systemInfo).toBeDefined()
    expect(sessionState.fileContext.systemInfo.platform).toBe(process.platform)
    expect(sessionState.fileContext.systemInfo.shell).toBeDefined()
    expect(sessionState.fileContext.systemInfo.nodeVersion).toBe(
      process.version,
    )
    expect(sessionState.fileContext.systemInfo.cpus).toBeGreaterThan(0)
  })

  test('loads skills from skillsDir when provided', async () => {
    const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'sdk-skills-test-'))
    try {
      const skillDir = path.join(tmpDir, 'my-skill')
      mkdirSync(skillDir, { recursive: true })
      writeFileSync(
        path.join(skillDir, 'SKILL.md'),
        [
          '---',
          'name: my-skill',
          'description: A test skill',
          '---',
          '',
          '# My Skill',
          '',
          'Some instructions here.',
        ].join('\n'),
      )

      const sessionState = await initialSessionState({
        cwd: '/test-project',
        skillsDir: tmpDir,
        projectFiles: { 'src/index.ts': 'console.log("hello");' },
        fs: mockFs,
        logger: mockLogger,
      })

      expect(sessionState.fileContext.skills).toBeDefined()
      expect(sessionState.fileContext.skills!['my-skill']).toBeDefined()
      expect(sessionState.fileContext.skills!['my-skill'].name).toBe('my-skill')
      expect(sessionState.fileContext.skills!['my-skill'].description).toBe(
        'A test skill',
      )
    } finally {
      rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  test('skillsDir with no valid skills results in empty skills map', async () => {
    const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'sdk-skills-test-'))
    try {
      const sessionState = await initialSessionState({
        cwd: '/test-project',
        skillsDir: tmpDir,
        projectFiles: { 'src/index.ts': 'console.log("hello");' },
        fs: mockFs,
        logger: mockLogger,
      })

      expect(sessionState.fileContext.skills).toBeDefined()
      expect(Object.keys(sessionState.fileContext.skills!)).toHaveLength(0)
    } finally {
      rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  test('initializes empty agent state correctly', async () => {
    const projectFiles = {
      'src/index.ts': 'console.log("Hello world");',
    }

    const sessionState = await initialSessionState({
      cwd: '/test-project',
      projectFiles,
      fs: mockFs,
      logger: mockLogger,
    })

    expect(sessionState.mainAgentState.agentId).toBe('main-agent')
    expect(sessionState.mainAgentState.agentType).toBeNull()
    expect(sessionState.mainAgentState.agentContext).toEqual({})
    expect(sessionState.mainAgentState.ancestorRunIds).toEqual([])
    expect(sessionState.mainAgentState.subagents).toEqual([])
    expect(sessionState.mainAgentState.childRunIds).toEqual([])
    expect(sessionState.mainAgentState.messageHistory).toEqual([])
    expect(sessionState.mainAgentState.creditsUsed).toBe(0)
    expect(sessionState.mainAgentState.directCreditsUsed).toBe(0)
    expect(sessionState.mainAgentState.output).toBeUndefined()
    expect(sessionState.mainAgentState.parentId).toBeUndefined()
  })
})
