import { Page } from 'web/components/layout/page'
import { Spacer } from 'web/components/layout/spacer'
import { useUser } from 'web/hooks/use-user'
import {
  MarketCard,
  useTopMarketsByUser,
} from 'web/components/cards/MarketCard'
import { groupBy, shuffle } from 'lodash'
import { useMemo, useState } from 'react'
import { Row } from 'web/components/layout/row'
import { Col } from 'web/components/layout/col'
import { Button } from 'web/components/buttons/button'
import { UserCard } from 'web/components/cards/UserCard'
import { useRouter } from 'next/router'
import { Grenze_Gotisch } from 'next/font/google'
import clsx from 'clsx'
import { useContracts } from 'web/hooks/use-contract'

const fancyFont = Grenze_Gotisch({
  weight: ['300', '500', '700'],
  variable: '--font-match-cards',
  subsets: ['latin'],
})

const TOTAL_MARKETS = 5

const DEFAULT_MARKETS = [
  'YTIuuSsNRn2OlA4KykRM',
  'DreezzZ09K5d4ee1E64l',
  'YBxwKfe5eY2Ynw1ACGYI',
  '0GswU1qy80Sk1UogWuKR',
  'NRLwgQYqCLk5zTasmxOn',
  'usSjx2AtbUvfg7QNq5g2',
  '4MkPyu5D9MRLPREODSD7',
]

// A memory game with 2 rows of TOTAL_MARKETS cards
// Users flip 2 cards at a time; if they match, they stay flipped
export default function CardsPage() {
  const router = useRouter()
  // GAME STATE
  // Boolean array of whether each card is faceup
  const [faceups, setFaceups] = useState<boolean[]>(
    Array.from({ length: TOTAL_MARKETS * 2 }, () => false)
  )
  // Last card clicked
  const [clicked, setClicked] = useState<number | undefined>(undefined)
  // Total clicks
  const [clicks, setClicks] = useState(0)
  const [matches, setMatches] = useState(0)
  const [waiting, setWaiting] = useState(false)

  // GAME DATA
  const user = useUser()
  const topMarkets = useTopMarketsByUser(user?.id ?? '')
  const defaults = useContracts(DEFAULT_MARKETS)
  const shuffledMarkets = useMemo(
    () => shuffle([...topMarkets, ...defaults]),
    [topMarkets.length]
  )
  const groupedMarkets = groupBy(shuffledMarkets, 'creatorId')
  const markets = Object.values(groupedMarkets)
    .filter((group) => group.length === 1)
    .flat()
    .slice(0, TOTAL_MARKETS)
  const marketCreators = markets.map((market) => market.creatorId)
  const creators = useMemo(() => shuffle(marketCreators), [topMarkets.length])

  function clicksMatch(a: number, b: number) {
    // Set i to be the lesser, and j to be the greater
    const i = Math.min(a, b)
    const j = Math.max(a, b)
    if (i >= TOTAL_MARKETS || j < TOTAL_MARKETS) {
      return false
    }
    return markets[i].creatorId === creators[j - TOTAL_MARKETS]
  }

  function click(index: number) {
    if (waiting) return
    setClicks(clicks + 1)
    const newFaceups = [...faceups]
    newFaceups[index] = true
    setFaceups(newFaceups)
    if (clicked === undefined) {
      setClicked(index)
    } else {
      if (clicksMatch(clicked, index)) {
        setMatches(matches + 1)
        setClicked(undefined)
      } else {
        setWaiting(true)
        // Wait for 1s, then flip them back down
        setTimeout(() => {
          const newFaceups = [...faceups]
          newFaceups[clicked] = false
          newFaceups[index] = false
          setFaceups(newFaceups)
          setWaiting(false)
          setClicked(undefined)
        }, 2000)
      }
    }
  }

  return (
    <Page
      className={clsx('!col-span-10 p-2', fancyFont.variable)}
      trackPageView={'cards game page'}
    >
      <Row className="justify-between">
        <Col>
          <h1 className="font-grenze-gotisch text-6xl">
            Manifold: the Gambling
          </h1>
          <Spacer h={4} />
          <h2 className="text-2xl">Match each question to its creator!</h2>
          <h2 className="block sm:hidden">(Best played on desktop 😛)</h2>
        </Col>
        <Col className="justify-end">
          <h2 className="text-6xl">
            {/* Show a ✅ for each match */}{' '}
            {Array.from({ length: matches }, (_, i) => (
              <span key={i}>✅</span>
            ))}
            {/* And a ❌ for non-matches */}
            {Array.from({ length: TOTAL_MARKETS - matches }, (_, i) => (
              <span key={i}>🃏</span>
            ))}
          </h2>
          <Spacer h={4} />
          <h2 className="text-right text-2xl">Clicks: {clicks}</h2>
        </Col>
      </Row>
      <Spacer h={4} />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
        {markets.map((contract, i) => (
          <MarketCard
            key={contract.id}
            contract={contract}
            faceup={faceups[i]}
            onClick={() => click(i)}
          />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
        {creators.map((userId, i) => (
          <UserCard
            key={userId}
            userId={userId}
            faceup={faceups[TOTAL_MARKETS + i]}
            onClick={() => click(TOTAL_MARKETS + i)}
          />
        ))}
      </div>
      {matches === TOTAL_MARKETS && (
        <Button
          size="2xl"
          color="gradient"
          className="mx-auto max-w-md"
          onClick={() => router.reload()}
        >
          Play again!
        </Button>
      )}
    </Page>
  )
}
