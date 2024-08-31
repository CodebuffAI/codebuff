import clsx from 'clsx'

import { Contract } from 'common/contract'
import { formatMoneyNumber, formatPercent } from 'common/util/format'
import { getShareUrl } from 'common/util/share'
import TwitterLogo from 'web/lib/icons/twitter-logo.svg'
import { trackCallback } from 'web/lib/service/analytics'
import { buttonClass } from './button'
import { TWOMBA_ENABLED } from 'common/envs/constants'

export function TweetButton(props: { tweetText: string; className?: string }) {
  const { tweetText, className } = props

  return (
    <a
      // #1da1f2 is twitter blue
      className={clsx(
        buttonClass('lg', 'none'),
        'hover:text-ink-0 gap-1 border-2 border-[#1da1f2] text-[#1da1f2] hover:bg-[#1da1f2]',
        className
      )}
      href={getTweetHref(tweetText)}
      onClick={trackCallback('share tweet')}
      target="_blank"
      rel="noreferrer"
    >
      <TwitterLogo width={15} height={15} />
      <div>Tweet</div>
    </a>
  )
}

function getTweetHref(tweetText: string) {
  return `https://twitter.com/intent/tweet?text=${encodeURIComponent(
    tweetText ?? ''
  )}`
}

export const getPositionTweet = (
  position: number,
  invested: number,
  contract: Contract,
  username: string
) => {
  const p = invested / Math.abs(position)
  const prob = formatPercent(position > 0 ? p : 1 - p)
  const side = position > 0 ? 'greater' : 'less'

  return `I'm ${
    TWOMBA_ENABLED ? 'predicting' : 'betting'
  } there's a ${side} than ${prob} chance. ${getShareUrl(contract, username)}`
}

export const getWinningTweet = (
  profit: number,
  contract: Contract,
  username: string
) => {
  return `I made M$${formatMoneyNumber(profit)} in profit trading on\n'${
    contract.question
  }'! ${getShareUrl(contract, username)}`
}
