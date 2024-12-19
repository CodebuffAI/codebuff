import React, { useState, useEffect } from 'react'
import { Text } from 'ink'

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

export default Spinner
