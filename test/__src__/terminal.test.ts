import { describe, it, expect, mock, beforeEach, afterEach } from 'bun:test'
import { IPty } from '@homebridge/node-pty-prebuilt-multiarch'
import { recreateShell, resetShell, runCommandPty } from '../../npm-app/src/utils/terminal'

const promptIdentifier = '@36261@'

describe('terminal command handling', () => {
  let mockPty: IPty
  let dataHandler: (data: string) => void
  let mockWrite: mock.Mock
  let mockDispose: mock.Mock
  let mockResolve: mock.Mock
  let mockTimer: NodeJS.Timeout

  beforeEach(() => {
    mockWrite = mock(() => {})
    mockDispose = mock(() => {})
    mockResolve = mock(() => {})
    
    // Mock the IPty interface
    mockPty = {
      write: mockWrite,
      onData: (handler: (data: string) => void) => {
        dataHandler = handler
        return { dispose: mockDispose }
      }
    } as unknown as IPty

    // Reset shell state
    resetShell(process.cwd())
  })

  afterEach(() => {
    mockWrite.mockReset()
    mockDispose.mockReset()
    mockResolve.mockReset()
  })

  it('should handle multi-line output with prompt at the end', async () => {
    const output = [
      'test command\n',  // First line is command echo, will be skipped
      'line 2\r\n',
      'line 3\r\n',
      promptIdentifier
    ]
    
    const promise = new Promise((resolve) => {
      const persistentProcess = {
        type: 'pty' as const,
        shell: 'pty' as const,
        pty: mockPty,
        timerId: null
      }
      
      runCommandPty(
        persistentProcess,
        'test command',
        'user',
        (value) => resolve(value),
        process.cwd()
      )
    })

    // Simulate output being received
    for (const line of output) {
      dataHandler(line)
    }

    const result = await promise
    expect(result).toEqual({
      result: `<terminal_command_result>
<output>line 2\r\nline 3\r\n</output>
<status>Command completed</status>
</terminal_command_result>`,
      stdout: 'line 2\r\nline 3\r\n'
    })
  })

  it('should handle output with prompt identifier in the middle', async () => {
    const output = [
      'test command\n',  // First line is command echo, will be skipped
      'some text\r\n',
      'line 3\r\n',
      promptIdentifier
    ]
    
    const promise = new Promise((resolve) => {
      const persistentProcess = {
        type: 'pty' as const,
        shell: 'pty' as const,
        pty: mockPty,
        timerId: null
      }
      
      runCommandPty(
        persistentProcess,
        'test command',
        'user',
        (value) => resolve(value),
        process.cwd()
      )
    })

    // Simulate output being received
    for (const line of output) {
      dataHandler(line)
    }

    const result = await promise
    expect(result).toEqual({
      result: `<terminal_command_result>
<output>some text\r\nline 3\r\n</output>
<status>Command completed</status>
</terminal_command_result>`,
      stdout: 'some text\r\nline 3\r\n'
    })
  })

  it('should handle incomplete line output', async () => {
    const output = [
      'test command\n',  // First line is command echo, will be skipped
      'partial line 1\r\n',
      'partial line 2\r\n',
      promptIdentifier
    ]
    
    const promise = new Promise((resolve) => {
      const persistentProcess = {
        type: 'pty' as const,
        shell: 'pty' as const,
        pty: mockPty,
        timerId: null
      }
      
      runCommandPty(
        persistentProcess,
        'test command',
        'user',
        (value) => resolve(value),
        process.cwd()
      )
    })

    // Simulate output being received in chunks
    for (const chunk of output) {
      dataHandler(chunk)
    }

    const result = await promise
    expect(result).toEqual({
      result: `<terminal_command_result>
<output>partial line 1\r\npartial line 2\r\n</output>
<status>Command completed</status>
</terminal_command_result>`,
      stdout: 'partial line 1\r\npartial line 2\r\n'
    })
  })

  it('should handle cd commands correctly', async () => {
    const output = [
      'cd test\n',  // First line is command echo, will be skipped
      'changing directory\r\n',
      promptIdentifier
    ]
    
    const promise = new Promise((resolve) => {
      const persistentProcess = {
        type: 'pty' as const,
        shell: 'pty' as const,
        pty: mockPty,
        timerId: null
      }
      
      runCommandPty(
        persistentProcess,
        'cd test',
        'user',
        (value) => resolve(value),
        process.cwd()
      )
    })

    // Simulate output being received
    for (const line of output) {
      dataHandler(line)
    }

    const result = await promise
    expect(result).toEqual({
      result: `<terminal_command_result>
<output>changing directory\r\n</output>
<status>Command completed</status>
</terminal_command_result>`,
      stdout: 'changing directory\r\n'
    })
    expect(mockWrite).toHaveBeenCalledWith(expect.stringContaining('cd '))
  })
})