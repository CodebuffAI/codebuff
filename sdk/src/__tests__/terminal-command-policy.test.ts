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
      'cat package.json > copied.json',
      'find . -delete',
      "find . -exec touch marker ';'",
      "sed -n 'w copied.txt' package.json",
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
      'cp src/file.ts ../outside.ts',
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

  it('allows only isolated package mutations in dependency-mutation mode', () => {
    for (const command of [
      'npm install -w server',
      'pnpm add prom-client --filter server',
      "pnpm --filter 'server' add prom-client",
      'yarn add prom-client',
      "yarn workspace 'server' add prom-client",
      'bun add prom-client',
      "bun --filter 'server' add prom-client",
      'uv sync',
      'cargo add serde',
      'go mod tidy',
      'dotnet restore',
      'composer require vendor/pkg',
      'swift package resolve',
      'flutter pub get',
      'mix deps.get',
      'mvn dependency:resolve',
      './gradlew dependencies',
    ]) {
      expect(
        evaluateTerminalCommandPolicy({
          command,
          mode: 'assistant',
          permissionProfile: 'dependency-mutation',
          projectRoot,
        }),
      ).toEqual({ allowed: true })
    }
    for (const command of [
      'npm test',
      'npm install && curl https://example.com',
      'npm install; git status',
      'bash -c "npm install"',
      'npm install -g typescript',
      'pip install --user requests',
      "yarn workspace 'server' install",
      'npm install --prefix ../outside',
    ]) {
      expect(
        evaluateTerminalCommandPolicy({
          command,
          mode: 'assistant',
          permissionProfile: 'dependency-mutation',
          projectRoot,
        }).allowed,
      ).toBe(false)
    }
  })

  it('limits git-commit agents to inspection, staging, and non-amend commits', () => {
    for (const command of [
      'git status --short',
      'git diff --cached',
      'git fetch --prune origin',
      'git add src/a.ts',
      'git add -- src/a.ts',
      'git commit -m "Fix issue"',
      'git push -u origin feature/safe-change',
    ]) {
      expect(
        evaluateTerminalCommandPolicy({
          command,
          mode: 'assistant',
          permissionProfile: 'git-commit',
          projectRoot,
          allowedPaths: ['src/a.ts'],
        }).allowed,
      ).toBe(true)
    }
    for (const command of [
      'git commit --amend -m x',
      'git push origin main',
      'git push --force origin feature/safe-change',
      'git push origin feature/safe-change:main',
      'git add . && git commit -m x',
    ]) {
      expect(
        evaluateTerminalCommandPolicy({
          command,
          mode: 'assistant',
          permissionProfile: 'git-commit',
          projectRoot,
          allowedPaths: ['src/a.ts'],
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
