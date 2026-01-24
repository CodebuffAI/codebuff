import { describe, test, expect } from 'bun:test'

import { findCommand, COMMAND_REGISTRY } from '../command-registry'
import {
  normalizeInput,
  parseCommand,
  isSlashCommand,
  isReferralCode,
  parseCommandInput,
} from '../router-utils'
import { SLASH_COMMANDS } from '../../data/slash-commands'

describe('router-utils', () => {
  describe('normalizeInput', () => {
    test('strips leading slash from input', () => {
      expect(normalizeInput('/help')).toBe('help')
      expect(normalizeInput('/logout')).toBe('logout')
      expect(normalizeInput('/ref-abc123')).toBe('ref-abc123')
    })

    test('preserves input without leading slash', () => {
      expect(normalizeInput('help')).toBe('help')
      expect(normalizeInput('ref-abc123')).toBe('ref-abc123')
      expect(normalizeInput('some prompt text')).toBe('some prompt text')
    })

    test('handles empty string', () => {
      expect(normalizeInput('')).toBe('')
    })

    test('handles only slash', () => {
      expect(normalizeInput('/')).toBe('')
    })

    test('handles multiple slashes', () => {
      expect(normalizeInput('//help')).toBe('/help')
      expect(normalizeInput('///test')).toBe('//test')
    })

    test('preserves internal slashes', () => {
      expect(normalizeInput('/path/to/file')).toBe('path/to/file')
      expect(normalizeInput('path/to/file')).toBe('path/to/file')
    })

    test('preserves whitespace in input', () => {
      expect(normalizeInput('/help me')).toBe('help me')
      expect(normalizeInput('help me')).toBe('help me')
    })
  })

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
      expect(parseCommand('/usage')).toBe('usage')
    })

    test('returns empty string for unslashed input (not a slash command)', () => {
      expect(parseCommand('help')).toBe('')
      expect(parseCommand('logout')).toBe('')
      expect(parseCommand('usage')).toBe('')
      expect(parseCommand('login to my database')).toBe('')
    })

    test('extracts first word as command when there are arguments', () => {
      expect(parseCommand('/help me')).toBe('help')
      expect(parseCommand('/usage stats')).toBe('usage')
    })

    test('converts command to lowercase', () => {
      expect(parseCommand('/HELP')).toBe('help')
      expect(parseCommand('/LOGOUT')).toBe('logout')
      expect(parseCommand('/UsAgE')).toBe('usage')
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

  describe('isReferralCode', () => {
    test('recognizes referral codes with slash prefix', () => {
      expect(isReferralCode('/ref-abc123')).toBe(true)
      expect(isReferralCode('/ref-XYZ')).toBe(true)
      expect(isReferralCode('/ref-')).toBe(true)
    })

    test('recognizes referral codes without slash prefix', () => {
      expect(isReferralCode('ref-abc123')).toBe(true)
      expect(isReferralCode('ref-XYZ')).toBe(true)
      expect(isReferralCode('ref-')).toBe(true)
    })

    test('rejects inputs that are not referral codes', () => {
      expect(isReferralCode('reference')).toBe(false)
      expect(isReferralCode('refund')).toBe(false)
      expect(isReferralCode('/reference')).toBe(false)
      expect(isReferralCode('ref abc')).toBe(false)
      expect(isReferralCode('')).toBe(false)
    })

    test('is case-sensitive for ref- prefix', () => {
      expect(isReferralCode('REF-abc')).toBe(false)
      expect(isReferralCode('Ref-abc')).toBe(false)
      expect(isReferralCode('/REF-abc')).toBe(false)
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
      expect(parseCommandInput('usage')).toBe(null)
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
      'login',
      'logout',
      'usage',
      'credits',
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

  describe('referral code detection with different input formats', () => {
    const validCodes = [
      'ref-abc123',
      '/ref-abc123',
      'ref-TEST',
      '/ref-TEST',
      'ref-12345',
      '/ref-12345',
    ]

    const invalidCodes = [
      'reference',
      '/reference',
      'refund-123',
      '/refund-123',
      'REF-abc',
      '/REF-abc',
      'ref abc',
      '/ref abc',
      '',
      '/',
    ]

    for (const code of validCodes) {
      test(`recognizes "${code}" as valid referral code`, () => {
        expect(isReferralCode(code)).toBe(true)
      })
    }

    for (const code of invalidCodes) {
      test(`rejects "${code}" as referral code`, () => {
        expect(isReferralCode(code)).toBe(false)
      })
    }
  })
})

describe('command-registry', () => {
  describe('findCommand', () => {
    test('finds command by name', () => {
      const login = findCommand('login')
      expect(login).toBeDefined()
      expect(login?.name).toBe('login')

      const usage = findCommand('usage')
      expect(usage).toBeDefined()
      expect(usage?.name).toBe('usage')
    })

    test('finds command by alias', () => {
      const credits = findCommand('credits')
      expect(credits).toBeDefined()
      expect(credits?.name).toBe('usage')

      const quit = findCommand('quit')
      expect(quit).toBeDefined()
      expect(quit?.name).toBe('exit')

      const signin = findCommand('signin')
      expect(signin).toBeDefined()
      expect(signin?.name).toBe('login')
    })

    test('returns undefined for unknown command', () => {
      expect(findCommand('unknown')).toBeUndefined()
      expect(findCommand('notacommand')).toBeUndefined()
    })

    test('is case insensitive', () => {
      expect(findCommand('LOGIN')?.name).toBe('login')
      expect(findCommand('UsAgE')?.name).toBe('usage')
      expect(findCommand('CREDITS')?.name).toBe('usage')
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
  })
})
