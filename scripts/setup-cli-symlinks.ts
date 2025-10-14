#!/usr/bin/env bun

import { existsSync, mkdirSync, symlinkSync, rmSync } from 'fs'
import { join } from 'path'
import { execSync } from 'child_process'

const ROOT_DIR = process.cwd()
const CLI_DIR = join(ROOT_DIR, 'cli')
const ROOT_NODE_MODULES = join(ROOT_DIR, 'node_modules')

console.log('Setting up OpenTUI symlinks for CLI workspace...')

// Check if source packages exist (they're in packages/ subdirectories)
const corePackagePath = join(ROOT_NODE_MODULES, '@opentui/core/packages/core')
if (!existsSync(corePackagePath)) {
  console.error('⚠️  Warning: OpenTUI packages not found in root node_modules')
  console.error(
    'Please ensure "bun install" completed successfully at the root level',
  )
  process.exit(1)
}

// Build OpenTUI packages if not already built
const coreDistPath = join(corePackagePath, 'dist')
if (!existsSync(coreDistPath)) {
  console.log('Building OpenTUI packages (this may take a moment)...')
  try {
    execSync('bun run build', {
      cwd: join(ROOT_NODE_MODULES, '@opentui/core'),
      stdio: 'ignore',
    })
  } catch (error) {
    console.warn('Build failed, but continuing anyway...')
  }
}

function createSymlink(target: string, linkPath: string) {
  try {
    // Remove existing symlink or directory if it exists
    if (existsSync(linkPath)) {
      rmSync(linkPath, { recursive: true, force: true })
    }
    symlinkSync(target, linkPath, 'junction') // 'junction' works on both Windows and Unix
  } catch (error) {
    console.warn(`Failed to create symlink ${linkPath}:`, error)
  }
}

// Create symlinks in the root node_modules so packages can find each other
const opentunCoreNodeModules = join(
  ROOT_NODE_MODULES,
  '@opentui/core/node_modules/@opentui',
)
const opentuiReactNodeModules = join(
  ROOT_NODE_MODULES,
  '@opentui/react/node_modules/@opentui',
)

mkdirSync(opentunCoreNodeModules, { recursive: true })
mkdirSync(opentuiReactNodeModules, { recursive: true })

const corePackage = join(ROOT_NODE_MODULES, '@opentui/core/packages/core')
const reactPackage = join(ROOT_NODE_MODULES, '@opentui/react/packages/react')

createSymlink(corePackage, join(opentunCoreNodeModules, 'core'))
createSymlink(corePackage, join(opentuiReactNodeModules, 'core'))
createSymlink(reactPackage, join(opentuiReactNodeModules, 'react'))

// Create the @opentui directory in CLI's node_modules
const cliOpentuiDir = join(CLI_DIR, 'node_modules/@opentui')
mkdirSync(cliOpentuiDir, { recursive: true })

// Create symlinks in CLI workspace
createSymlink(corePackage, join(cliOpentuiDir, 'core'))
createSymlink(reactPackage, join(cliOpentuiDir, 'react'))

const darwinArm64 = join(ROOT_NODE_MODULES, '@opentui/core-darwin-arm64')
if (existsSync(darwinArm64)) {
  createSymlink(darwinArm64, join(cliOpentuiDir, 'core-darwin-arm64'))
}

console.log('✅ OpenTUI symlinks created successfully')
