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
      'bun run --cwd sdk typecheck',
      "rg -n 'foo|bar' src",
      'rg TODO src | tee /tmp/diagnostics.log | tail -20',
      "which blender && blender --version 2>/dev/null | head -3; echo '---'; ls -la public/models/ 2>/dev/null; echo '---'; du -h public/models/living-organism.glb 2>/dev/null",
      'rg TODO src || true',
      'blender --version 2>&1 | head -3',
      'pwd; git status --short',
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

  it('allows unfamiliar inspection commands and denies dangerous operations in read-only mode', () => {
    for (const command of [
      'python -m json.tool package.json',
      'command -v blender && blender --background --version 2>/dev/null',
      'some-project-diagnostic --report-format json src',
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

    for (const command of [
      'rg TODO src | sh',
      'rm src/file.ts',
      'git commit -m x',
      'bun install',
      "bun --filter 'server' add left-pad",
      "pnpm --filter 'server' install",
      'kubectl apply -f deploy.yaml',
      'curl -X POST https://example.com',
      'rg TODO src | tee diagnostics.log',
      'pwd; sudo rm src/file.ts',
      'pwd; command sh -c "rm src/file.ts"',
      'find src -print0 | xargs -0 rm',
      'gh pr create --title test',
      'cat package.json > copied.json',
      'find . -delete',
      "find . -exec touch marker ';'",
      "sed -n 'w copied.txt' package.json",
      'rg TODO src; rm src/file.ts',
      'rg TODO src & rm src/file.ts',
      'echo $(rm src/file.ts)',
      // Regression guard: base read-only keeps denying the diagnostic repro
      // shapes that validation-diagnosis intentionally relaxes below.
      "cat > repro/fixture.log <<'EOF'",
      'rg TODO packages/../src',
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

  it('denies in-place edits, env-reading one-liners, and destructive deletion in read-only mode', () => {
    for (const command of [
      // In-place file edit flags (sed -i was already covered by
      // findReadOnlyMutation; perl/awk forms are the hardened gap).
      "perl -pi -e 's/x/y/' file.txt",
      "perl -i -pe 's/x/y/' file.txt",
      "awk -i inplace '{print $1}' file.txt",
      "sed -i 's/x/y/' file.txt",
      // Interpreter one-liners that read the inherited process environment
      // (children see the full process.env, including API keys).
      "node -p 'process.env'",
      "node -e 'console.log(process.env.API_KEY)'",
      "ruby -e 'puts ENV.to_h'",
      "python -c 'import os; print(os.environ)'",
      "python3 -c 'import os; print(os.getenv(\"HOME\"))'",
      "perl -e 'print $ENV{HOME}'",
      // Recursive/force deletion and destructive git verbs (already covered
      // by the filesystem/git tuples; locked in as regression guards).
      'rm -rf src',
      'git clean -fdx',
      'git checkout -- src/file.ts',
      'git restore src/file.ts',
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

  it('keeps allowing inspection commands that merely mention environment text', () => {
    for (const command of [
      'rg API_KEY src',
      'rg process.env src',
      'node script.js',
      'python -m json.tool package.json',
      "python -c 'import os; print(os.getcwd())'",
      "perl -ne 'print' file.txt",
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

  it('allows routine workspace effects but preserves hard containment', () => {
    for (const command of [
      'git push origin feature/work',
      'git push origin main',
      'bun add left-pad',
      'curl https://example.com/asset.glb',
      'kubectl apply -f deploy.yaml',
    ]) {
      expect(
        evaluateTerminalCommandPolicy({
          command,
          mode: 'assistant',
          permissionProfile: 'workspace-write',
          projectRoot,
        }).allowed,
      ).toBe(true)
    }
    for (const command of [
      'git push --force origin feature/work',
      'cat /etc/passwd',
      'cat ~/.config/openbuff/config',
      'printenv',
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

  it('allows in-project traversal but rejects escaping traversal in workspace-write', () => {
    // `..` segments that still resolve inside the project (referencing a
    // sibling tree from a package subdirectory) are allowed.
    expect(
      evaluateTerminalCommandPolicy({
        command: 'rg TODO packages/../src',
        mode: 'assistant',
        permissionProfile: 'workspace-write',
        projectRoot,
      }),
    ).toEqual({ allowed: true })
    // `..` segments that escape the project root stay blocked.
    expect(
      evaluateTerminalCommandPolicy({
        command: 'cat packages/../../etc/passwd',
        mode: 'assistant',
        permissionProfile: 'workspace-write',
        projectRoot,
      }).allowed,
    ).toBe(false)
  })

  it('allows the word source inside quoted arguments but blocks real shell indirection in workspace-write', () => {
    // "source" appearing only inside a quoted argument is not indirection.
    expect(
      evaluateTerminalCommandPolicy({
        command: "grep 'maps source files' foo.txt",
        mode: 'assistant',
        permissionProfile: 'workspace-write',
        projectRoot,
      }),
    ).toEqual({ allowed: true })
    // Commands that actually start with source/eval stay blocked.
    for (const command of [
      'source ./script.sh',
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

  it('allows routine dependency mutation inline', () => {
    const decision = evaluateTerminalCommandPolicy({
      command: 'bun install && bun run typecheck',
      mode: 'assistant',
      permissionProfile: 'workspace-write',
      projectRoot,
    })

    expect(decision).toEqual({ allowed: true })
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

  it('applies outside-absolute-path containment to tmux-test mode', () => {
    for (const command of ['cat /etc/passwd', 'cat ~/.ssh/id_rsa']) {
      expect(
        evaluateTerminalCommandPolicy({
          command,
          mode: 'assistant',
          permissionProfile: 'tmux-test',
          projectRoot,
        }).allowed,
      ).toBe(false)
    }
    // Explicit /tmp fixtures stay allowed for tmux-test.
    expect(
      evaluateTerminalCommandPolicy({
        command: 'touch /tmp/tmux-fixture.txt',
        mode: 'assistant',
        permissionProfile: 'tmux-test',
        projectRoot,
      }).allowed,
    ).toBe(true)
  })

  it('allows diagnostic repro writes and in-project traversal for validation-diagnosis', () => {
    for (const command of [
      // Heredoc/write redirection into project-relative diagnostic files.
      "cat > repro/fixture.log <<'EOF'",
      'cat > repro/fixture.log',
      'cat >> repro/fixture.log',
      'cat > /workspace/project/repro/fixture.log',
      // `..` segments that still resolve inside the project (repro referencing
      // a sibling tree from a package subdirectory).
      'rg TODO packages/../src',
    ]) {
      expect(
        evaluateTerminalCommandPolicy({
          command,
          mode: 'assistant',
          permissionProfile: 'validation-diagnosis',
          projectRoot,
        }),
      ).toEqual({ allowed: true })
    }
  })

  it('keeps validation-diagnosis writes and traversal inside the project', () => {
    for (const command of [
      "cat > ../escape.log <<'EOF'",
      'cat > ../escape.log',
      "cat > /etc/x <<'EOF'",
      'cat > /etc/x',
      'cat packages/../../escape.log',
      'cat > repro/fixture.log | sh',
    ]) {
      expect(
        evaluateTerminalCommandPolicy({
          command,
          mode: 'assistant',
          permissionProfile: 'validation-diagnosis',
          projectRoot,
        }).allowed,
      ).toBe(false)
    }
  })

  it('denies env-reading one-liners and in-place edits under validation-diagnosis too', () => {
    for (const command of [
      "node -p 'process.env'",
      "python -c 'import os; print(os.environ)'",
      "perl -pi -e 's/x/y/' repro/fixture.log",
    ]) {
      expect(
        evaluateTerminalCommandPolicy({
          command,
          mode: 'assistant',
          permissionProfile: 'validation-diagnosis',
          projectRoot,
        }).allowed,
      ).toBe(false)
    }
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
