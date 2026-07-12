import { describe, expect, it } from 'bun:test'

import { evaluateTerminalCommandPolicy } from '../tools/terminal-command-policy'

const projectRoot = '/workspace/project'

describe('terminal command permission policy', () => {
  it('allows inspection and validation commands in read-only mode', () => {
    for (const command of [
      'rg -n TODO src',
      'git status --short',
      'bun test',
      'bun run typecheck',
    ]) {
      expect(
        evaluateTerminalCommandPolicy({
          command,
          mode: 'assistant',
          permissionProfile: 'read-only',
          projectRoot,
        }),
      ).toEqual({ allowed: true })
    }
  })

  it('denies shell composition and mutation in read-only mode', () => {
    for (const command of [
      'rg TODO src | sh',
      'rm src/file.ts',
      'git commit -m x',
    ]) {
      expect(
        evaluateTerminalCommandPolicy({
          command,
          mode: 'assistant',
          permissionProfile: 'read-only',
          projectRoot,
        }).allowed,
      ).toBe(false)
    }
  })

  it('denies remote, dependency, git-history, and outside-project effects in workspace mode', () => {
    for (const command of [
      'git push origin main',
      'bun add left-pad',
      'curl https://example.com',
      'kubectl apply -f deploy.yaml',
      'cat /etc/passwd',
      'cat /tmp/../../etc/passwd',
      'bash -c "cat /etc/passwd"',
      'eval "git push origin main"',
    ]) {
      expect(
        evaluateTerminalCommandPolicy({
          command,
          mode: 'assistant',
          permissionProfile: 'workspace-write',
          projectRoot,
        }).allowed,
      ).toBe(false)
    }
  })

  it('limits git-commit agents to inspection, staging, and non-amend commits', () => {
    for (const command of [
      'git status --short',
      'git diff --cached',
      'git add src/a.ts',
      'git commit -m "Fix issue"',
    ]) {
      expect(
        evaluateTerminalCommandPolicy({
          command,
          mode: 'assistant',
          permissionProfile: 'git-commit',
          projectRoot,
        }).allowed,
      ).toBe(true)
    }
    for (const command of [
      'git commit --amend -m x',
      'git push origin main',
      'git add . && git commit -m x',
    ]) {
      expect(
        evaluateTerminalCommandPolicy({
          command,
          mode: 'assistant',
          permissionProfile: 'git-commit',
          projectRoot,
        }).allowed,
      ).toBe(false)
    }
  })

  it('blocks tmux agents from direct workspace mutation', () => {
    expect(
      evaluateTerminalCommandPolicy({
        command: 'rm -rf src',
        mode: 'assistant',
        permissionProfile: 'tmux-test',
        projectRoot,
      }).allowed,
    ).toBe(false)
    expect(
      evaluateTerminalCommandPolicy({
        command: 'touch /tmp/tmux-fixture.txt',
        mode: 'assistant',
        permissionProfile: 'tmux-test',
        projectRoot,
      }).allowed,
    ).toBe(true)
  })

  it('allows explicit full-access or user-originated commands', () => {
    expect(
      evaluateTerminalCommandPolicy({
        command: 'git commit -m approved',
        mode: 'assistant',
        permissionProfile: 'full-access',
        projectRoot,
      }),
    ).toEqual({ allowed: true })
    expect(
      evaluateTerminalCommandPolicy({
        command: 'git push origin main',
        mode: 'user',
        permissionProfile: 'read-only',
        projectRoot,
      }),
    ).toEqual({ allowed: true })
  })

  it('allows only owned GitHub shallow clones in librarian mode', () => {
    expect(
      evaluateTerminalCommandPolicy({
        command:
          "git clone --depth 1 'https://github.com/acme/repo.git' '/tmp/librarian-repo-12345'",
        mode: 'assistant',
        permissionProfile: 'librarian-read-only',
        projectRoot,
      }),
    ).toEqual({ allowed: true })
    expect(
      evaluateTerminalCommandPolicy({
        command: "git clone https://evil.example/repo '/tmp/librarian-repo-1'",
        mode: 'assistant',
        permissionProfile: 'librarian-read-only',
        projectRoot,
      }).allowed,
    ).toBe(false)
  })
})
