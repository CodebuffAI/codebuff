import { useApiSubscription } from './use-api-subscription'

// sending broadcast message from server left as an exercise for the coder. good luck!
export const useRefreshAllClients = () => {
  useApiSubscription({
    topics: ['refresh-all-clients'],
    onBroadcast: ({ data }) => {
      console.log('reloading due to refresh-all-clients')
      if (data.message) {
        console.log(data.message)
      }
      window.location.reload()
    },
  })
}
