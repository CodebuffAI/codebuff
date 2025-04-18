// @ts-ignore: bun:test types aren't available
import { test, expect, mock, spyOn, afterAll, beforeEach } from 'bun:test'
import { ReadlineManager } from './readline-manager'
import * as readline from 'readline'
import { green } from 'picocolors'
import { Spinner } from '../utils/spinner'
import { getProjectRoot } from '../project-files'
import { parse } from 'path'

// Create mock readline interface instance with mock functions
const mockRlInstance = {
  setPrompt: mock(() => {}),
  prompt: mock(() => {}),
  write: mock(() => {}),
  on: mock(() => {}),
  close: mock(() => {}),
  line: '',
  cursor: 0,
  _refreshLine: mock(() => {}),
}

// Mock readline module
const mockReadlineModule = {
  createInterface: mock(() => mockRlInstance),
  cursorTo: mock(() => {}),
}

// Mock dependencies
mock.module('../utils/spinner', () => ({
  Spinner: {
    get: () => ({
      stop: mock(() => {}),
    }),
  },
}))

mock.module('../project-files', () => ({
  getProjectRoot: mock(() => '/test/project'),
}))

mock.module('readline', () => mockReadlineModule)

// Mock process.stdin with all required methods
const mockStdin = {
  on: mock(() => {}),
  resume: mock(() => {}),
  pause: mock(() => {}),
  setRawMode: mock(() => true),
  listenerCount: mock(() => 0),
  isTTY: true,
  // Add stream-like properties
  readable: true,
  isPaused: mock(() => false),
  pipe: mock((dest: any) => dest),
  unpipe: mock(() => mockStdin),
  read: mock(() => null),
  // Add EventEmitter-like methods
  addListener: mock(() => mockStdin),
  removeListener: mock(() => mockStdin),
  emit: mock(() => true),
  eventNames: mock(() => []),
  getMaxListeners: mock(() => 10),
  listeners: mock(() => []),
  off: mock(() => mockStdin),
  once: mock(() => mockStdin),
  prependListener: mock(() => mockStdin),
  prependOnceListener: mock(() => mockStdin),
  rawListeners: mock(() => []),
  removeAllListeners: mock(() => mockStdin),
  setMaxListeners: mock(() => mockStdin),
}

// Mock process.stdout similarly for readline
const mockStdout = {
  write: mock(() => true),
  on: mock(() => {}),
  once: mock(() => {}),
  emit: mock(() => true),
  end: mock(() => {}),
  removeListener: mock(() => {}),
  pipe: mock((dest: any) => dest),
  unpipe: mock(() => mockStdout),
  // Add stream-like properties
  writable: true,
  // Add EventEmitter-like methods
  addListener: mock(() => mockStdout),
  eventNames: mock(() => []),
  getMaxListeners: mock(() => 10),
  listeners: mock(() => []),
  listenerCount: mock(() => 0),
  off: mock(() => mockStdout),
  prependListener: mock(() => mockStdout),
  prependOnceListener: mock(() => mockStdout),
  rawListeners: mock(() => []),
  removeAllListeners: mock(() => mockStdout),
  setMaxListeners: mock(() => mockStdout),
}

const originalStdin = process.stdin
const originalStdout = process.stdout
const originalReadline = global.readline

// Setup before each test
beforeEach(() => {
  // Reset mock states
  mockRlInstance.line = ''
  mockRlInstance.cursor = 0
  Object.values(mockRlInstance).forEach(value => {
    if (typeof value === 'function') {
      (value as ReturnType<typeof mock>).mockClear()
    }
  })
  mockReadlineModule.createInterface.mockClear()
  mockReadlineModule.cursorTo.mockClear()
  ;(process.stdin as any) = mockStdin
  ;(process.stdout as any) = mockStdout
  ;(global as any).readline = mockReadlineModule
})

// Restore original modules after tests
afterAll(() => {
  process.stdin = originalStdin
  process.stdout = originalStdout
  ;(global as any).readline = originalReadline
})

test('ReadlineManager constructor sets up readline interface and event listeners', () => {
  const options = {
    completer: mock((line: string) => [[], line]),
    onLine: mock(() => {}),
    onSigint: mock(() => {}),
    onClose: mock(() => {}),
  }

  const manager = new ReadlineManager(options)

  expect(mockReadlineModule.createInterface).toHaveBeenCalledWith({
    input: process.stdin,
    output: process.stdout,
    historySize: 1000,
    terminal: true,
    completer: options.completer,
  })

  expect(mockRlInstance.on).toHaveBeenCalledWith('line', options.onLine)
  expect(mockRlInstance.on).toHaveBeenCalledWith('SIGINT', options.onSigint)
  expect(mockRlInstance.on).toHaveBeenCalledWith('close', options.onClose)
  expect(mockStdin.on).toHaveBeenCalledWith('keypress', expect.any(Function))
})

test('setPrompt sets the correct prompt text', () => {
  const manager = new ReadlineManager({
    completer: (line: string) => [[], line],
    onLine: () => {},
    onSigint: () => {},
    onClose: () => {},
  })

  manager.setPrompt()

  expect(mockRlInstance.setPrompt).toHaveBeenCalledWith(
    green(`${parse('/test/project').base} > `)
  )
})

test('freshPrompt clears line and sets new prompt', () => {
  const manager = new ReadlineManager({
    completer: (line: string) => [[], line],
    onLine: () => {},
    onSigint: () => {},
    onClose: () => {},
  })

  manager.freshPrompt()

  expect(Spinner.get().stop).toHaveBeenCalled()
  expect(mockReadlineModule.cursorTo).toHaveBeenCalledWith(process.stdout, 0)
  expect(mockRlInstance.line).toBe('')
  expect(mockRlInstance.setPrompt).toHaveBeenCalled()
  expect(mockRlInstance.prompt).toHaveBeenCalled()
})

test('freshPrompt with user input writes the input', () => {
  const manager = new ReadlineManager({
    completer: (line: string) => [[], line],
    onLine: () => {},
    onSigint: () => {},
    onClose: () => {},
  })

  const userInput = 'test input'
  manager.freshPrompt(userInput)

  expect(mockRlInstance.write).toHaveBeenCalledWith(' '.repeat(userInput.length))
  expect(mockRlInstance.line).toBe(userInput)
  expect(mockRlInstance._refreshLine).toHaveBeenCalled()
})

test('handleKeyPress handles escape key', () => {
  const manager = new ReadlineManager({
    completer: (line: string) => [[], line],
    onLine: () => {},
    onSigint: () => {},
    onClose: () => {},
  })

  const result = manager['handleKeyPress']('', { name: 'escape' })
  expect(result).toBeUndefined()
})

test('handleKeyPress converts double space to newline', () => {
  const manager = new ReadlineManager({
    completer: (line: string) => [[], line],
    onLine: () => {},
    onSigint: () => {},
    onClose: () => {},
  })

  mockRlInstance.line = 'test  '
  mockRlInstance.cursor = 6

  manager['handleKeyPress'](' ', { name: 'space' })

  expect(mockRlInstance.line).toBe('test\n\n')
  expect(mockRlInstance._refreshLine).toHaveBeenCalled()
})

test('detectPasting identifies rapid inputs as pasting', () => {
  const manager = new ReadlineManager({
    completer: (line: string) => [[], line],
    onLine: () => {},
    onSigint: () => {},
    onClose: () => {},
  })

  // Simulate rapid inputs
  manager['detectPasting']()
  manager['detectPasting']()
  manager['detectPasting']()

  expect(manager.isPastingContent()).toBe(true)
})

test('detectPasting resets after slow inputs', () => {
  const manager = new ReadlineManager({
    completer: (line: string) => [[], line],
    onLine: () => {},
    onSigint: () => {},
    onClose: () => {},
  })

  // Simulate slow inputs
  manager['detectPasting']()
  setTimeout(() => {
    manager['detectPasting']()
    expect(manager.isPastingContent()).toBe(false)
  }, 20)
})

test('pasted content management', () => {
  const manager = new ReadlineManager({
    completer: (line: string) => [[], line],
    onLine: () => {},
    onSigint: () => {},
    onClose: () => {},
  })

  const content = 'test content'
  manager.setPastedContent(content)
  expect(manager.getPastedContent()).toBe(content)

  manager.clearPastedContent()
  expect(manager.getPastedContent()).toBe('')
})

test('close calls readline close', () => {
  const manager = new ReadlineManager({
    completer: (line: string) => [[], line],
    onLine: () => {},
    onSigint: () => {},
    onClose: () => {},
  })

  manager.close()

  expect(mockRlInstance.close).toHaveBeenCalled()
})