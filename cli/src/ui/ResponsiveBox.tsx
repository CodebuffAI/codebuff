import React, { useState } from 'react'
import { Box, type BoxProps } from 'ink'
import { useTerminalSize } from '../hooks/use-terminal-size'

const ResponsiveBox = ({
  children,
  ...props
}: BoxProps & { children: React.ReactNode }) => {
  const {
    dimensions: [cols, rows],
  } = useTerminalSize()

  return (
    <Box {...props} width={cols} height={rows}>
      {children}
    </Box>
  )
}
export default ResponsiveBox
