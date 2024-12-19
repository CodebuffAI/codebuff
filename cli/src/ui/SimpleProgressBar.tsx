import React from 'react'
import { Box, Text } from 'ink'

type Props = {
  percent: number
}

const SimpleProgressBar = ({ percent }: Props) => {
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

export default SimpleProgressBar
