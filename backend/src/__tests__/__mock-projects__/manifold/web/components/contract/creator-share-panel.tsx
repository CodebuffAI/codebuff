import { LinkIcon } from '@heroicons/react/outline'
import { ShareIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import { Contract } from 'common/contract'
import { getShareUrl } from 'common/util/share'
import toast from 'react-hot-toast'
import { useUser } from 'web/hooks/use-user'
import { getIsNative } from 'web/lib/native/is-native'
import { trackShareEvent } from 'web/lib/service/analytics'
import { copyToClipboard } from 'web/lib/util/copy'
import { Button } from '../buttons/button'
import { TweetButton } from '../buttons/tweet-button'
import { Row } from '../layout/row'
import { GradientContainer } from '../widgets/gradient-container'
import { BoostButton } from './boost-button'
import { AddBountyButton, CancelBountyButton } from './bountied-question'
import { UpgradeTierButton } from './upgrade-tier-button'

export function CreatorShareBoostPanel(props: { contract: Contract }) {
  const { contract } = props

  return (
    <GradientContainer className="mb-8 flex w-full">
      <div className="mb-2 flex flex-wrap gap-2">
        <BoostButton contract={contract} />
        {contract.outcomeType == 'BOUNTIED_QUESTION' && (
          <AddBountyButton contract={contract} />
        )}
        {(contract.mechanism == 'cpmm-1' ||
          contract.mechanism == 'cpmm-multi-1') && (
          <UpgradeTierButton contract={contract} />
        )}
        <ShareLinkButton contract={contract} />
        <TweetButton
          tweetText={
            'I created a question. ' +
            getShareUrl(contract, contract.creatorUsername)
          }
          className="hidden sm:flex"
        />
        {contract.outcomeType == 'BOUNTIED_QUESTION' && (
          <CancelBountyButton contract={contract} />
        )}
      </div>
    </GradientContainer>
  )
}

export function NonCreatorSharePanel(props: { contract: Contract }) {
  const { contract } = props
  const user = useUser()

  return (
    <Row className="my-4 flex-wrap gap-4">
      {contract.outcomeType == 'BOUNTIED_QUESTION' && (
        <AddBountyButton contract={contract} />
      )}
      <ShareLinkButton contract={contract} username={user?.username} />
      <TweetButton
        tweetText={getShareUrl(contract, user?.username)}
        className="hidden sm:flex"
      />
    </Row>
  )
}

const ShareLinkButton = (props: {
  contract: Contract
  username?: string
  className?: string
}) => {
  const { contract, username, className } = props
  const isNative = getIsNative()
  const url = getShareUrl(contract, username ?? contract.creatorUsername)

  const onClick = () => {
    if (!url) return
    copyToClipboard(url)
    if (!isNative) toast.success('Link copied!')

    trackShareEvent('copy market link', url, { contractId: contract.id })
  }

  return (
    <Button
      color="indigo-outline"
      size="lg"
      onClick={onClick}
      className={clsx('gap-1', className)}
    >
      {isNative ? (
        <ShareIcon className={'h-4 w-4'} aria-hidden />
      ) : (
        <LinkIcon className={'h-4 w-4'} aria-hidden />
      )}
      Share
    </Button>
  )
}
