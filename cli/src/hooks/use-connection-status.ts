/**
 * Connection status hook. Openbuff runs entirely in local/BYOK mode with no
 * hosted backend to poll, so the connection is always considered active and
 * the reconnection callback is never invoked.
 */
export const useConnectionStatus = (
  _onReconnect?: (isInitialConnection: boolean) => void,
): boolean => {
  return true
}
