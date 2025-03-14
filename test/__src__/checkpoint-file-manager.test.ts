import { describe, it, expect, beforeEach, mock } from 'bun:test'
import { join } from 'path'
import * as fileManager from '../../npm-app/src/checkpoints/file-manager'
const { initializeCheckpointFileManager, storeFileState, restoreFileState } = fileManager;

describe('checkpoint-file-manager', () => {
  const mockProjectRoot = '/test/project'
  const mockDataDir = '/test/data'
  const mockBareRepoPath = join(mockDataDir, 'mock-hash')

  beforeEach(() => {
    // Mock child_process to force fallback to isomorphic-git
    mock.module('child_process', () => ({
      execFileSync: () => { throw new Error('git not available') }
    }))

    // Mock project files
    mock.module('../../npm-app/src/project-files', () => ({
      getProjectRoot: () => mockProjectRoot,
      getProjectDataDir: () => mockDataDir,
    }))

    // Mock file-manager module itself to override fs
    mock.module('../../npm-app/src/checkpoints/file-manager', () => ({
      ...require('../../npm-app/src/checkpoints/file-manager'),
      fs: {
        ...require('fs'),
        mkdirSync: () => undefined,
        existsSync: () => true,
        readFileSync: () => '',
        writeFileSync: () => {},
      },
      hasUnsavedChanges: () => Promise.resolve(true)
    }))
  })

  describe('storeFileState', () => {
    let addMock: any
    let commitMock: any
    const message = 'Test commit message'

    beforeEach(async () => {
      addMock = mock(() => {})
      commitMock = mock(() => 'mock-commit-hash')

      // Mock statusMatrix to show file needs staging
      mock.module('isomorphic-git', () => ({
        init: () => {},
        add: addMock,
        commit: commitMock,
        writeRef: () => {},
        resolveRef: () => 'HEAD',
        statusMatrix: () => [[
          'test.txt',
          1, // HEAD status
          2, // workdir status (2 means modified)
          1  // stage status
        ]],
        checkout: () => {},
        resetIndex: () => {}
      }))

      await initializeCheckpointFileManager({
        projectDir: mockProjectRoot,
        relativeFilepaths: ['test.txt']
      })
    })

    it('should store file state with commit message', async () => {
      const result = await storeFileState({
        projectDir: mockProjectRoot,
        bareRepoPath: mockBareRepoPath,
        message,
        relativeFilepaths: ['test.txt']
      })

      expect(addMock).toHaveBeenCalled()
      expect(commitMock).toHaveBeenCalled()
      expect(result).toBe('mock-commit-hash')
    })

    it('should handle git add failure by adding files individually', async () => {
      let addCallCount = 0
      addMock = mock(() => {
        addCallCount++
        if (addCallCount === 1) throw new Error('Mock add failure')
        return Promise.resolve()
      })

      // Mock statusMatrix to show file needs staging
      mock.module('isomorphic-git', () => ({
        init: () => {},
        add: addMock,
        commit: () => 'mock-commit-hash',
        writeRef: () => {},
        resolveRef: () => 'HEAD',
        statusMatrix: () => [[
          'test.txt',
          1, // HEAD status
          2, // workdir status (2 means modified)
          1  // stage status
        ]],
        checkout: () => {},
        resetIndex: () => {}
      }))

      // Mock child_process to force fallback to isomorphic-git
      mock.module('child_process', () => ({
        execFileSync: () => { throw new Error('git not available') }
      }))

      // Mock file-manager module itself to override fs
      mock.module('../../npm-app/src/checkpoints/file-manager', () => ({
        ...require('../../npm-app/src/checkpoints/file-manager'),
        fs: {
          ...require('fs'),
          mkdirSync: () => undefined,
          existsSync: () => true,
          readFileSync: () => '',
          writeFileSync: () => {},
        },
        hasUnsavedChanges: () => Promise.resolve(true)
      }))

      const result = await storeFileState({
        projectDir: mockProjectRoot,
        bareRepoPath: mockBareRepoPath,
        message,
        relativeFilepaths: ['test.txt']
      })

      expect(addCallCount).toBe(1)
      expect(result).toBe('mock-commit-hash')
    })
  })

  describe('restoreFileState', () => {
    it('should checkout the specified commit', async () => {
      const fileStateId = 'abc123'
      const checkoutMock = mock(() => {})
      const resetMock = mock(() => {})

      // Mock statusMatrix to show file needs restoring
      mock.module('isomorphic-git', () => ({
        checkout: checkoutMock,
        resetIndex: resetMock,
        statusMatrix: () => [[
          'test.txt',
          1, // HEAD status
          2, // workdir status (2 means modified)
          1  // stage status
        ]],
      }))

      await restoreFileState({
        projectDir: mockProjectRoot,
        bareRepoPath: mockBareRepoPath,
        commit: fileStateId,
        relativeFilepaths: ['test.txt']
      })

      expect(checkoutMock).toHaveBeenCalled()
      expect(resetMock).toHaveBeenCalled()
    })
  })
})
