import { describe, it, expect, beforeEach, mock } from 'bun:test'
import { join } from 'path'
import {
  initializeCheckpointFileManager,
  storeFileState,
  checkoutFileState,
} from '../../npm-app/src/checkpoint-file-manager'

describe('checkpoint-file-manager', () => {
  const mockProjectRoot = '/test/project'
  const mockDataDir = '/test/data'
  const mockBareRepoPath = join(mockDataDir, 'mock-hash')

  beforeEach(() => {
    // Setup mock implementations
    mock.module('../../npm-app/src/project-files', () => ({
      getProjectRoot: () => mockProjectRoot,
      getProjectDataDir: () => mockDataDir,
    }))
    mock.module('fs', () => ({
      mkdirSync: () => {},
      lstat: () => ({
        isFile: () => true,
        isDirectory: () => true,
        size: 1000,
        mtimeMs: Date.now(),
      }),
      readFileSync: () => '',
      writeFileSync: () => {},
      existsSync: () => true,
    }))
  })

  describe('initializeCheckpointFileManager', () => {
    it('should create bare repo directory if it does not exist', async () => {
      const initMock = mock(() => {})

      // Mock git.resolveRef to throw error (repo doesn't exist)
      mock.module('isomorphic-git', () => ({
        resolveRef: () => {
          throw new Error()
        },
        init: initMock,
        statusMatrix: () => [],
        writeRef: () => {},
        add: () => {},
        commit: () => 'initial-commit',
      }))

      await initializeCheckpointFileManager()

      expect(initMock).toHaveBeenCalled()
      const args = initMock.mock.calls[0][0]
      expect(args.bare).toBe(true)
      expect(args.dir).toInclude(mockDataDir)
    })

    it('should not reinitialize if repo already exists', async () => {
      const initMock = mock(() => {})

      // Mock git.resolveRef to succeed (repo exists)
      mock.module('isomorphic-git', () => ({
        resolveRef: () => 'HEAD',
        init: initMock,
      }))

      await initializeCheckpointFileManager()

      expect(initMock).not.toHaveBeenCalled()
    })
  })

  describe('storeFileState', () => {
    beforeEach(async () => {
      // Initialize the file manager before each test
      mock.module('isomorphic-git', () => ({
        resolveRef: () => 'HEAD',
        init: () => {},
        statusMatrix: () => [],
        writeRef: () => {},
        add: () => {},
        commit: () => 'initial-commit',
      }))
      await initializeCheckpointFileManager()
    })

    it('should store file state with commit message', async () => {
      const message = 'Test commit'
      const mockCommitHash = 'abc123'
      const addMock = mock(() => {})

      mock.module('isomorphic-git', () => ({
        add: addMock,
        commit: () => mockCommitHash,
        statusMatrix: () => [],
        resolveRef: () => 'HEAD',
        writeRef: () => {},
      }))

      const result = await storeFileState(message)

      expect(addMock).toHaveBeenCalled()
      const args = addMock.mock.calls[0][0]
      expect(args.dir).toBe(mockProjectRoot)
      expect(args.filepath).toBe('.')
      expect(args.gitdir).toInclude(mockDataDir)
      expect(result).toBe(mockCommitHash)
    })

    it('should handle git add failure by adding files individually', async () => {
      const message = 'Test commit'
      const mockCommitHash = 'abc123'

      let addCallCount = 0
      const addMock = mock(() => {
        addCallCount++
        if (addCallCount === 1) {
          throw new Error()
        }
      })

      mock.module('isomorphic-git', () => ({
        add: addMock,
        statusMatrix: () => [['file1.txt', 1, 1, 1]],
        commit: () => mockCommitHash,
        resolveRef: () => 'HEAD',
        writeRef: () => {},
      }))

      const result = await storeFileState(message)

      expect(addCallCount).toBe(2)
      expect(result).toBe(mockCommitHash)
    })
  })

  describe('checkoutFileState', () => {
    it('should checkout the specified commit', async () => {
      const fileStateId = 'abc123'
      const checkoutMock = mock(() => {})

      mock.module('isomorphic-git', () => ({
        checkout: checkoutMock,
      }))

      await checkoutFileState(fileStateId)

      expect(checkoutMock).toHaveBeenCalled()
      const args = checkoutMock.mock.calls[0][0]
      expect(args.dir).toBe(mockProjectRoot)
      expect(args.gitdir).toInclude(mockDataDir)
      expect(args.ref).toBe(fileStateId)
      expect(args.force).toBe(true)
    })
  })
})
