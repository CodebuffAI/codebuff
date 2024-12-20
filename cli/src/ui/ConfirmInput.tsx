import React, { useState, useCallback } from 'react'
import { Box, Text, useInput, useStdout } from 'ink'
import { useTerminalSize } from '../hooks/use-terminal-size'

interface Props {
  message?: string
  isChecked?: boolean
  value?: string
  placeholder?: string
  onChange?: (value: string) => void
  onSubmit?: (confirmed: boolean) => void
}

const ConfirmInput: React.FC<Props> = ({
  message = 'Are you sure?',
  isChecked = true,
  value = '',
  placeholder = '',
  onChange,
  onSubmit,
}) => {
  const {
    dimensions: [cols, rows],
  } = useTerminalSize()

  const [focused, setFocused] = useState<'yes' | 'no'>(isChecked ? 'yes' : 'no')

  useInput((input, key) => {
    // Tab navigation
    if (key.tab) {
      setFocused((prev) => (prev === 'yes' ? 'no' : 'yes'))
      return
    }

    // Yes/No key shortcuts
    if (input.toLowerCase() === 'y') {
      setFocused('yes')
      if (key.return) onSubmit?.(true)
      return
    }
    if (input.toLowerCase() === 'n') {
      setFocused('no')
      if (key.return) onSubmit?.(false)
      return
    }

    // Enter to select current option
    if (key.return) {
      onSubmit?.(focused === 'yes')
      return
    }

    // Update text value if provided
    if (onChange && !key.tab && !key.return) {
      onChange(input)
    }
  })

  return (
    <Box flexDirection="column" alignItems="center" width={cols}>
      <Box
        flexDirection="column"
        borderStyle="round"
        paddingX={2}
        paddingY={0}
        borderColor="blue"
        width={cols / 2}
      >
        <Box marginBottom={1}>
          <Text bold>{message}</Text>
        </Box>
        {value && <Text>{value}</Text>}
        {!value && placeholder && <Text dimColor>{placeholder}</Text>}
        <Box marginTop={1} justifyContent="center">
          <Box
            borderStyle={focused === 'yes' ? 'bold' : 'single'}
            paddingX={3}
            marginRight={2}
            borderColor={focused === 'yes' ? 'green' : undefined}
          >
            <Text color={focused === 'yes' ? 'green' : undefined}>Yes</Text>
          </Box>
          <Box
            borderStyle={focused === 'no' ? 'bold' : 'single'}
            paddingX={3}
            borderColor={focused === 'no' ? 'red' : undefined}
          >
            <Text color={focused === 'no' ? 'red' : undefined}>No</Text>
          </Box>
        </Box>
      </Box>
    </Box>
  )
}

export default ConfirmInput
