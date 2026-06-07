import { describe, test, expect } from 'bun:test'

import { SLASH_COMMANDS } from '../../data/slash-commands'
import { findCommand, COMMAND_REGISTRY } from '../command-registry'
import {
  parseCommand,
  isSlashCommand,
  parseCommandInput,
} from '../router-utils'

describe('router-utils', () => {
  describe('isSlashCommand', () => {
    test('returns true for input starting with /', () => {
      expect(isSlashCommand('/help')).toBe(true)
      expect(isSlashCommand('/logout')).toBe(true)
      expect(isSlashCommand('/ref-abc123')).toBe(true)
      expect(isSlashCommand('/')).toBe(true)
    })

    test('returns false for input not starting with /', () => {
      expect(isSlashCommand('help')).toBe(false)
      expect(isSlashCommand('logout')).toBe(false)
      expect(isSlashCommand('ref-abc123')).toBe(false)
      expect(isSlashCommand('')).toBe(false)
    })

    test('handles whitespace correctly', () => {
      expect(isSlashCommand('  /help')).toBe(true)
      expect(isSlashCommand('  help')).toBe(false)
    })
  })

  describe('parseCommand', () => {
    test('extracts command from slashed input', () => {
      expect(parseCommand('/help')).toBe('help')
      expect(parseCommand('/logout')).toBe('logout')
      expect(parseCommand('/info')).toBe('info')
    })

    test('returns empty string for unslashed input (not a slash command)', () => {
      expect(parseCommand('help')).toBe('')
      expect(parseCommand('logout')).toBe('')
      expect(parseCommand('info')).toBe('')
      expect(parseCommand('login to my database')).toBe('')
    })

    test('extracts first word as command when there are arguments', () => {
      expect(parseCommand('/help me')).toBe('help')
      expect(parseCommand('/info stats')).toBe('info')
    })

    test('converts command to lowercase', () => {
      expect(parseCommand('/HELP')).toBe('help')
      expect(parseCommand('/LOGOUT')).toBe('logout')
      expect(parseCommand('/InFo')).toBe('info')
    })

    test('handles empty string', () => {
      expect(parseCommand('')).toBe('')
    })

    test('handles whitespace-only input', () => {
      expect(parseCommand('   ')).toBe('')
    })

    test('handles only slash', () => {
      expect(parseCommand('/')).toBe('')
    })

    test('handles multiple spaces between words', () => {
      expect(parseCommand('/help   me')).toBe('help')
    })
  })

  describe('parseCommandInput', () => {
    test('returns command info for exact slashless matches', () => {
      expect(parseCommandInput('init')).toEqual({
        command: 'init',
        args: '',
        implicitCommand: true,
      })
      expect(parseCommandInput('new')).toEqual({
        command: 'new',
        args: '',
        implicitCommand: true,
      })
    })

    test('is case-insensitive and trims whitespace for slashless matches', () => {
      expect(parseCommandInput('INIT')).toEqual({
        command: 'init',
        args: '',
        implicitCommand: true,
      })
      expect(parseCommandInput('  new  ')).toEqual({
        command: 'new',
        args: '',
        implicitCommand: true,
      })
    })

    test('returns null for slashless commands with arguments', () => {
      expect(parseCommandInput('init something')).toBe(null)
      expect(parseCommandInput('new my message')).toBe(null)
    })

    test('returns null for commands not configured for slashless invocation', () => {
      expect(parseCommandInput('info')).toBe(null)
      expect(parseCommandInput('bash')).toBe(null)
      expect(parseCommandInput('feedback')).toBe(null)
    })

    test('distinguishes slashed and slashless invocation', () => {
      expect(parseCommandInput('/init')).toEqual({
        command: 'init',
        args: '',
        implicitCommand: false,
      })
    })

    test('does not match aliases for slashless commands', () => {
      const newCmd = SLASH_COMMANDS.find((cmd) => cmd.id === 'new')
      for (const alias of newCmd?.aliases ?? []) {
        expect(parseCommandInput(alias)).toBe(null)
      }
    })

    test('returns null for empty input', () => {
      expect(parseCommandInput('')).toBe(null)
      expect(parseCommandInput('   ')).toBe(null)
    })

    test('commands with implicitCommand are configured correctly', () => {
      const initCmd = SLASH_COMMANDS.find((cmd) => cmd.id === 'init')
      const newCmd = SLASH_COMMANDS.find((cmd) => cmd.id === 'new')

      expect(initCmd?.implicitCommand).toBe(true)
      expect(newCmd?.implicitCommand).toBe(true)
    })

    test('parseCommandInput matches all implicitCommand commands', () => {
      const implicitCommands = SLASH_COMMANDS.filter((cmd) => cmd.implicitCommand)
      for (const cmd of implicitCommands) {
        expect(parseCommandInput(cmd.id)).toEqual({
          command: cmd.id.toLowerCase(),
          args: '',
          implicitCommand: true,
        })
      }
    })
  })

  describe('slash commands only work with / prefix', () => {
    const slashCommands = [
      'exit',
      'clear',
      'new',
      'init',
      'bash',
      'feedback',
    ]

    for (const cmd of slashCommands) {
      test(`"/${cmd}" is recognized as slash command`, () => {
        expect(parseCommand(`/${cmd}`)).toBe(cmd)
      })

      test(`"${cmd}" without slash is NOT a slash command (sent to agent)`, () => {
        expect(parseCommand(cmd)).toBe('')
      })
    }
  })

  describe('words that look like commands but are not', () => {
    const nonCommands = [
      'login to my account',
      'I need help with logout functionality',
      'please help me',
      'usage of this function',
      'clear the database',
    ]

    for (const input of nonCommands) {
      test(`"${input}" is NOT a slash command`, () => {
        expect(parseCommand(input)).toBe('')
      })
    }
  })

})

describe('command-registry', () => {
  describe('findCommand', () => {
    test('finds command by name', () => {
      const help = findCommand('help')
      expect(help).toBeDefined()
      expect(help?.name).toBe('help')

      const info = findCommand('info')
      expect(info).toBeDefined()
      expect(info?.name).toBe('info')
    })

    test('finds command by alias', () => {
      const status = findCommand('status')
      expect(status).toBeDefined()
      expect(status?.name).toBe('info')

      const modelDefault = findCommand('model:default')
      expect(modelDefault).toBeDefined()
      expect(modelDefault?.name).toBe('mode:default')

      const quit = findCommand('quit')
      expect(quit).toBeDefined()
      expect(quit?.name).toBe('exit')
    })

    test('returns undefined for unknown command', () => {
      expect(findCommand('unknown')).toBeUndefined()
      expect(findCommand('notacommand')).toBeUndefined()
    })

    test('is case insensitive', () => {
      expect(findCommand('HELP')?.name).toBe('help')
      expect(findCommand('STATUS')?.name).toBe('info')
    })
  })

  describe('COMMAND_REGISTRY', () => {
    test('all commands have unique names', () => {
      const names = COMMAND_REGISTRY.map((c) => c.name)
      const uniqueNames = new Set(names)
      expect(names.length).toBe(uniqueNames.size)
    })

    test('all aliases are unique across all commands', () => {
      const allAliases = COMMAND_REGISTRY.flatMap((c) => c.aliases)
      const uniqueAliases = new Set(allAliases)
      expect(allAliases.length).toBe(uniqueAliases.size)
    })

    test('no alias conflicts with command names', () => {
      const names = new Set(COMMAND_REGISTRY.map((c) => c.name))
      const allAliases = COMMAND_REGISTRY.flatMap((c) => c.aliases)
      for (const alias of allAliases) {
        expect(names.has(alias)).toBe(false)
      }
    })

    test('info command exposes status alias in slash metadata', () => {
      const infoCommand = SLASH_COMMANDS.find((cmd) => cmd.id === 'info')

      expect(infoCommand).toBeDefined()
      expect(infoCommand?.aliases).toContain('status')
      expect(infoCommand?.implicitCommand).toBeUndefined()
    })

    test('info and status resolve to the same registered command', () => {
      expect(findCommand('info')?.name).toBe('info')
      expect(findCommand('status')?.name).toBe('info')
    })

    test('slash command metadata maps to registered commands', () => {
      const registered = new Set([
        ...COMMAND_REGISTRY.map((c) => c.name),
        ...COMMAND_REGISTRY.flatMap((c) => c.aliases),
      ])

      // Commands with insertText are UI-only shortcuts that insert text into
      // the input field instead of executing a command.
      const executableCommands = SLASH_COMMANDS.filter((cmd) => !cmd.insertText)

      for (const slashCommand of executableCommands) {
        expect(registered.has(slashCommand.id)).toBe(true)
        for (const alias of slashCommand.aliases ?? []) {
          expect(registered.has(alias)).toBe(true)
        }
      }
    })

    test('mode commands expose model aliases for slash suggestions', () => {
      const modeCommands = SLASH_COMMANDS.filter((cmd) =>
        cmd.id.startsWith('mode:'),
      )
      expect(modeCommands.length).toBeGreaterThan(0)

      for (const command of modeCommands) {
        const modeName = command.id.slice('mode:'.length)
        expect(command.aliases).toContain(`model:${modeName}`)
      }
    })

    test('connect command is not available in codebuff (freebuff-only)', () => {
      const hasConnectSlashCommand = SLASH_COMMANDS.some(
        (cmd) => cmd.id === 'connect',
      )
      expect(hasConnectSlashCommand).toBe(false)
    })

    test('connect:chatgpt command is not available in codebuff (freebuff-only)', () => {
      const command = findCommand('connect:chatgpt')
      expect(command).toBeUndefined()
    })
  })
})
