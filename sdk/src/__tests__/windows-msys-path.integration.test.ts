import { expect, test } from 'bun:test'
import { randomUUID } from 'crypto'
import { promises as fs, rmSync } from 'fs'
import { spawnSync } from 'child_process'

import { getSystemProcessEnv } from '../env'
import { getFiles } from '../tools/read-files'
import { findWindowsBash, translateGitBashPath } from '../tools/windows-bash'

const windowsTest = process.platform === 'win32' ? test : test.skip

windowsTest(
  'reads a file created under Git Bash /tmp with the native file tool',
  async () => {
    const bash = findWindowsBash(getSystemProcessEnv())
    expect(bash).not.toBeNull()

    const msysPath = `/tmp/freebuff-path-${randomUUID()}.txt`
    const content = 'freebuff msys path probe'
    const created = spawnSync(
      bash!,
      ['-lc', `printf '${content}' > '${msysPath}'`],
      {
        encoding: 'utf8',
        windowsHide: true,
      },
    )
    expect(created.status, created.stderr).toBe(0)

    const nativePath = translateGitBashPath(msysPath)
    expect(nativePath).not.toBe(msysPath)
    try {
      const result = await getFiles({
        filePaths: [msysPath],
        cwd: process.cwd(),
        fs,
        limitContent: false,
        enforceEnvPolicy: false,
      })
      expect(Object.values(result)).toEqual([content])
    } finally {
      rmSync(nativePath, { force: true })
    }
  },
)
