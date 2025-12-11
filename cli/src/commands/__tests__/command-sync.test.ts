import { describe, test, expect } from 'bun:test'

import { COMMAND_REGISTRY } from '../command-registry'
import { SLASH_COMMANDS } from '../../data/slash-commands'

/**
 * These tests ensure that SLASH_COMMANDS (UI metadata) and COMMAND_REGISTRY (execution)
 * stay in sync. They serve different purposes but should reference the same commands.
 */
describe('SLASH_COMMANDS and COMMAND_REGISTRY sync', () => {
  // Commands that are intentionally hidden from the autocomplete menu
  // These exist in COMMAND_REGISTRY but not in SLASH_COMMANDS
  const HIDDEN_COMMANDS = ['login']

  test('every SLASH_COMMAND has a corresponding COMMAND_REGISTRY entry', () => {
    for (const slashCmd of SLASH_COMMANDS) {
      const registryCmd = COMMAND_REGISTRY.find((c) => c.name === slashCmd.id)
      expect(
        registryCmd,
        `SLASH_COMMAND "${slashCmd.id}" has no matching COMMAND_REGISTRY entry`,
      ).toBeDefined()
    }
  })

  test('every non-hidden COMMAND_REGISTRY entry has a corresponding SLASH_COMMAND', () => {
    for (const registryCmd of COMMAND_REGISTRY) {
      if (HIDDEN_COMMANDS.includes(registryCmd.name)) continue

      const slashCmd = SLASH_COMMANDS.find((s) => s.id === registryCmd.name)
      expect(
        slashCmd,
        `COMMAND_REGISTRY "${registryCmd.name}" has no matching SLASH_COMMAND entry. ` +
          `If this command should be hidden from autocomplete, add it to HIDDEN_COMMANDS.`,
      ).toBeDefined()
    }
  })

  test('aliases match between SLASH_COMMANDS and COMMAND_REGISTRY', () => {
    for (const slashCmd of SLASH_COMMANDS) {
      const registryCmd = COMMAND_REGISTRY.find((c) => c.name === slashCmd.id)
      if (!registryCmd) continue

      const slashAliases = slashCmd.aliases ?? []
      const registryAliases = registryCmd.aliases

      expect(
        slashAliases.sort(),
        `Aliases mismatch for "${slashCmd.id}"`,
      ).toEqual(registryAliases.sort())
    }
  })

  test('exit command exists with its aliases and noTabAutoExecute flag', () => {
    const exitCmd = SLASH_COMMANDS.find((cmd) => cmd.id === 'exit')
    expect(exitCmd).toBeDefined()
    expect(exitCmd?.aliases).toContain('quit')
    expect(exitCmd?.aliases).toContain('q')
    // /exit opts out of Tab auto-execute (too dangerous)
    expect(exitCmd?.noTabAutoExecute).toBe(true)
  })
})
