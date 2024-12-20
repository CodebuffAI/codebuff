import React, { useState } from 'react'
import { Box, useInput } from 'ink'
import Spawn from './Spawn'

interface Command {
  command: string
  args?: string[]
  operator?: '|' | '&&'
}

interface ScriptProps {
  commands: Record<string, Command[]>
  parallel?: boolean
}

const Script: React.FC<ScriptProps> = ({ commands, parallel = false }) => {
  const [focusedIndex, setFocusedIndex] = useState(0)
  const [activeIndex, setActiveIndex] = useState(0)

  const handleComplete = (index: number) => {
    if (!parallel && index === activeIndex) {
      setActiveIndex((prev) => prev + 1)
    }
  }

  useInput((input, key) => {
    if (key.upArrow) {
      setFocusedIndex((prev) => Math.max(0, prev - 1))
      return
    }
    if (key.downArrow) {
      setFocusedIndex((prev) => {
        const entries = Object.entries(commands)
        return Math.min(entries.length - 1, prev + 1)
      })
      return
    }
  })

  return (
    <>
      {Object.entries(commands).map(([name, cmds], index) => (
        <Spawn
          key={index}
          name={name}
          commands={cmds}
          isFocused={focusedIndex === index}
          disabled={!parallel && index > activeIndex}
          onComplete={() => handleComplete(index)}
        />
      ))}
    </>
  )
}

export default Script
