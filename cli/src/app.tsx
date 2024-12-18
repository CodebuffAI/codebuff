import React, { useState, useEffect } from 'react'
import { Box, Text } from 'ink'
import SelectInput from 'ink-select-input'
import TextInput from 'ink-text-input'

type SelectItem = {
  label: string
  value: string
}

const items = [
  {
    label: 'First Option',
    value: 'first',
  },
  {
    label: 'Second Option',
    value: 'second',
  },
  {
    label: 'Third Option',
    value: 'third',
  },
]

const SimpleProgressBar = ({ percent }: { percent: number }) => {
  const filled = '█'.repeat(Math.floor(percent * 20))
  const empty = '░'.repeat(20 - Math.floor(percent * 20))
  const percentage = Math.floor(percent * 100) + '%'
  return (
    <Box>
      <Text>
        <Text color="green">{filled}</Text>
        {empty} {percentage}
      </Text>
    </Box>
  )
}

const Spinner = () => {
  const [frame, setFrame] = useState(0)
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

  useEffect(() => {
    const timer = setInterval(() => {
      setFrame((f) => (f + 1) % frames.length)
    }, 80)

    return () => clearInterval(timer)
  }, [])

  return <Text color="yellow">{frames[frame]}</Text>
}

type Props = {
  name?: string
  showDemo?: boolean
}

const App = ({ name = 'Stranger' }: Props) => {
  const [selected, setSelected] = useState('')
  const [loading, setLoading] = useState(false)
  const [inputValue, setInputValue] = useState('')

  return (
    <Box flexDirection="column">
      <Text>Select an option:</Text>
      <Box>
        <SelectInput
          items={items}
          onSelect={(item: SelectItem) => {
            setSelected(item.value)
            setLoading(true)
            setTimeout(() => setLoading(false), 2000)
          }}
        />
      </Box>

      {selected && (
        <Box flexDirection="column">
          <Text>Selected: {selected}</Text>
          {loading ? (
            <Text>
              <Spinner /> Processing...
            </Text>
          ) : (
            <Box flexDirection="column">
              <Text>Progress:</Text>
              <SimpleProgressBar percent={0.6} />
              <Text>Status: Complete</Text>
              <Text>
                Enter text:{' '}
                <TextInput value={inputValue} onChange={setInputValue} />
              </Text>
            </Box>
          )}
        </Box>
      )}
    </Box>
  )
}

export default App
