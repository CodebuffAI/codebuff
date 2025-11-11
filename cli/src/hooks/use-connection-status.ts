import { useEffect, useState } from 'react'

import { getCodebuffClient } from '../utils/codebuff-client'
import { logger } from '../utils/logger'

export const useConnectionStatus = () => {
  const [isConnected, setIsConnected] = useState(true)

  useEffect(() => {
    let isMounted = true

    const checkConnection = async () => {
      const client = getCodebuffClient()
      if (!client) {
        if (isMounted) {
          setIsConnected(false)
        }
        return
      }

      try {
        const connected = await client.checkConnection()
        if (isMounted) {
          setIsConnected(connected)
        }
      } catch (error) {
        logger.debug({ error }, 'Connection check failed')
        if (isMounted) {
          setIsConnected(false)
        }
      }
    }

    checkConnection()
    const interval = setInterval(checkConnection, 30000)

    return () => {
      isMounted = false
      clearInterval(interval)
    }
  }, [])

  return isConnected
}
