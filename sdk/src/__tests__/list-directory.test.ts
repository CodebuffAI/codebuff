import { describe, expect, it, mock } from 'bun:test'

import { listDirectory } from '../tools/list-directory'

import type { CodebuffFileSystem } from '@codebuff/common/types/filesystem'
import type { Dirent, PathLike } from 'node:fs'

const PROJECT_ROOT = '/workspace/project'

function createFs(realpaths: Record<string, string>) {
  const readdir = mock(async (_path: PathLike) => {
    return [
      {
        name: 'index.ts',
        isDirectory: () => false,
        isFile: () => true,
      },
    ] as Dirent[]
  })

  const fs = {
    realpath: mock(async (path: PathLike) => {
      const pathString = String(path)
      return realpaths[pathString] ?? pathString
    }),
    readdir,
  } as unknown as CodebuffFileSystem

  return { fs, readdir }
}

describe('listDirectory', () => {
  it('allows listing the project root itself', async () => {
    const { fs, readdir } = createFs({
      [PROJECT_ROOT]: PROJECT_ROOT,
    })

    const result = await listDirectory({
      directoryPath: '.',
      projectPath: PROJECT_ROOT,
      fs,
    })

    expect(result[0]).toEqual({
      type: 'json',
      value: {
        files: ['index.ts'],
        directories: [],
        path: '.',
      },
    })
    expect(readdir).toHaveBeenCalledWith(PROJECT_ROOT, {
      withFileTypes: true,
    })
  })

  it('lists a directory inside the project and preserves the requested path', async () => {
    const { fs, readdir } = createFs({
      [PROJECT_ROOT]: PROJECT_ROOT,
      [`${PROJECT_ROOT}/src`]: `${PROJECT_ROOT}/src`,
    })

    const result = await listDirectory({
      directoryPath: 'src',
      projectPath: PROJECT_ROOT,
      fs,
    })

    expect(result).toEqual([
      {
        type: 'json',
        value: {
          files: ['index.ts'],
          directories: [],
          path: 'src',
        },
      },
    ])
    expect(readdir).toHaveBeenCalledWith(`${PROJECT_ROOT}/src`, {
      withFileTypes: true,
    })
  })

  it('rejects sibling paths that only share the project prefix', async () => {
    const siblingPath = '/workspace/project-evil'
    const { fs, readdir } = createFs({
      [PROJECT_ROOT]: PROJECT_ROOT,
      [siblingPath]: siblingPath,
    })

    const result = await listDirectory({
      directoryPath: '../project-evil',
      projectPath: PROJECT_ROOT,
      fs,
    })

    expect(result).toEqual([
      {
        type: 'json',
        value: {
          errorMessage:
            "Invalid path: Path '../project-evil' is outside the project directory.",
        },
      },
    ])
    expect(readdir).not.toHaveBeenCalled()
  })

  it('rejects the project parent directory', async () => {
    const parentPath = '/workspace'
    const { fs, readdir } = createFs({
      [PROJECT_ROOT]: PROJECT_ROOT,
      [parentPath]: parentPath,
    })

    const result = await listDirectory({
      directoryPath: '..',
      projectPath: PROJECT_ROOT,
      fs,
    })

    expect(result).toEqual([
      {
        type: 'json',
        value: {
          errorMessage:
            "Invalid path: Path '..' is outside the project directory.",
        },
      },
    ])
    expect(readdir).not.toHaveBeenCalled()
  })

  it('rejects directories that escape through a symlink', async () => {
    const symlinkPath = `${PROJECT_ROOT}/link`
    const { fs, readdir } = createFs({
      [PROJECT_ROOT]: PROJECT_ROOT,
      [symlinkPath]: '/outside',
    })

    const result = await listDirectory({
      directoryPath: 'link',
      projectPath: PROJECT_ROOT,
      fs,
    })

    expect(result).toEqual([
      {
        type: 'json',
        value: {
          errorMessage:
            "Invalid path: Path 'link' is outside the project directory.",
        },
      },
    ])
    expect(readdir).not.toHaveBeenCalled()
  })
})
