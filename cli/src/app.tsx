import React, { useState } from 'react'
import { Box, Text, useStdin, useInput } from 'ink'
import Spawn from './ui/Spawn'
import SelectInput from 'ink-select-input'
import TextInput from 'ink-text-input'
import Spinner from './ui/Spinner'
import SimpleProgressBar from './ui/SimpleProgressBar'
import MultiSelect from './ui/MultiSelect'
import type { Item } from './types'
import Script from './ui/Script'

// Dynamic imports for ESM compatibility
const Table = await import('ink-table').then((m) => m.default)
const Divider = await import('ink-divider').then((m) => m.default)

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

const tableData = [
  { name: 'John', age: '30', city: 'New York' },
  { name: 'Jane', age: '25', city: 'San Francisco' },
]

type Props = {
  name?: string
  showDemo?: boolean
}

const App = ({ name = 'Stranger' }: Props) => {
  const [selected, setSelected] = useState('')
  const [loading, setLoading] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const { isRawModeSupported } = useStdin()

  return (
    <Box flexDirection="column">
      <Script
        parallel
        commands={{
          'delayed greeting': [
            {
              command: 'echo',
              args: [
                'Hello from our own delayed spawn implementation before sleep!',
              ],
              operator: '&&',
            },
            {
              command: 'sleep',
              args: ['5s'],
              operator: '&&',
            },
            {
              command: 'echo',
              args: ['Hello from our own spawn implementation after sleep!'],
            },
          ],
          'uppercase greeting': [
            {
              command: 'echo',
              args: ['Hello from our own spawn implementation!'],
              operator: '|',
            },
            { command: 'tr', args: ['a-z', 'A-Z'] }, // Convert to uppercase as an example
          ],
        }}
      />
      {/* <Text>Select an option:</Text> */}
      {/* <Box>
        <SelectInput
          items={items}
          onSelect={(item: SelectItem) => {
            setSelected(item.value)
            setLoading(true)
            setTimeout(() => setLoading(false), 2000)
            }}
            />
        <MultiSelect
          items={items}
          onConfirm={(items: Item[]) => {
            setSelected(items[0].value)
            setLoading(true)
            setTimeout(() => setLoading(false), 2000)
          }}
        />
      </Box> */}

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

              <Divider title="Additional Components" />

              <Text>Multi-Select Example:</Text>
              {/* <MultiSelect items={items} onSubmit={console.log} /> */}

              <Text>Table Example:</Text>
              <Table data={tableData} />
            </Box>
          )}
        </Box>
      )}
    </Box>
  )
}

export default App
