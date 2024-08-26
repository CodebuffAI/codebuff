import { CodeIcon } from '@heroicons/react/outline'
import toast from 'react-hot-toast'

import { Contract, contractPath } from 'common/contract'
import { DOMAIN } from 'common/envs/constants'
import { copyToClipboard } from 'web/lib/util/copy'
import { track } from 'web/lib/service/analytics'
import { Button } from './button'
import clsx from 'clsx'

export function embedContractCode(contract: Contract) {
  const title = contract.question
  const src = `https://${DOMAIN}/embed${contractPath(contract)}`
  return `<iframe src="${src}" title="${title}" frameborder="0" style="position: relative; left:50%; transform: translateX(-50%); width:90%; height:18rem; max-width: 35rem;"></iframe>`
}

export function ShareEmbedButton(props: {
  contract: Contract
  className?: string
}) {
  const { contract, className } = props

  return (
    <Button
      color="gray-outline"
      size="sm"
      className={clsx('gap-1', className)}
      onClick={() => {
        copyToClipboard(embedContractCode(contract))
        toast.success('Embed code copied!', {
          icon: <CodeIcon className="h-4 w-4" />,
        })
        track('copy embed code')
      }}
    >
      Embed
    </Button>
  )
}

export function ShareIRLButton(props: {
  contract: Contract
  className?: string
}) {
  const { contract, className } = props

  return (
    <Button
      color="gray-outline"
      size="sm"
      className={clsx('gap-1', className)}
      onClick={() => {
        copyToClipboard(`https://${DOMAIN}/embed${contractPath(contract)}?qr`)
        toast.success('Url to IRL-mode market copied!', {
          icon: <CodeIcon className="h-4 w-4" />,
        })
        track('copy irl url')
      }}
    >
      IRL
    </Button>
  )
}
