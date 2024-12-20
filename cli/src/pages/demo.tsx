import React, { useState } from 'react'
import { Box, Text, useStdout } from 'ink'
import ResponsiveBox from '../ui/ResponsiveBox'
import TextInput from 'ink-text-input'
import Spinner from '../ui/Spinner'
import SimpleProgressBar from '../ui/SimpleProgressBar'
import Script from '../ui/Script'
import ConfirmInput from '../ui/ConfirmInput'
import SelectInput from 'ink-select-input'
import MultiSelect from '../ui/MultiSelect'

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

const DemoPage = () => {
  const [selected, setSelected] = useState('')
  const [loading, setLoading] = useState(false)
  const [inputValue, setInputValue] = useState('')

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
              args: ['3s'],
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
      {!selected && (
        <ConfirmInput
          message="Do you want to proceed?"
          isChecked={true}
          onSubmit={(confirmed) => {
            if (confirmed) {
              setSelected('first')
            } else {
              setSelected('')
            }
          }}
        />
      )}

      {selected && (
        <Box flexDirection="column">
          <Text>Selected: {selected}</Text>
          {loading ? (
            <Text>
              <Spinner /> Processing...
            </Text>
          ) : (
            <Box flexDirection="column">
              <Text>
                This is a very long line of text that should demonstrate the
                responsive wrapping behavior of our new Box component when the
                terminal window is resized to be narrower than the text content.
              </Text>
              <Text>Progress:</Text>
              <SimpleProgressBar percent={0.6} />
              <Text>Status: Complete</Text>
              <Text>
                Enter text:{' '}
                <TextInput value={inputValue} onChange={setInputValue} />
              </Text>

              <Divider title="Additional Components" />

              <Text>Multi-Select Example:</Text>

              <Text>Table Example:</Text>
              <Table data={tableData} />
            </Box>
          )}
        </Box>
      )}
    </Box>
  )
}

export default DemoPage
