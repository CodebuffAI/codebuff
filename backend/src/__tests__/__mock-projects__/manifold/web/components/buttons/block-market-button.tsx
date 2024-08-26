import { usePrivateUser } from 'web/hooks/use-user'
import { Button } from 'web/components/buttons/button'
import { withTracking } from 'web/lib/service/analytics'
import { toast } from 'react-hot-toast'
import { Contract } from 'common/contract'
import { api } from 'web/lib/api/api'

export function BlockMarketButton(props: { contract: Contract }) {
  const { contract } = props
  const privateUser = usePrivateUser()
  if (!privateUser || (privateUser && privateUser.id === contract.creatorId))
    return null
  const isBlocked = privateUser.blockedContractIds?.includes(contract.id)

  const onBlock = async () => {
    await toast.promise(
      api('market/:contractId/block', { contractId: contract.id }),
      {
        loading: 'Blocking...',
        success: `You'll no longer see this question in your feed nor search.`,
        error: 'Error blocking user',
      }
    )
  }
  const onUnblock = async () => {
    await api('market/:contractId/unblock', { contractId: contract.id })
  }

  if (isBlocked) {
    return (
      <Button size="xs" onClick={withTracking(onUnblock, 'unblock')}>
        Unblock
      </Button>
    )
  }

  return (
    <Button
      size="xs"
      color="yellow-outline"
      onClick={withTracking(onBlock, 'block')}
    >
      Block
    </Button>
  )
}
