import React, { useEffect, useState } from 'react'
import { Box, Text, useInput } from 'ink'
import Spinner from './Spinner'
import { spawn } from 'child_process'

interface Command {
  command: string
  args?: string[]
  operator?: '|' | '&&'
}

interface SpawnProps {
  name: string
  commands: Command | Command[] // Accept single command or array
  shell?: boolean
  isFocused?: boolean
  disabled?: boolean
  onComplete?: () => void
}

const Spawn: React.FC<SpawnProps> = ({
  name,
  commands,
  isFocused = false,
  disabled,
  onComplete,
}) => {
  const [outputs, setOutputs] = useState<string[]>([])
  const [status, setStatus] = useState<'running' | 'succeeded' | 'failed'>(
    'running'
  )
  const [startTime, setStartTime] = useState(Date.now())
  const [endTime, setEndTime] = useState<number>()
  const [isExpanded, setIsExpanded] = useState(false)

  useInput((input, key) => {
    if (!isFocused) return
    if (key.rightArrow) {
      setIsExpanded(true)
    } else if (key.leftArrow) {
      setIsExpanded(false)
    } else if (key.return) {
      setIsExpanded((prev) => !prev)
    }
  })

  useEffect(() => {
    if (disabled) return
    setStartTime(Date.now())
    // Convert single command to array for consistent handling
    const commandArray = Array.isArray(commands) ? commands : [commands]

    // Create command string
    const commandString = commandArray
      .map((cmd) => {
        const baseCommand = `${cmd.command} ${cmd.args?.join(' ') || ''}`
        return cmd.operator ? `${baseCommand} ${cmd.operator}` : baseCommand
      })
      .join(' ')

    // Execute as single shell command
    const process = spawn(commandString, [], { shell: true })

    process.stdout.on('data', (data) => {
      setOutputs((prev) => {
        const next = [...prev]
        next[0] = (next[0] || '') + data.toString()
        return next
      })
    })

    process.stderr.on('data', (data) => {
      setOutputs((prev) => {
        const next = [...prev]
        next[0] = (next[0] || '') + data.toString()
        return next
      })
    })

    process.on('close', (code) => {
      setStatus(code === 0 ? 'succeeded' : 'failed')
      setEndTime(Date.now())
      onComplete?.()
    })

    return () => {
      process.kill()
    }
  }, [disabled])

  return (
    <Box flexDirection="column">
      <Box flexDirection="column" marginY={0}>
        <Box>
          <Text color={isFocused ? 'blue' : 'gray'}>
            {isExpanded ? '▼ ' : '▶'}
          </Text>
          <Text>
            {status === 'running' ? 'Running' : 'Ran'} {name}
            {endTime && ` (${((endTime - startTime) / 1000).toFixed(1)}s)`}
          </Text>
          {!disabled && (
            <Text
              color={
                status === 'running'
                  ? 'yellow'
                  : status === 'succeeded'
                    ? 'green'
                    : 'red'
              }
            >
              {' '}
              {status === 'running' ? (
                <Spinner />
              ) : status === 'succeeded' ? (
                '✓'
              ) : (
                '✗'
              )}
            </Text>
          )}
        </Box>
        {outputs.length > 0 && isExpanded && (
          <Box borderStyle="round" paddingX={1} paddingRight={2}>
            {outputs.map((output, i) => (
              <Box key={i}>
                <Text dimColor>{output.trimEnd()}</Text>
              </Box>
            ))}
          </Box>
        )}
      </Box>
    </Box>
  )
}

export default Spawn
