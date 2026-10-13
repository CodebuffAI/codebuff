import { describe, expect, test } from 'bun:test'

import {
  PROJECT_UNDERSTANDING_MAX_READ_BYTES,
  projectUnderstandingReadRefusal,
} from '../skipped-files'

describe('projectUnderstandingReadRefusal', () => {
  test('refuses lockfiles by name, in any folder and any case', () => {
    for (const path of [
      'uv.lock',
      'package-lock.json',
      'npm-shrinkwrap.json',
      'yarn.lock',
      'pnpm-lock.yaml',
      'bun.lock',
      'bun.lockb',
      'deno.lock',
      'Cargo.lock',
      'poetry.lock',
      'Pipfile.lock',
      'pdm.lock',
      'conda-lock.yml',
      'composer.lock',
      'Gemfile.lock',
      'go.sum',
      'go.work.sum',
      'ios/Podfile.lock',
      'App.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved',
      'pubspec.lock',
      'mix.lock',
      'flake.lock',
      'src/App/packages.lock.json',
      'gradle.lockfile',
      'buildscript-gradle.lockfile',
      'infra/.terraform.lock.hcl',
      'apps\\web\\PNPM-LOCK.YAML',
      'some-tool.lock',
    ]) {
      const refusal = projectUnderstandingReadRefusal(path)
      expect(refusal).toStartWith('[BLOCKED]')
      expect(refusal).toContain('Lockfile')
    }
  })

  test('refuses generated files and anything under a dependency or build folder', () => {
    for (const path of [
      'public/vendor.min.js',
      'static/app.min.css',
      'dist/index.js.map',
      'assets/app.bundle.js',
      'node_modules/react/package.json',
      'apps/web/node_modules/next/package.json',
      'packages/ui/dist/package.json',
      'vendor/github.com/pkg/errors/go.mod',
      '.venv/lib/python3.12/site-packages/x/pyproject.toml',
      'venv/pyvenv.cfg',
      'src/__pycache__/main.cpython-312.pyc.txt',
      'dist/package.json',
      'build/config.json',
      '.next/build-manifest.json',
      'out/index.html',
      'target/debug/build.json',
      'android/.gradle/config.properties',
      'ios/Pods/Manifest.txt',
    ]) {
      const refusal = projectUnderstandingReadRefusal(path)
      expect(refusal).toStartWith('[BLOCKED]')
      expect(refusal).toContain('Generated or dependency file')
    }
  })

  test('refuses a file over the size cap, and only when the size is known', () => {
    const refusal = projectUnderstandingReadRefusal(
      'data/fixtures.json',
      PROJECT_UNDERSTANDING_MAX_READ_BYTES + 1,
    )
    expect(refusal).toStartWith('[FILE_TOO_LARGE]')
    expect(refusal).toContain('too large to be a manifest')
    expect(
      projectUnderstandingReadRefusal(
        'data/fixtures.json',
        PROJECT_UNDERSTANDING_MAX_READ_BYTES,
      ),
    ).toBeNull()
    expect(projectUnderstandingReadRefusal('data/fixtures.json')).toBeNull()
    expect(PROJECT_UNDERSTANDING_MAX_READ_BYTES).toBe(100 * 1024)
  })

  test('reads manifests, configs and source, including look-alike names', () => {
    for (const path of [
      'package.json',
      'pyproject.toml',
      'Cargo.toml',
      'go.mod',
      'Gemfile',
      'Podfile',
      'Package.swift',
      'build.gradle',
      'build.gradle.kts',
      'docker-compose.yml',
      'apps/web/next.config.js',
      'src/output.ts',
      'scripts/lock.ts',
      'src/locks/mutex.py',
      'docs/sitemap.md',
      './README.md',
      '.github/workflows/ci.yml',
    ]) {
      expect(projectUnderstandingReadRefusal(path, 2_000)).toBeNull()
    }
  })
})
