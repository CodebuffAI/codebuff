import { describe, expect, test } from 'bun:test'

import {
  createProjectIgnoreFileReader,
  isProjectFileIgnored,
} from '../project-ignore'

function reader(files: Record<string, string>) {
  return async (filePath: string) => files[filePath] ?? null
}

describe('isProjectFileIgnored', () => {
  test('applies root and nested ignore rules with negation', async () => {
    const readIgnoreFile = reader({
      '.gitignore': 'private/\n*.sample\n',
      'config/.gitignore': '*.template\n!.env.template\n',
    })

    expect(
      await isProjectFileIgnored({
        filePath: 'private/.env.example',
        readIgnoreFile,
      }),
    ).toBe(true)
    expect(
      await isProjectFileIgnored({
        filePath: 'config/.env.sample',
        readIgnoreFile,
      }),
    ).toBe(true)
    expect(
      await isProjectFileIgnored({
        filePath: 'config/.env.template',
        readIgnoreFile,
      }),
    ).toBe(false)
  })

  test('reads Codebuff ignore files and rejects paths escaping the project', async () => {
    const readIgnoreFile = reader({ '.codebuffignore': '.env.example\n' })

    expect(
      await isProjectFileIgnored({
        filePath: '.env.example',
        readIgnoreFile,
      }),
    ).toBe(true)
    expect(
      await isProjectFileIgnored({
        filePath: '../.env.example',
        readIgnoreFile,
      }),
    ).toBe(true)
  })
})

describe('createProjectIgnoreFileReader', () => {
  test('lists each directory once and reads only files that exist', async () => {
    const listed: string[] = []
    const read: string[] = []
    const readIgnoreFile = createProjectIgnoreFileReader({
      listDirectory: async (directory) => {
        listed.push(directory)
        return directory === '' ? ['.gitignore'] : []
      },
      readFile: async (filePath) => {
        read.push(filePath)
        return '*.secret\n'
      },
    })

    expect(await readIgnoreFile('.gitignore')).toBe('*.secret\n')
    expect(await readIgnoreFile('.codebuffignore')).toBeNull()
    expect(listed).toEqual([''])
    expect(read).toEqual(['.gitignore'])
  })

  test('propagates errors when a listed ignore file is unreadable', async () => {
    const readIgnoreFile = createProjectIgnoreFileReader({
      listDirectory: async () => ['.gitignore'],
      readFile: async () => {
        throw new Error('permission denied')
      },
    })

    await expect(readIgnoreFile('.gitignore')).rejects.toThrow(
      'permission denied',
    )
  })
})
