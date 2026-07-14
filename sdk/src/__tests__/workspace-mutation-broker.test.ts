import { afterEach, describe, expect, test } from 'bun:test'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import {
  WorkspaceMutationBroker,
  WorkspaceMutationBrokerRecoveryError,
} from '../services/workspace-mutation-broker'
import { changeFiles } from '../tools/change-file'
import { hashFileContent } from '../tools/filesystem-authority'
import { createNodeFileSystem } from '../tools/node-filesystem'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  )
})

async function makeWorkspace(name: string): Promise<{
  workspace: string
  stateDir: string
}> {
  const root = await mkdtemp(path.join(os.tmpdir(), `openbuff-${name}-`))
  roots.push(root)
  const workspace = path.join(root, 'workspace')
  const stateDir = path.join(root, 'state')
  await mkdir(workspace, { recursive: true })
  return { workspace, stateDir }
}

describe('WorkspaceMutationBroker', () => {
  test('commits exact bytes, rejects stale hashes, and journals receipts', async () => {
    const { workspace, stateDir } = await makeWorkspace('broker-commit')
    const file = path.join(workspace, 'file.txt')
    const before = Buffer.from('one\r\ntwo\r\n')
    const after = Buffer.from('one\r\ntwo\r\nthree\r\n')
    await writeFile(file, before)
    const broker = await WorkspaceMutationBroker.create({
      cwd: workspace,
      stateDir,
    })

    const committed = await broker.conditionalCommit(
      file,
      after,
      hashFileContent(before),
    )
    expect(committed).toMatchObject({
      applied: true,
      receipt: { authorityKind: 'cooperative_cas', brokerRevision: 1 },
    })
    expect(await readFile(file)).toEqual(after)

    const stale = await broker.conditionalCommit(
      file,
      Buffer.from('wrong\n'),
      hashFileContent(before),
    )
    expect(stale).toMatchObject({
      applied: false,
      actualHash: hashFileContent(after),
      receipt: { authorityKind: 'cooperative_cas', brokerRevision: 2 },
    })
    expect(await readFile(file)).toEqual(after)
    expect(
      (await broker.listReceipts()).map((receipt) => receipt.state),
    ).toEqual(['committed', 'rejected'])
  })

  test('serializes compare-and-swap across Openbuff processes', async () => {
    const { workspace, stateDir } = await makeWorkspace('broker-process-race')
    const file = path.join(workspace, 'file.txt')
    const before = Buffer.from('before\n')
    await writeFile(file, before)
    const gate = path.join(path.dirname(workspace), 'gate')
    const servicePath = path.resolve(
      import.meta.dir,
      '..',
      'services',
      'workspace-mutation-broker.ts',
    )

    const startChild = (name: string, content: string) => {
      const ready = path.join(path.dirname(workspace), `ready-${name}`)
      const code = `
        import fs from 'node:fs';
        import { WorkspaceMutationBroker } from ${JSON.stringify(servicePath)};
        const broker = await WorkspaceMutationBroker.create({
          cwd: ${JSON.stringify(workspace)},
          stateDir: ${JSON.stringify(stateDir)},
        });
        fs.writeFileSync(${JSON.stringify(ready)}, 'ready');
        const wait = new Int32Array(new SharedArrayBuffer(4));
        while (!fs.existsSync(${JSON.stringify(gate)})) Atomics.wait(wait, 0, 0, 5);
        const result = await broker.conditionalCommit(
          ${JSON.stringify(file)},
          ${JSON.stringify(content)},
          ${JSON.stringify(hashFileContent(before))},
        );
        console.log(JSON.stringify(result));
      `
      const child = spawn(process.execPath, ['-e', code], {
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      let stdout = ''
      let stderr = ''
      child.stdout.on('data', (chunk) => (stdout += String(chunk)))
      child.stderr.on('data', (chunk) => (stderr += String(chunk)))
      const completed = new Promise<{ applied: boolean }>((resolve, reject) => {
        child.on('error', reject)
        child.on('close', (exitCode) => {
          if (exitCode === 0) resolve(JSON.parse(stdout.trim()))
          else reject(new Error(stderr || `child exited ${exitCode}`))
        })
      })
      return { ready, completed }
    }

    const first = startChild('first', 'first\n')
    const second = startChild('second', 'second\n')
    const wait = new Int32Array(new SharedArrayBuffer(4))
    const deadline = Date.now() + 5_000
    while (
      (!fs.existsSync(first.ready) || !fs.existsSync(second.ready)) &&
      Date.now() < deadline
    ) {
      Atomics.wait(wait, 0, 0, 5)
    }
    expect(fs.existsSync(first.ready)).toBe(true)
    expect(fs.existsSync(second.ready)).toBe(true)
    fs.writeFileSync(gate, 'go')

    const results = await Promise.all([first.completed, second.completed])
    expect(results.filter((result) => result.applied)).toHaveLength(1)
    expect(['first\n', 'second\n']).toContain(await readFile(file, 'utf8'))
    const broker = await WorkspaceMutationBroker.create({
      cwd: workspace,
      stateDir,
    })
    expect(
      (await broker.listReceipts()).map((receipt) => receipt.state).sort(),
    ).toEqual(['committed', 'rejected'])
  })

  test('supports exclusive create, conditional delete, and no-clobber move', async () => {
    const { workspace, stateDir } = await makeWorkspace('broker-operations')
    const broker = await WorkspaceMutationBroker.create({
      cwd: workspace,
      stateDir,
    })
    const created = path.join(workspace, 'created.txt')

    expect(await broker.createExclusive(created, 'created\n')).toMatchObject({
      applied: true,
    })
    expect(await broker.createExclusive(created, 'clobber\n')).toMatchObject({
      applied: false,
      actualHash: hashFileContent('created\n'),
    })

    const source = path.join(workspace, 'source.txt')
    const destination = path.join(workspace, 'destination.txt')
    await writeFile(source, 'move me\n')
    expect(
      await broker.conditionalMove(
        source,
        destination,
        hashFileContent('move me\n'),
      ),
    ).toMatchObject({ applied: true })
    expect(fs.existsSync(source)).toBe(false)
    expect(await readFile(destination, 'utf8')).toBe('move me\n')

    await writeFile(source, 'new source\n')
    const collision = await broker.conditionalMove(
      source,
      destination,
      hashFileContent('new source\n'),
    )
    expect(collision).toMatchObject({
      applied: false,
      actualDestinationHash: hashFileContent('move me\n'),
    })
    expect(await readFile(source, 'utf8')).toBe('new source\n')
    expect(await readFile(destination, 'utf8')).toBe('move me\n')

    expect(
      await broker.conditionalDelete(created, hashFileContent('created\n')),
    ).toMatchObject({ applied: true })
    expect(fs.existsSync(created)).toBe(false)
  })

  test('uses exact-byte hashes when rolling back a brokered CRLF transaction', async () => {
    const { workspace, stateDir } = await makeWorkspace('broker-crlf-rollback')
    const first = path.join(workspace, 'first.txt')
    const second = path.join(workspace, 'second.txt')
    await writeFile(first, 'first before\r\n')
    await writeFile(second, 'second before\r\n')
    const broker = await WorkspaceMutationBroker.create({
      cwd: workspace,
      stateDir,
    })
    const fileSystem = createNodeFileSystem({ mutationBroker: broker })
    const conditionalCommit = fileSystem.conditionalCommit!.bind(fileSystem)
    let commitCount = 0
    fileSystem.conditionalCommit = async (...args) => {
      commitCount += 1
      if (commitCount === 2) throw new Error('simulated second commit failure')
      return conditionalCommit(...args)
    }

    const result = await changeFiles({
      parameters: [
        { type: 'file', path: 'first.txt', content: 'first after\r\n' },
        { type: 'file', path: 'second.txt', content: 'second after\r\n' },
      ],
      cwd: workspace,
      fs: fileSystem,
    })

    expect(result[0]?.type === 'json' ? result[0].value : null).toMatchObject({
      outcome: 'rolled_back',
    })
    expect(await readFile(first, 'utf8')).toBe('first before\r\n')
    expect(await readFile(second, 'utf8')).toBe('second before\r\n')
  })

  test('recovers stale locks only when the recorded process is gone', async () => {
    const { workspace, stateDir } = await makeWorkspace('broker-stale-lock')
    const broker = await WorkspaceMutationBroker.create({
      cwd: workspace,
      stateDir,
    })
    const lockPath = `${broker.brokerDir}.lock`
    await mkdir(lockPath, { recursive: true })
    await writeFile(
      path.join(lockPath, 'owner.json'),
      JSON.stringify({
        schemaVersion: 1,
        token: 'dead-owner',
        pid: 999_999_999,
        acquiredAt: new Date(0).toISOString(),
      }),
    )
    const old = new Date(Date.now() - 60_000)
    await fs.promises.utimes(lockPath, old, old)

    const recovered = await WorkspaceMutationBroker.create({
      cwd: workspace,
      stateDir,
      staleLockMs: 1,
      lockTimeoutMs: 1_000,
    })
    expect(recovered.workspaceId).toBe(broker.workspaceId)
    expect(fs.existsSync(lockPath)).toBe(false)

    await mkdir(lockPath, { recursive: true })
    await writeFile(
      path.join(lockPath, 'owner.json'),
      JSON.stringify({
        schemaVersion: 1,
        token: 'live-owner',
        pid: process.pid,
        acquiredAt: new Date(0).toISOString(),
      }),
    )
    await fs.promises.utimes(lockPath, old, old)
    await expect(
      WorkspaceMutationBroker.create({
        cwd: workspace,
        stateDir,
        staleLockMs: 1,
        lockTimeoutMs: 40,
        lockPollMs: 5,
      }),
    ).rejects.toThrow('Timed out acquiring workspace mutation lock')
    expect(fs.existsSync(lockPath)).toBe(true)
    await rm(lockPath, { recursive: true, force: true })
  })

  test('reconciles a committed workspace state from an incomplete receipt', async () => {
    const { workspace, stateDir } = await makeWorkspace('broker-recovery')
    const broker = await WorkspaceMutationBroker.create({
      cwd: workspace,
      stateDir,
    })
    const target = path.join(workspace, 'file.txt')
    const staging = path.join(workspace, '.openbuff-mutation-crash.tmp')
    const before = 'before\n'
    const after = 'after\n'
    await writeFile(target, after)
    await writeFile(staging, after)
    const receiptId = '00000000-0000-4000-8000-000000000001'
    const revision = 7
    const now = new Date().toISOString()
    const receipt = {
      schemaVersion: 1,
      receiptId,
      brokerRevision: revision,
      authorityKind: 'cooperative_cas',
      repositoryId: broker.repositoryId,
      workspaceId: broker.workspaceId,
      action: 'commit',
      path: 'file.txt',
      expectedHash: hashFileContent(before),
      beforeHash: hashFileContent(before),
      afterHash: hashFileContent(after),
      state: 'prepared',
      createdAt: now,
      updatedAt: now,
      stagingPath: '.openbuff-mutation-crash.tmp',
    }
    const pendingDir = path.join(broker.brokerDir, 'pending')
    await writeFile(
      path.join(
        pendingDir,
        `${String(revision).padStart(16, '0')}-${receiptId}.json`,
      ),
      `${JSON.stringify(receipt, null, 2)}\n`,
    )

    const recovered = await WorkspaceMutationBroker.create({
      cwd: workspace,
      stateDir,
    })
    expect(fs.existsSync(staging)).toBe(false)
    expect(
      (await recovered.listReceipts()).find(
        (candidate) => candidate.receiptId === receiptId,
      )?.state,
    ).toBe('recovered_committed')
  })

  test('isolates workspace state and fails closed for invalid state roots', async () => {
    const root = await mkdtemp(
      path.join(os.tmpdir(), 'openbuff-broker-isolation-'),
    )
    roots.push(root)
    const firstRoot = path.join(root, 'first')
    const secondRoot = path.join(root, 'second')
    const stateDir = path.join(root, 'state')
    await Promise.all([mkdir(firstRoot), mkdir(secondRoot)])
    const [first, second] = await Promise.all([
      WorkspaceMutationBroker.create({ cwd: firstRoot, stateDir }),
      WorkspaceMutationBroker.create({ cwd: secondRoot, stateDir }),
    ])
    expect(first.brokerDir).not.toBe(second.brokerDir)
    await expect(
      first.createExclusive(path.join(secondRoot, 'escape.txt'), 'nope'),
    ).rejects.toThrow('outside the broker root')
    await expect(
      WorkspaceMutationBroker.create({
        cwd: firstRoot,
        stateDir: path.join(firstRoot, '.openbuff-state'),
      }),
    ).rejects.toThrow('state must be stored outside the workspace')

    const invalidStateRoot = path.join(root, 'state-file')
    await writeFile(invalidStateRoot, 'not a directory')
    await expect(
      WorkspaceMutationBroker.create({
        cwd: firstRoot,
        stateDir: invalidStateRoot,
      }),
    ).rejects.toThrow()
    expect(await stat(invalidStateRoot).then((value) => value.isFile())).toBe(
      true,
    )
  })

  test('fails closed when an incomplete receipt has an ambiguous workspace state', async () => {
    const { workspace, stateDir } = await makeWorkspace('broker-ambiguous')
    const broker = await WorkspaceMutationBroker.create({
      cwd: workspace,
      stateDir,
    })
    const target = path.join(workspace, 'file.txt')
    await writeFile(target, 'external\n')
    const receiptId = '00000000-0000-4000-8000-000000000002'
    const revision = 4
    const now = new Date().toISOString()
    const receipt = {
      schemaVersion: 1,
      receiptId,
      brokerRevision: revision,
      authorityKind: 'cooperative_cas',
      repositoryId: broker.repositoryId,
      workspaceId: broker.workspaceId,
      action: 'commit',
      path: 'file.txt',
      expectedHash: hashFileContent('before\n'),
      beforeHash: hashFileContent('before\n'),
      afterHash: hashFileContent('after\n'),
      state: 'prepared',
      createdAt: now,
      updatedAt: now,
    }
    await writeFile(
      path.join(
        broker.brokerDir,
        'pending',
        `${String(revision).padStart(16, '0')}-${receiptId}.json`,
      ),
      `${JSON.stringify(receipt, null, 2)}\n`,
    )

    await expect(
      WorkspaceMutationBroker.create({ cwd: workspace, stateDir }),
    ).rejects.toBeInstanceOf(WorkspaceMutationBrokerRecoveryError)
    expect(await readFile(target, 'utf8')).toBe('external\n')
  })
})
