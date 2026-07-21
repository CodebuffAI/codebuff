import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
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

  it('allows multiple git commit message args containing path-like tokens', () => {
    for (const command of [
      'git commit -m "subject" -m "body with / slashes and (from ?? to) code"',
      'git commit -m "Improve gating" -m "base2 ran query_index / inspect_codebase_structure discovery"',
      "git commit -m 'message with /tmp/path and ~/home references'",
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
  })

  it('rejects raw newlines before normalization for non-full-access profiles', () => {
    for (const [permissionProfile, command] of [
      ['git-commit', 'git status --short\ntouch pwned.txt'],
      ['git-commit', 'git log --oneline -1\nsh -c "touch pwned.txt"'],
      ['read-only', 'rg TODO src\ntouch pwned.txt'],
      ['dependency-mutation', 'npm install\ncurl https://example.com'],
      ['tmux-test', 'tmux list-sessions\ntouch pwned.txt'],
      ['validation-diagnosis', 'cat > repro/fixture.log\ntouch pwned.txt'],
    ] as const) {
      expect(
        evaluateTerminalCommandPolicy({
          command,
          mode: 'assistant',
          permissionProfile,
          projectRoot,
          allowedPaths: ['src/a.ts'],
        }).allowed,
      ).toBe(false)
    }
  })

  it('rejects shell composition inside double-quoted commit messages', () => {
    for (const command of [
      'git commit -m "$(rm -rf /)"',
      'git commit -m "`whoami`"',
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

  it('allows read-only git inspection commands and read-only composition for git-commit agents', () => {
    for (const command of [
      'git merge-base --is-ancestor a08fd146d b2923df8c',
      'git merge-base HEAD origin/main',
      'git ls-remote origin refs/heads/feature/x',
      'git branch -r',
      'git branch -rv',
      'git remote -v',
      'git show-ref --heads',
      'git describe --tags',
      'git config --get user.name',
      'git cat-file -p HEAD',
      'git log --oneline -1 a08fd146d; git branch -r',
      'git merge-base --is-ancestor A B && git rev-parse HEAD',
      'git log --oneline -5 | git branch --show-current',
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
      'git branch -d feature/x',
      'git branch newname',
      'git config user.name bob',
      'git config --unset user.name',
      'git log --oneline -1 | sh',
      'git log --oneline -1; rm -rf src',
      'git log && git push origin main',
      'git merge-base A B; git commit -m x',
      'git merge-base A B; git add src/a.ts',
      'git log --oneline $(whoami)',
      'git branch -r `whoami`',
      'git push --force origin main',
      'git commit --amend -m x',
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

  it('rejects quoted substitution, redirection, and mutating flags in git-commit read-only commands', () => {
    for (const command of [
      'git remote show "$(id)"',
      'git show-ref "`id`"',
      'git branch -r "$(id)"',
      "git log; git branch -r '> /workspace/project/pwned.txt'",
      'git show-ref --delete refs/heads/x',
      'git cat-file -p HEAD > /tmp/x',
      'git cat-file -p "$(id)"',
      'git merge-base A "$(id)"',
      'git diff --output=pwned.patch',
      'git diff --output pwned.patch',
      'git diff -o pwned.patch',
      'git diff --ext-diff',
      'git log --textconv --oneline -1',
      'git status --exec-path=/tmp/git-helpers',
      'git status --short; git diff --output=pwned.patch',
      'git log --oneline -1 && git show --ext-diff HEAD',
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
    for (const command of [
      'rm -rf src',
      'touch workspace.txt /tmp/tmux-fixture.txt',
      'env X=1 touch workspace.txt',
      'env -i touch workspace.txt',
      'env -- touch workspace.txt',
      'command -- touch workspace.txt',
      '/usr/bin/touch workspace.txt',
      'echo x>workspace.txt',
      'echo x>workspace.txt /tmp/tmux-fixture.txt',
      'X=.; X=$X$X; touch /tmp/$X/workspace/project/pwned',
      'echo x>/tmp/$X/out',
      'touch /tmp/../workspace/project/pwned',
      'touch /tmp/tmux-fixture-link/tmux-pwned.txt',
      'echo x>/tmp/tmux-fixture-link/tmux-pwned.txt',
      'touch "/tmp/tmux-fixture.txt"',
      'echo $(touch workspace.txt)',
      'echo "$(touch workspace.txt)"',
      'echo `touch workspace.txt`',
      'echo "`touch workspace.txt`"',
      'tee workspace.txt',
      'command tee workspace.txt',
      'env X=1 tee workspace.txt',
      '/usr/bin/tee workspace.txt',
      'ln /tmp/source workspace-link',
      'command ln /tmp/source workspace-link',
      'env X=1 ln /tmp/source workspace-link',
      '/bin/ln /tmp/source workspace-link',
      "perl -pi -e 's/x/y/' workspace.txt",
      "/usr/bin/perl -pi -e 's/x/y/' workspace.txt",
      "sed -i 's/a/b/' workspace.txt",
      "sed -i'' 's/a/b/' /tmp/tmux-fixture.txt",
      "sed -i\"\" 's/a/b/' /tmp/tmux-fixture.txt",
      "env X=1 sed -i'' 's/a/b/' /tmp/tmux-fixture.txt",
      "command /usr/bin/sed -i\"\" 's/a/b/' /tmp/tmux-fixture.txt",
      "env X=1 command /usr/bin/sed --in-place 's/a/b/' workspace.txt",
      'tar -xf /tmp/payload.tar -C .',
      'unzip /tmp/payload.zip -d .',
      'patch -p1 < /tmp/payload.patch',
      'rsync /tmp/source ./',
      "bash -c 'echo x>workspace.txt'",
      "sh -c 'touch workspace.txt'",
      "/bin/bash -c 'touch workspace.txt'",
      "env X=1 bash -c 'touch workspace.txt'",
      "env -i bash -c 'touch workspace.txt'",
      "env -- node -e 'require(\"fs\").writeFileSync(\"workspace.txt\", \"x\")'",
      "env -u NAME bash -c 'touch workspace.txt'",
      "command -- bash -c 'touch workspace.txt'",
      "node -e 'require(\"fs\").writeFileSync(\"workspace.txt\", \"x\")'",
      "nodejs -e 'require(\"fs\").writeFileSync(\"workspace.txt\", \"x\")'",
      "python -c 'open(\"workspace.txt\", \"w\")'",
      "python3 -c 'open(\"workspace.txt\", \"w\")'",
      "perl -e 'open STDOUT, \">\", \"workspace.txt\"'",
      "ruby -e 'File.write(\"workspace.txt\", \"x\")'",
      "awk 'BEGIN { print \"x\" > \"workspace.txt\" }'",
      "php -r 'file_put_contents(\"workspace.txt\", \"x\");'",
      "lua -e 'io.open(\"workspace.txt\", \"w\")'",
      "deno eval 'await Deno.writeTextFile(\"workspace.txt\", \"w\")'",
      "bun -e 'require(\"fs\").writeFileSync(\"workspace.txt\", \"x\")'",
      'env X=1 /usr/bin/busybox touch workspace-pwned.txt',
      'command /usr/bin/find . -exec touch workspace-pwned.txt \\;',
      'env X=1 /usr/bin/xargs touch workspace-pwned.txt',
      'command /usr/bin/git config --file workspace-pwned.txt attacker.value owned',
      'X=1 busybox touch workspace-pwned.txt',
      'X=1 Y=2 /usr/bin/busybox touch workspace-pwned.txt',
      'X=1 find . -exec touch workspace-pwned.txt \\;',
      'X=1 xargs touch workspace-pwned.txt',
      'X=1 make -f attacker.mk',
      'X=1 git config --file workspace-pwned.txt attacker.value owned',
      'X=1 command git config --file workspace-pwned.txt attacker.value owned',
      'X=touch; $X workspace-pwned.txt',
      'X=git; $X config --file workspace-pwned.txt attacker.value owned',
      'X=touch; "$X" workspace-pwned.txt',
      'touch $@',
      'touch "$@"',
      'touch $*',
      'touch "$*"',
      'touch $0',
      'touch "$0"',
      'touch $1',
      'touch "$1"',
      'if :; then touch workspace-pwned; fi',
      'f(){ touch workspace-pwned; }; f',
      '( touch workspace-pwned.txt )',
      'command ( touch workspace-pwned.txt )',
      'nice busybox touch /tmp/tmux-fixture.txt',
      'nice git config --file /tmp/tmux-fixture.txt attacker.value owned',
      'env X=1 /usr/bin/nice busybox touch /tmp/tmux-fixture.txt',
      'command /usr/bin/nohup touch /tmp/tmux-fixture.txt',
      'stdbuf -o0 touch /tmp/tmux-fixture.txt',
      'timeout 1 touch /tmp/tmux-fixture.txt',
      'time touch /tmp/tmux-fixture.txt',
      'setsid touch /tmp/tmux-fixture.txt',
      'chrt -o 0 touch /tmp/tmux-fixture.txt',
      'ionice -c3 touch /tmp/tmux-fixture.txt',
      'flock /tmp/tmux-fixture.txt touch /tmp/tmux-fixture.txt',
      'unshare --fork touch /tmp/tmux-fixture.txt',
    ]) {
      expect(
        evaluateTerminalCommandPolicy({
          command,
          mode: 'assistant',
          permissionProfile: 'tmux-test',
          projectRoot,
        }).allowed,
      ).toBe(false)
    }
    for (const command of [
      "printf '$X ${X}'",
      'rg TODO src >/dev/null',
    ]) {
      expect(
        evaluateTerminalCommandPolicy({
          command,
          mode: 'assistant',
          permissionProfile: 'tmux-test',
          projectRoot,
        }).allowed,
      ).toBe(true)
    }
  })

  it('rejects tmux fixture writes before a checked target can be replaced', () => {
    const fixture = path.join('/tmp', `tmux-fixture-${randomUUID()}`)
    const outsideTarget = path.join('/tmp', `tmux-outside-${randomUUID()}`)

    try {
      fs.writeFileSync(fixture, 'candidate fixture')
      const policy = evaluateTerminalCommandPolicy({
        command: `echo x>${fixture}`,
        mode: 'assistant',
        permissionProfile: 'tmux-test',
        projectRoot,
      })
      fs.writeFileSync(outsideTarget, 'outside')
      fs.rmSync(fixture)
      fs.symlinkSync(outsideTarget, fixture, 'file')

      // The candidate was replaced after policy evaluation, but the policy
      // permits no shell write to execute against either path state.
      expect(policy.allowed).toBe(false)
      expect(
        evaluateTerminalCommandPolicy({
          command: `touch ${fixture}`,
          mode: 'assistant',
          permissionProfile: 'tmux-test',
          projectRoot,
        }).allowed,
      ).toBe(false)
    } finally {
      fs.rmSync(fixture, { force: true })
      fs.rmSync(outsideTarget, { force: true })
    }
  })

  it('preserves workspace containment for tmux-test commands', () => {
    for (const command of [
      'touch workspace.txt',
      'echo x>workspace.txt',
      'touch /workspace/project/pwned.txt',
      'echo x>/workspace/project/pwned.txt',
    ]) {
      expect(
        evaluateTerminalCommandPolicy({
          command,
          mode: 'assistant',
          permissionProfile: 'tmux-test',
          projectRoot,
        }).allowed,
      ).toBe(false)
    }
  })

  it('normalizes tmux executable quoting and escaping while leaving arguments inert', () => {
    for (const command of [
      "'sh' -c 'touch workspace.txt'",
      's\\h -c "touch workspace.txt"',
      "'/bin/sh' -c 'touch workspace.txt'",
      "env X=1 'sh' -c 'touch workspace.txt'",
      'command s\\h -c "touch workspace.txt"',
      "env X=1 command '/bin/sh' -c 'touch workspace.txt'",
      "'sh -c 'touch workspace.txt",
      's\\',
    ]) {
      expect(
        evaluateTerminalCommandPolicy({
          command,
          mode: 'assistant',
          permissionProfile: 'tmux-test',
          projectRoot,
        }).allowed,
      ).toBe(false)
    }

    for (const command of ["printf '%s' 'sh'", "echo 's\\h'"]) {
      expect(
        evaluateTerminalCommandPolicy({
          command,
          mode: 'assistant',
          permissionProfile: 'tmux-test',
          projectRoot,
        }),
      ).toEqual({ allowed: true })
    }
  })

  it('rejects git fetch in tmux-test while preserving Git inspection', () => {
    expect(
      evaluateTerminalCommandPolicy({
        command: 'git fetch --prune origin',
        mode: 'assistant',
        permissionProfile: 'tmux-test',
        projectRoot,
      }).allowed,
    ).toBe(false)
    expect(
      evaluateTerminalCommandPolicy({
        command: 'git status --short',
        mode: 'assistant',
        permissionProfile: 'tmux-test',
        projectRoot,
      }),
    ).toEqual({ allowed: true })
  })

  it('rejects tmux fixtures that are symlinks outside /tmp', () => {
    const fixtureLink = path.join('/tmp', `tmux-fixture-link-${randomUUID()}`)

    try {
      fs.symlinkSync(process.cwd(), fixtureLink, 'dir')

      for (const command of [
        `touch ${fixtureLink}`,
        `echo x>${fixtureLink}`,
      ]) {
        expect(
          evaluateTerminalCommandPolicy({
            command,
            mode: 'assistant',
            permissionProfile: 'tmux-test',
            projectRoot,
          }).allowed,
        ).toBe(false)
      }
    } finally {
      fs.rmSync(fixtureLink, { force: true })
    }
  })

  it('rejects tmux fixture hard links', () => {
    const fixtureSource = path.join('/tmp', `tmux-fixture-source-${randomUUID()}`)
    const fixtureLink = path.join('/tmp', `tmux-fixture-link-${randomUUID()}`)

    try {
      fs.writeFileSync(fixtureSource, 'fixture')
      fs.linkSync(fixtureSource, fixtureLink)

      for (const command of [`touch ${fixtureLink}`, `echo x>${fixtureLink}`]) {
        expect(
          evaluateTerminalCommandPolicy({
            command,
            mode: 'assistant',
            permissionProfile: 'tmux-test',
            projectRoot,
          }).allowed,
        ).toBe(false)
      }
    } finally {
      fs.rmSync(fixtureLink, { force: true })
      fs.rmSync(fixtureSource, { force: true })
    }
  })

  it('enforces /tmp operands for every wrapped tmux filesystem mutator', () => {
    for (const executable of ['rm', 'mv', 'cp', 'mkdir', 'touch', 'truncate', 'install']) {
      expect(
        evaluateTerminalCommandPolicy({
          command: `env X=1 ${executable} workspace.txt`,
          mode: 'assistant',
          permissionProfile: 'tmux-test',
          projectRoot,
        }).allowed,
      ).toBe(false)
    }
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
    expect(
      evaluateTerminalCommandPolicy({
        command: 'rg TODO src >/dev/null',
        mode: 'assistant',
        permissionProfile: 'tmux-test',
        projectRoot,
      }),
    ).toEqual({ allowed: true })
  })

  it('allows diagnostic repro writes and in-project traversal for validation-diagnosis', () => {
    for (const command of [
      // A bounded quoted heredoc body is inert data and is stripped before
      // policy normalization; the redirect target remains containment-checked.
      "cat > repro/fixture.log <<'EOF'\nfirst diagnostic line\nsecond diagnostic line\nEOF",
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
      // Shell removes these escapes before resolving the redirect target, so
      // the policy must reject them rather than contain their raw spelling.
      'cat > \\../outside',
      'cat > ..\\/outside',
      "cat > \\../outside <<'EOF'\nsafe body\nEOF",
      "cat > ..\\/outside <<'EOF'\nsafe body\nEOF",
      'cat packages/../../escape.log',
      'cat > repro/fixture.log | sh',
      // An earlier delimiter ends the shell heredoc; subsequent lines would
      // execute as shell commands and must not be accepted by a greedy parser.
      "cat > repro/fixture.log <<'EOF'\nfirst diagnostic line\nEOF\necho pwned\nEOF",
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

  it('keeps multiline diagnostic heredocs fail-closed for tmux-test', () => {
    expect(
      evaluateTerminalCommandPolicy({
        command:
          "cat > repro/fixture.log <<'EOF'\nfirst diagnostic line\nsecond diagnostic line\nEOF",
        mode: 'assistant',
        permissionProfile: 'tmux-test',
        projectRoot,
      }).allowed,
    ).toBe(false)
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
