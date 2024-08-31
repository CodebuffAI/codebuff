import { useEffect } from 'react'
import { MesageTypeMap, nativeToWebMessageType } from 'common/native-message'

export const useNativeMessages = <T extends nativeToWebMessageType>(
  messageTypes: T[],
  onMessageReceived: (type: T, data: MesageTypeMap[T]) => void
) => {
  const handleNativeMessage = async (e: any) => {
    let event
    try {
      event = JSON.parse(e.data)
    } catch (e) {
      return
    }
    const { type, data } = event
    console.log('Received native event type: ', type)
    if (messageTypes.includes(type)) {
      onMessageReceived(type, data)
    }
  }

  useEffect(() => {
    document.addEventListener('message', handleNativeMessage)
    window.addEventListener('message', handleNativeMessage)
    return () => {
      document.removeEventListener('message', handleNativeMessage)
      window.removeEventListener('message', handleNativeMessage)
    }
  }, [])
}
