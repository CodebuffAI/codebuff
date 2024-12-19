import React, { useState } from 'react'
import { Box, Text, useInput } from 'ink'
import SelectInput from 'ink-select-input'

type Item = {
  label: string
  value: string
}

type Props = {
  items: Item[]
  onSubmit?: (items: Item[]) => void
  onConfirm: (items: Item[]) => void
}

const MultiSelect = ({ items, onSubmit, onConfirm }: Props) => {
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set())

  useInput((input, key) => {
    if (input === ' ') {
      onConfirm(items.filter((i) => selectedItems.has(i.value)))
    }
  })

  const toggleItem = (item: Item) => {
    const newSelected = new Set(selectedItems)
    if (selectedItems.has(item.value)) {
      newSelected.delete(item.value)
    } else {
      newSelected.add(item.value)
    }
    setSelectedItems(newSelected)
  }

  const enhancedItems = items.map((item) => ({
    ...item,
    label: `${selectedItems.has(item.value) ? '●' : '○'} ${item.label}`,
  }))

  return (
    <Box flexDirection="column">
      <SelectInput
        items={enhancedItems}
        onSelect={(item) => {
          toggleItem(item)
          if (onSubmit) {
            onSubmit(items.filter((i) => selectedItems.has(i.value)))
          }
        }}
      />
      <Text dimColor>Press Space to confirm selection</Text>
    </Box>
  )
}

export default MultiSelect
