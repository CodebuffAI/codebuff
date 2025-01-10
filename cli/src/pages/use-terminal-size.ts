import { useEffect, useState } from 'react'
import { useStdout } from 'ink'

interface TerminalDimensions {
  dimensions: [number, number] // [columns, rows]
}

export const useTerminalSize = (): TerminalDimensions => {
  const { stdout } = useStdout()
  const [dimensions, setDimensions] = useState<[number, number]>([
    stdout.columns || 80,
    stdout.rows || 24
  ])

  useEffect(() => {
    const handleResize = () => {
      setDimensions([stdout.columns || 80, stdout.rows || 24])
    }

    stdout.on('resize', handleResize)
    return () => {
      stdout.off('resize', handleResize)
    }
  }, [stdout])

  return { dimensions }
}
