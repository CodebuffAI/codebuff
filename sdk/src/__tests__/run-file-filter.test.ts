import * as mainPromptModule from '@codebuff/agent-runtime/main-prompt'
import { FILE_READ_STATUS } from '@codebuff/common/old-constants'
import * as projectFileTree from '@codebuff/common/project-file-tree'
import { getInitialSessionState } from '@codebuff/common/types/session-state'
import { getStubProjectFileContext } from '@codebuff/common/util/file'
import { afterEach, describe, expect, it, mock, spyOn } from 'bun:test'

import { OpenbuffClient } from '../client'
import * as databaseModule from '../impl/database'

import type { FileFilter } from '../tools/read-files'
import type { CodebuffFileSystem } from '@codebuff/common/types/filesystem'
import type { PathLike } from 'node:fs'

interface NodeError extends Error {
  code?: string
}

const createNodeError = (message: string, code: string): NodeError => {
  const error: NodeError = new Error(message)
  error.code = code
  return error
}

function createMockFs(config: {
  files?: Record<string, { content: string; size?: number }>
}): CodebuffFileSystem {
  const { files = {} } = config

  return {
    readFile: async (filePath: PathLike) => {
      const pathStr = String(filePath)
      if (files[pathStr]) {
        return files[pathStr].content
      }
      throw createNodeError(
        `ENOENT: no such file or directory: ${pathStr}`,
        'ENOENT',
      )
    },
    stat: async (filePath: PathLike) => {
      const pathStr = String(filePath)
      if (files[pathStr]) {
        return {
          size: files[pathStr].size ?? files[pathStr].content.length,
          isDirectory: () => false,
          isFile: () => true,
          atimeMs: Date.now(),
          mtimeMs: Date.now(),
        }
      }
      throw createNodeError(
        `ENOENT: no such file or directory: ${pathStr}`,
        'ENOENT',
      )
    },
    readdir: async () => [],
    mkdir: async () => undefined,
    realpath: async (filePath: PathLike) => String(filePath),
    writeFile: async () => undefined,
  } as unknown as CodebuffFileSystem
}

describe('OpenbuffClientOptions fileFilter', () => {
  afterEach(() => {
    mock.restore()
  })

  it('[SEC-H01] applies mandatory sensitive policy before the custom filter', async () => {
    spyOn(databaseModule, 'getUserInfoFromApiKey').mockResolvedValue({
      id: 'user-123',
      email: 'test@example.com',
      discord_id: null,
      stripe_customer_id: null,
      banned: false,
      created_at: new Date('2024-01-01T00:00:00Z'),
    })
    spyOn(databaseModule, 'fetchAgentFromDatabase').mockResolvedValue(null)
    spyOn(databaseModule, 'startAgentRun').mockResolvedValue('run-1')
    spyOn(databaseModule, 'finishAgentRun').mockResolvedValue(undefined)
    spyOn(databaseModule, 'addAgentStep').mockResolvedValue('step-1')
    spyOn(projectFileTree, 'isFileIgnored').mockResolvedValue(false)

    const mockFs = createMockFs({
      files: {
        '/project/.env': { content: 'SECRET=value' },
        '/project/src/index.ts': { content: 'console.log("hello")' },
      },
    })

    let requestedFiles: Record<string, string | null> = {}

    spyOn(mainPromptModule, 'callMainPrompt').mockImplementation(
      async (params: Parameters<typeof mainPromptModule.callMainPrompt>[0]) => {
        const { sendAction, promptId, requestFiles } = params
        const sessionState = getInitialSessionState(getStubProjectFileContext())

        // Simulate agent requesting files
        requestedFiles = (await requestFiles({
          filePaths: ['.env', 'src/index.ts'],
        })) as Record<string, string | null>

        await sendAction({
          action: {
            type: 'prompt-response',
            promptId,
            sessionState,
            output: {
              type: 'lastMessage',
              value: [],
            },
          },
        })

        return {
          sessionState,
          output: {
            type: 'lastMessage' as const,
            value: [],
          },
        }
      },
    )

    const filterCalls: string[] = []
    const fileFilter: FileFilter = (filePath) => {
      filterCalls.push(filePath)
      if (filePath === '.env') {
        return { status: 'blocked' }
      }
      return { status: 'allow' }
    }

    const client = new OpenbuffClient({
      apiKey: 'test-key',
      cwd: '/project',
      fsSource: mockFs,
      fileFilter,
      filesystemResultFormat: 'legacy-v0',
    })

    const result = await client.run({
      agent: 'base2',
      prompt: 'read files',
    })

    expect(result.output.type).toBe('lastMessage')
    expect(filterCalls).not.toContain('.env')
    expect(filterCalls).toContain('src/index.ts')
    expect(requestedFiles['.env']).toBe(FILE_READ_STATUS.IGNORED)
    expect(requestedFiles['src/index.ts']).toBe('console.log("hello")')
  })

  it('should mark files as templates when filter returns allow-example', async () => {
    spyOn(databaseModule, 'getUserInfoFromApiKey').mockResolvedValue({
      id: 'user-123',
      email: 'test@example.com',
      discord_id: null,
      stripe_customer_id: null,
      banned: false,
      created_at: new Date('2024-01-01T00:00:00Z'),
    })
    spyOn(databaseModule, 'fetchAgentFromDatabase').mockResolvedValue(null)
    spyOn(databaseModule, 'startAgentRun').mockResolvedValue('run-1')
    spyOn(databaseModule, 'finishAgentRun').mockResolvedValue(undefined)
    spyOn(databaseModule, 'addAgentStep').mockResolvedValue('step-1')
    // Even though isFileIgnored returns true, template files should bypass this
    spyOn(projectFileTree, 'isFileIgnored').mockResolvedValue(true)

    const mockFs = createMockFs({
      files: {
        '/project/.env.example': { content: 'API_KEY=your_key_here' },
      },
    })

    let requestedFiles: Record<string, string | null> = {}

    spyOn(mainPromptModule, 'callMainPrompt').mockImplementation(
      async (params: Parameters<typeof mainPromptModule.callMainPrompt>[0]) => {
        const { sendAction, promptId, requestFiles } = params
        const sessionState = getInitialSessionState(getStubProjectFileContext())

        requestedFiles = (await requestFiles({
          filePaths: ['.env.example'],
        })) as Record<string, string | null>

        await sendAction({
          action: {
            type: 'prompt-response',
            promptId,
            sessionState,
            output: {
              type: 'lastMessage',
              value: [],
            },
          },
        })

        return {
          sessionState,
          output: {
            type: 'lastMessage' as const,
            value: [],
          },
        }
      },
    )

    const fileFilter: FileFilter = (filePath) => {
      if (filePath.endsWith('.example')) {
        return { status: 'allow-example' }
      }
      return { status: 'allow' }
    }

    const client = new OpenbuffClient({
      apiKey: 'test-key',
      cwd: '/project',
      fsSource: mockFs,
      fileFilter,
      filesystemResultFormat: 'legacy-v0',
    })

    const result = await client.run({
      agent: 'base2',
      prompt: 'read files',
    })

    expect(result.output.type).toBe('lastMessage')
    // Template files should have TEMPLATE prefix
    expect(requestedFiles['.env.example']).toBe(
      FILE_READ_STATUS.TEMPLATE + '\n' + 'API_KEY=your_key_here',
    )
  })

  it('[SEC-H02] preserves mandatory blocking through requestOptionalFile', async () => {
    spyOn(databaseModule, 'getUserInfoFromApiKey').mockResolvedValue({
      id: 'user-123',
      email: 'test@example.com',
      discord_id: null,
      stripe_customer_id: null,
      banned: false,
      created_at: new Date('2024-01-01T00:00:00Z'),
    })
    spyOn(databaseModule, 'fetchAgentFromDatabase').mockResolvedValue(null)
    spyOn(databaseModule, 'startAgentRun').mockResolvedValue('run-1')
    spyOn(databaseModule, 'finishAgentRun').mockResolvedValue(undefined)
    spyOn(databaseModule, 'addAgentStep').mockResolvedValue('step-1')
    spyOn(projectFileTree, 'isFileIgnored').mockResolvedValue(false)

    const mockFs = createMockFs({
      files: {
        '/project/secret.key': { content: 'private key content' },
      },
    })

    let optionalFileError: string | undefined

    spyOn(mainPromptModule, 'callMainPrompt').mockImplementation(
      async (params: Parameters<typeof mainPromptModule.callMainPrompt>[0]) => {
        const { sendAction, promptId, requestOptionalFile } = params
        const sessionState = getInitialSessionState(getStubProjectFileContext())

        // Use requestOptionalFile which should also use the fileFilter
        try {
          await requestOptionalFile({ filePath: 'secret.key' })
        } catch (error) {
          optionalFileError =
            error instanceof Error ? error.message : String(error)
        }

        await sendAction({
          action: {
            type: 'prompt-response',
            promptId,
            sessionState,
            output: {
              type: 'lastMessage',
              value: [],
            },
          },
        })

        return {
          sessionState,
          output: {
            type: 'lastMessage' as const,
            value: [],
          },
        }
      },
    )

    const filterCalls: string[] = []
    const fileFilter: FileFilter = (filePath) => {
      filterCalls.push(filePath)
      if (filePath.endsWith('.key')) {
        return { status: 'blocked' }
      }
      return { status: 'allow' }
    }

    const client = new OpenbuffClient({
      apiKey: 'test-key',
      cwd: '/project',
      fsSource: mockFs,
      filesystemResultFormat: 'legacy-v0',
      fileFilter,
    })

    const result = await client.run({
      agent: 'base2',
      prompt: 'read optional file',
    })

    expect(result.output.type).toBe('lastMessage')
    expect(filterCalls).not.toContain('secret.key')
    expect(optionalFileError).toContain('read_files blocked')
  })

  it('[SEC-H01] rejects absolute requestOptionalFile paths inside cwd', async () => {
    spyOn(databaseModule, 'getUserInfoFromApiKey').mockResolvedValue({
      id: 'user-123',
      email: 'test@example.com',
      discord_id: null,
      stripe_customer_id: null,
      banned: false,
      created_at: new Date('2024-01-01T00:00:00Z'),
    })
    spyOn(databaseModule, 'fetchAgentFromDatabase').mockResolvedValue(null)
    spyOn(databaseModule, 'startAgentRun').mockResolvedValue('run-1')
    spyOn(databaseModule, 'finishAgentRun').mockResolvedValue(undefined)
    spyOn(databaseModule, 'addAgentStep').mockResolvedValue('step-1')
    spyOn(projectFileTree, 'isFileIgnored').mockResolvedValue(false)

    const mockFs = createMockFs({
      files: {
        '/project/src/index.ts': { content: 'normal file content' },
      },
    })

    let optionalFileError: string | undefined

    spyOn(mainPromptModule, 'callMainPrompt').mockImplementation(
      async (params: Parameters<typeof mainPromptModule.callMainPrompt>[0]) => {
        const { sendAction, promptId, requestOptionalFile } = params
        const sessionState = getInitialSessionState(getStubProjectFileContext())

        try {
          await requestOptionalFile({ filePath: '/project/src/index.ts' })
        } catch (error) {
          optionalFileError =
            error instanceof Error ? error.message : String(error)
        }

        await sendAction({
          action: {
            type: 'prompt-response',
            promptId,
            sessionState,
            output: {
              type: 'lastMessage',
              value: [],
            },
          },
        })

        return {
          sessionState,
          output: {
            type: 'lastMessage' as const,
            value: [],
          },
        }
      },
    )

    const client = new OpenbuffClient({
      apiKey: 'test-key',
      cwd: '/project',
      fsSource: mockFs,
      filesystemResultFormat: 'legacy-v0',
    })

    const result = await client.run({
      agent: 'base2',
      prompt: 'read optional file',
    })

    expect(result.output.type).toBe('lastMessage')
    expect(optionalFileError).toContain('read_files outside_project')
  })

  it('should allow all files when no fileFilter is provided', async () => {
    spyOn(databaseModule, 'getUserInfoFromApiKey').mockResolvedValue({
      id: 'user-123',
      email: 'test@example.com',
      discord_id: null,
      stripe_customer_id: null,
      banned: false,
      created_at: new Date('2024-01-01T00:00:00Z'),
    })
    spyOn(databaseModule, 'fetchAgentFromDatabase').mockResolvedValue(null)
    spyOn(databaseModule, 'startAgentRun').mockResolvedValue('run-1')
    spyOn(databaseModule, 'finishAgentRun').mockResolvedValue(undefined)
    spyOn(databaseModule, 'addAgentStep').mockResolvedValue('step-1')
    spyOn(projectFileTree, 'isFileIgnored').mockResolvedValue(false)

    const mockFs = createMockFs({
      files: {
        '/project/src/index.ts': { content: 'normal file content' },
      },
    })

    let requestedFiles: Record<string, string | null> = {}

    spyOn(mainPromptModule, 'callMainPrompt').mockImplementation(
      async (params: Parameters<typeof mainPromptModule.callMainPrompt>[0]) => {
        const { sendAction, promptId, requestFiles } = params
        const sessionState = getInitialSessionState(getStubProjectFileContext())

        requestedFiles = (await requestFiles({
          filePaths: ['src/index.ts'],
        })) as Record<string, string | null>

        await sendAction({
          action: {
            type: 'prompt-response',
            promptId,
            sessionState,
            output: {
              type: 'lastMessage',
              value: [],
            },
          },
        })

        return {
          sessionState,
          output: {
            type: 'lastMessage' as const,
            value: [],
          },
        }
      },
    )

    // No fileFilter provided. This assertion exercises explicit legacy
    // compatibility; structured-v1 is the SDK default.
    const client = new OpenbuffClient({
      apiKey: 'test-key',
      cwd: '/project',
      fsSource: mockFs,
      filesystemResultFormat: 'legacy-v0',
    })

    const result = await client.run({
      agent: 'base2',
      prompt: 'read files',
    })

    expect(result.output.type).toBe('lastMessage')
    expect(requestedFiles['src/index.ts']).toBe('normal file content')
  })

  it('returns structured read results by default', async () => {
    spyOn(databaseModule, 'getUserInfoFromApiKey').mockResolvedValue({
      id: 'user-123',
      email: 'test@example.com',
      discord_id: null,
      stripe_customer_id: null,
      banned: false,
      created_at: new Date('2024-01-01T00:00:00Z'),
    })
    spyOn(databaseModule, 'fetchAgentFromDatabase').mockResolvedValue(null)
    spyOn(databaseModule, 'startAgentRun').mockResolvedValue('run-1')
    spyOn(databaseModule, 'finishAgentRun').mockResolvedValue(undefined)
    spyOn(databaseModule, 'addAgentStep').mockResolvedValue('step-1')
    spyOn(projectFileTree, 'isFileIgnored').mockResolvedValue(false)

    const mockFs = createMockFs({
      files: {
        '/project/src/index.ts': { content: 'normal file content' },
      },
    })
    let requestedFiles: unknown

    spyOn(mainPromptModule, 'callMainPrompt').mockImplementation(
      async (params: Parameters<typeof mainPromptModule.callMainPrompt>[0]) => {
        const { sendAction, promptId, requestFiles } = params
        const sessionState = getInitialSessionState(getStubProjectFileContext())
        requestedFiles = await requestFiles({
          filePaths: ['src/index.ts'],
        })
        await sendAction({
          action: {
            type: 'prompt-response',
            promptId,
            sessionState,
            output: { type: 'lastMessage', value: [] },
          },
        })
        return {
          sessionState,
          output: { type: 'lastMessage' as const, value: [] },
        }
      },
    )

    const client = new OpenbuffClient({
      apiKey: 'test-key',
      cwd: '/project',
      fsSource: mockFs,
      overrideTools: {
        read_files: async ({ filePaths }) =>
          Object.fromEntries(
            filePaths.map((filePath) => [filePath, 'normal file content']),
          ),
      },
    })
    await client.run({ agent: 'base2', prompt: 'read files' })

    expect(requestedFiles).toMatchObject({
      kind: 'read_files_result',
      version: 1,
      status: 'ok',
      summary: { requested: 1, ok: 1, partial: 0, failed: 0 },
    })
  })

  it('should run fileFilter before gitignore check', async () => {
    spyOn(databaseModule, 'getUserInfoFromApiKey').mockResolvedValue({
      id: 'user-123',
      email: 'test@example.com',
      discord_id: null,
      stripe_customer_id: null,
      banned: false,
      created_at: new Date('2024-01-01T00:00:00Z'),
    })
    spyOn(databaseModule, 'fetchAgentFromDatabase').mockResolvedValue(null)
    spyOn(databaseModule, 'startAgentRun').mockResolvedValue('run-1')
    spyOn(databaseModule, 'finishAgentRun').mockResolvedValue(undefined)
    spyOn(databaseModule, 'addAgentStep').mockResolvedValue('step-1')

    const isFileIgnoredSpy = spyOn(
      projectFileTree,
      'isFileIgnored',
    ).mockResolvedValue(false)

    const mockFs = createMockFs({
      files: {
        '/project/blocked.ts': { content: 'blocked content' },
      },
    })

    spyOn(mainPromptModule, 'callMainPrompt').mockImplementation(
      async (params: Parameters<typeof mainPromptModule.callMainPrompt>[0]) => {
        const { sendAction, promptId, requestFiles } = params
        const sessionState = getInitialSessionState(getStubProjectFileContext())

        await requestFiles({
          filePaths: ['blocked.ts'],
        })

        await sendAction({
          action: {
            type: 'prompt-response',
            promptId,
            sessionState,
            output: {
              type: 'lastMessage',
              value: [],
            },
          },
        })

        return {
          sessionState,
          output: {
            type: 'lastMessage' as const,
            value: [],
          },
        }
      },
    )

    const fileFilter: FileFilter = () => {
      // Block all files
      return { status: 'blocked' }
    }

    const client = new OpenbuffClient({
      apiKey: 'test-key',
      cwd: '/project',
      fsSource: mockFs,
      fileFilter,
    })

    await client.run({
      agent: 'base2',
      prompt: 'read files',
    })

    // isFileIgnored should not be called since fileFilter blocks the file first
    expect(isFileIgnoredSpy).not.toHaveBeenCalled()
  })
})
