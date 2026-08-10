import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import os from 'os'
import path from 'path'

import { describe, test, expect } from 'bun:test'

import {
  getProjectRoot,
  setProjectRoot,
  tryGetProjectRoot,
} from '../../project-files'
import {
  __resetLocalAgentRegistryForTests,
  getLoadedMCPServers,
  initializeAgentRegistry,
  loadAgentDefinitions,
} from '../../utils/local-agent-registry'
import {
  activateProject,
  shouldShowProjectPicker,
} from '../../utils/project-picker'

describe('cli/utils/project-picker', () => {
  test('returns true when start cwd is home directory', () => {
    const root = path.parse(process.cwd()).root
    const homeDir = path.join(root, 'home', 'test-user')

    expect(shouldShowProjectPicker(homeDir, homeDir)).toBe(true)
  })

  test('returns true when start cwd is a parent of home directory', () => {
    const root = path.parse(process.cwd()).root
    const homeDir = path.join(root, 'home', 'test-user')
    const parentDir = path.dirname(homeDir)

    expect(shouldShowProjectPicker(parentDir, homeDir)).toBe(true)
    expect(shouldShowProjectPicker(root, homeDir)).toBe(true)
  })

  test('returns false when start cwd is a child of home directory', () => {
    const root = path.parse(process.cwd()).root
    const homeDir = path.join(root, 'home', 'test-user')
    const childDir = path.join(homeDir, 'projects')

    expect(shouldShowProjectPicker(childDir, homeDir)).toBe(false)
  })

  test('returns false when start cwd is a sibling of home directory', () => {
    const root = path.parse(process.cwd()).root
    const homeDir = path.join(root, 'home', 'test-user')
    const siblingDir = path.join(root, 'home', 'other-user')

    expect(shouldShowProjectPicker(siblingDir, homeDir)).toBe(false)
  })

  test('reloads MCP servers after selecting a project', async () => {
    const originalCwd = process.cwd()
    const originalProjectRoot = tryGetProjectRoot()
    const tempDir = mkdtempSync(path.join(os.tmpdir(), 'freebuff-project-'))
    const launchDir = path.join(tempDir, 'launch')
    const projectDir = path.join(tempDir, 'project')
    const agentsDir = path.join(projectDir, '.agents')

    mkdirSync(launchDir)
    mkdirSync(agentsDir, { recursive: true })
    writeFileSync(
      path.join(agentsDir, 'mcp.json'),
      JSON.stringify({
        mcpServers: {
          projectPickerServer: {
            command: 'node',
            args: ['server.js'],
          },
        },
      }),
    )

    try {
      process.chdir(launchDir)
      setProjectRoot(launchDir)
      __resetLocalAgentRegistryForTests()
      await initializeAgentRegistry()

      expect(getLoadedMCPServers().projectPickerServer).toBeUndefined()

      await activateProject(projectDir)

      expect(process.cwd()).toBe(projectDir)
      expect(getProjectRoot()).toBe(projectDir)
      expect(getLoadedMCPServers().projectPickerServer).toMatchObject({
        command: 'node',
        args: ['server.js'],
      })

      const baseAgent = loadAgentDefinitions().find((definition) =>
        definition.id.startsWith('base'),
      )
      expect(baseAgent).toBeDefined()
      expect(baseAgent?.mcpServers?.projectPickerServer).toMatchObject({
        command: 'node',
        args: ['server.js'],
      })
    } finally {
      process.chdir(originalCwd)
      setProjectRoot(originalProjectRoot ?? originalCwd)
      __resetLocalAgentRegistryForTests()
      rmSync(tempDir, { recursive: true, force: true })
    }
  })
})
