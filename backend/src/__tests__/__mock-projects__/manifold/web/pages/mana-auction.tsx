import clsx from 'clsx'
import dayjs from 'dayjs'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { Title } from 'web/components/widgets/title'
import { formatMoney } from 'common/util/format'
import { Row } from 'web/components/layout/row'
import { useEffect, useState } from 'react'
import { Avatar } from 'web/components/widgets/avatar'
import { Spacer } from 'web/components/layout/spacer'
import { Bid } from 'common/bid'
import { groupBy, max } from 'lodash'
import { GradientContainer } from 'web/components/widgets/gradient-container'
import { SEO } from 'web/components/SEO'
import { buildArray } from 'common/util/array'
import { UserHovercard } from 'web/components/user/user-hovercard'

const CUTOFF_TIME = 1680418800000 // Apr 2nd, 12 am PT

// hardcoded now that it's ended
const bids = [
  {
    displayName: 'Mira',
    userId: 'ZB5wm6TsZbfYNWOoAWIjDpzjEz72',
    createdTime: 1680418798704,
    username: 'Mira',
    avatar:
      'https://lh3.googleusercontent.com/a/AEdFTp77Pl94fzmBvwxTPgQ_k3Mo7xGmkWCjCIKOggb7NA=s96-c',
    amount: 14000,
  },
  {
    userId: 'kydVkcfg7TU4zrrMBRx1Csipwkw2',
    username: 'Catnee',
    amount: 12169,
    createdTime: 1680418790493,
    displayName: 'Catnee',
    avatar:
      'https://firebasestorage.googleapis.com/v0/b/mantic-markets.appspot.com/o/user-images%2FCatnee%2FeS8aCMJKmK.jpg?alt=media&token=9f3edeac-2e51-478f-8acd-fe8b57973942',
  },
  {
    createdTime: 1680327249010,
    amount: 11000,
    userId: 'ZB5wm6TsZbfYNWOoAWIjDpzjEz72',
    username: 'Mira',
    avatar:
      'https://lh3.googleusercontent.com/a/AEdFTp77Pl94fzmBvwxTPgQ_k3Mo7xGmkWCjCIKOggb7NA=s96-c',
    displayName: 'Mira',
  },
  {
    amount: 10000,
    displayName: 'Andrew G',
    avatar:
      'https://lh3.googleusercontent.com/a-/AOh14GiaKzvDVGOvUXFxGChB6G4D9spo8N6MGUqFjIRTqAk=s96-c',
    userId: 'H6b5PWELWfRV6HhyHAlCGq7yJJu2',
    createdTime: 1680326239652,
    username: 'AndrewG',
  },
  {
    createdTime: 1680325904653,
    userId: 'i7lDZK38GpaAUzWOH9dNsdOSyPi2',
    avatar:
      'https://lh3.googleusercontent.com/a/AEdFTp4m2__gqSTo0bqbJzwXNDn7WU4i0VwJ5UJA5N-g=s96-c',
    amount: 550,
    displayName: 'SkepticIC',
    username: 'SkepticIC',
  },
  {
    userId: 'rybxBG1YfkbcoDfXsFf2QZop9ws1',
    amount: 500,
    displayName: '42irrationalist',
    username: '42irrationalist',
    avatar:
      'https://firebasestorage.googleapis.com/v0/b/mantic-markets.appspot.com/o/user-images%2FAlexanderPutilin%2FTt4GFR47qE.jpg?alt=media&token=5e7621c6-8efd-4c66-aefc-d35e6e490ade',
    createdTime: 1680325536466,
  },
  {
    userId: 'Fz12fyQzT0cnfaSp2iOYvLsYmTi1',
    createdTime: 1680325534901,
    username: 'EzraSchott',
    amount: 400,
    avatar:
      'https://lh3.googleusercontent.com/a/AEdFTp7Gmp2I7EPKbPCxnpoMGadeODPlpd0ZYhrymxIc=s96-c',
    displayName: 'Ezra Schott',
  },
  {
    userId: 'Xq7O5e6LEwcFPJQckXw6uy4nflf1',
    createdTime: 1680324834201,
    amount: 300,
    avatar:
      'https://firebasestorage.googleapis.com/v0/b/mantic-markets.appspot.com/o/user-images%2FTrong%2FKAhZUwrNdm.jpg?alt=media&token=edfcd113-ddd5-4c7b-92fa-7febb5419c1d',
    displayName: 'Trong',
    username: '8',
  },
  {
    username: 'SkepticIC',
    createdTime: 1680324551924,
    userId: 'i7lDZK38GpaAUzWOH9dNsdOSyPi2',
    amount: 269,
    avatar:
      'https://lh3.googleusercontent.com/a/AEdFTp4m2__gqSTo0bqbJzwXNDn7WU4i0VwJ5UJA5N-g=s96-c',
    displayName: 'SkepticIC',
  },
  {
    avatar:
      'https://lh3.googleusercontent.com/a/AEdFTp4m2__gqSTo0bqbJzwXNDn7WU4i0VwJ5UJA5N-g=s96-c',
    createdTime: 1680323911188,
    username: 'SkepticIC',
    displayName: 'SkepticIC',
    userId: 'i7lDZK38GpaAUzWOH9dNsdOSyPi2',
    amount: 237,
  },
  {
    avatar:
      'https://firebasestorage.googleapis.com/v0/b/mantic-markets.appspot.com/o/user-images%2Fomnishambles%2FDyoVed-RBw.jpg?alt=media&token=c3fbcfbc-62bc-4d8e-8896-445e00b4b6ac',
    createdTime: 1680323879119,
    username: 'omnishambles',
    amount: 215,
    displayName: 'omnishambles',
    userId: 'XMaPxw1WqFRRhme82HEb24haAMG2',
  },
  {
    username: 'SkepticIC',
    avatar:
      'https://lh3.googleusercontent.com/a/AEdFTp4m2__gqSTo0bqbJzwXNDn7WU4i0VwJ5UJA5N-g=s96-c',
    createdTime: 1680323690964,
    userId: 'i7lDZK38GpaAUzWOH9dNsdOSyPi2',
    displayName: 'SkepticIC',
    amount: 195,
  },
  {
    username: 'Conflux',
    userId: 'HTbxWFlzWGeHUTiwZvvF0qm8W433',
    createdTime: 1680323682430,
    avatar:
      'https://firebasestorage.googleapis.com/v0/b/mantic-markets.appspot.com/o/user-images%2FConflux%2FIaFDTz3rB-.png?alt=media&token=d064eaf3-f07d-4e16-9cdd-373b64a5cd17',
    displayName: 'Conflux',
    amount: 175,
  },
  {
    username: 'SkepticIC',
    avatar:
      'https://lh3.googleusercontent.com/a/AEdFTp4m2__gqSTo0bqbJzwXNDn7WU4i0VwJ5UJA5N-g=s96-c',
    userId: 'i7lDZK38GpaAUzWOH9dNsdOSyPi2',
    displayName: 'SkepticIC',
    amount: 150,
    createdTime: 1680323633944,
  },
  {
    displayName: 'SkepticIC',
    createdTime: 1680323631926,
    username: 'SkepticIC',
    userId: 'i7lDZK38GpaAUzWOH9dNsdOSyPi2',
    avatar:
      'https://lh3.googleusercontent.com/a/AEdFTp4m2__gqSTo0bqbJzwXNDn7WU4i0VwJ5UJA5N-g=s96-c',
    amount: 135,
  },
  {
    avatar:
      'https://lh3.googleusercontent.com/a/AEdFTp4m2__gqSTo0bqbJzwXNDn7WU4i0VwJ5UJA5N-g=s96-c',
    createdTime: 1680323626059,
    displayName: 'SkepticIC',
    username: 'SkepticIC',
    userId: 'i7lDZK38GpaAUzWOH9dNsdOSyPi2',
    amount: 120,
  },
  {
    createdTime: 1680323618298,
    userId: 'i7lDZK38GpaAUzWOH9dNsdOSyPi2',
    displayName: 'SkepticIC',
    amount: 105,
    avatar:
      'https://lh3.googleusercontent.com/a/AEdFTp4m2__gqSTo0bqbJzwXNDn7WU4i0VwJ5UJA5N-g=s96-c',
    username: 'SkepticIC',
  },
  {
    username: 'SkepticIC',
    userId: 'i7lDZK38GpaAUzWOH9dNsdOSyPi2',
    displayName: 'SkepticIC',
    avatar:
      'https://lh3.googleusercontent.com/a/AEdFTp4m2__gqSTo0bqbJzwXNDn7WU4i0VwJ5UJA5N-g=s96-c',
    amount: 95,
    createdTime: 1680323616080,
  },
  {
    displayName: 'SkepticIC',
    amount: 85,
    userId: 'i7lDZK38GpaAUzWOH9dNsdOSyPi2',
    username: 'SkepticIC',
    avatar:
      'https://lh3.googleusercontent.com/a/AEdFTp4m2__gqSTo0bqbJzwXNDn7WU4i0VwJ5UJA5N-g=s96-c',
    createdTime: 1680323614187,
  },
  {
    avatar:
      'https://lh3.googleusercontent.com/a/AEdFTp4m2__gqSTo0bqbJzwXNDn7WU4i0VwJ5UJA5N-g=s96-c',
    amount: 75,
    username: 'SkepticIC',
    displayName: 'SkepticIC',
    userId: 'i7lDZK38GpaAUzWOH9dNsdOSyPi2',
    createdTime: 1680323610931,
  },
  {
    username: 'SkepticIC',
    avatar:
      'https://lh3.googleusercontent.com/a/AEdFTp4m2__gqSTo0bqbJzwXNDn7WU4i0VwJ5UJA5N-g=s96-c',
    displayName: 'SkepticIC',
    userId: 'i7lDZK38GpaAUzWOH9dNsdOSyPi2',
    amount: 65,
    createdTime: 1680323609258,
  },
  {
    userId: 'i7lDZK38GpaAUzWOH9dNsdOSyPi2',
    createdTime: 1680323608060,
    amount: 55,
    displayName: 'SkepticIC',
    avatar:
      'https://lh3.googleusercontent.com/a/AEdFTp4m2__gqSTo0bqbJzwXNDn7WU4i0VwJ5UJA5N-g=s96-c',
    username: 'SkepticIC',
  },
  {
    avatar:
      'https://lh3.googleusercontent.com/a/AEdFTp4m2__gqSTo0bqbJzwXNDn7WU4i0VwJ5UJA5N-g=s96-c',
    displayName: 'SkepticIC',
    userId: 'i7lDZK38GpaAUzWOH9dNsdOSyPi2',
    createdTime: 1680323606588,
    username: 'SkepticIC',
    amount: 45,
  },
  {
    createdTime: 1680323588899,
    amount: 35,
    username: 'SkepticIC',
    avatar:
      'https://lh3.googleusercontent.com/a/AEdFTp4m2__gqSTo0bqbJzwXNDn7WU4i0VwJ5UJA5N-g=s96-c',
    userId: 'i7lDZK38GpaAUzWOH9dNsdOSyPi2',
    displayName: 'SkepticIC',
  },
  {
    createdTime: 1680323538337,
    amount: 25,
    avatar:
      'https://lh3.googleusercontent.com/a/AEdFTp4XGc0m49XU1EMAvWdItuunNJCxqN7eJ7o4aw=s96-c',
    displayName: 'Aaron Lehmann',
    username: 'AaronLehmann',
    userId: 'KMOIYhksuFVW7sUHMBLi97F3UNt2',
  },
  {
    username: 'omnishambles',
    createdTime: 1680323487359,
    avatar:
      'https://firebasestorage.googleapis.com/v0/b/mantic-markets.appspot.com/o/user-images%2Fomnishambles%2FDyoVed-RBw.jpg?alt=media&token=c3fbcfbc-62bc-4d8e-8896-445e00b4b6ac',
    amount: 20,
    displayName: 'omnishambles',
    userId: 'XMaPxw1WqFRRhme82HEb24haAMG2',
  },
  {
    userId: 'zAC0eT226KgSfWV5fQKNnaNYx9D2',
    createdTime: 1680323420918,
    avatar:
      'https://lh3.googleusercontent.com/a/AEdFTp6OLVUXwucMM8cf0ZzYtkEOds3BoyY_XnkOlvym1w=s96-c',
    username: 'Kabirden',
    amount: 10,
    displayName: 'Ethan W',
  },
  {
    createdTime: 1680323393085,
    userId: 'fP5OQUWYt4MW17A2giGjMGsw1uu2',
    avatar:
      'https://lh3.googleusercontent.com/a-/AOh14Gh_23ZmfLBMGBR2crNwb0T8hBnPAap5nkWiSKuB=s96-c',
    displayName: 'Lars Doucet',
    username: 'LarsDoucet',
    amount: 1,
  },
]

export default function ManaAuctionPage() {
  const maxBid = max(bids.map((b) => b.amount)) ?? 0
  const bidder = bids.find((b) => b.amount === maxBid)?.displayName ?? 'None'
  const totalRaised = Object.entries(groupBy(bids, 'userId'))
    .map(([, bids]) => max(bids.map((b) => b.amount)) ?? 0)
    .reduce((a, b) => a + b, 0)

  const time = useTimer()
  const timeRemaining = getCountdown(time, CUTOFF_TIME)

  return (
    <Page trackPageView={'mana auction'}>
      <Col className="gap-4 px-4 sm:px-8 sm:pb-4">
        <SEO
          title="Mana auction"
          description="To celebrate April 1st and to give back to the community, Manifold is
          hosting an auction for M10,000."
        />
        <Title className="mx-2 !mb-0 mt-2 sm:mx-0 lg:mt-0">
          💰 {formatMoney(10000)} auction 💰
        </Title>

        <div>
          To celebrate April 1st and to give back to the community, Manifold is
          hosting an auction for {formatMoney(10000)}.
        </div>

        <GradientContainer className="mb-8">
          <Row className="gap-4 sm:gap-8">
            <div className="text-ink-700 text-center text-xl">
              Highest bid{' '}
              <div className="text-primary-700 text-4xl">
                {formatMoney(maxBid)}
              </div>
            </div>

            <div className="text-ink-700 hidden flex-col text-center text-xl sm:flex">
              Bidder <div className="text-secondary-700 text-3xl">{bidder}</div>
            </div>

            <div className="text-ink-700 text-center text-xl">
              Time remaining{' '}
              <div className="text-secondary-700 text-3xl">{timeRemaining}</div>
            </div>

            {time > CUTOFF_TIME && (
              <div className="text-ink-700 hidden flex-col text-center text-xl sm:flex">
                Total raised{' '}
                <div className="text-secondary-700 text-3xl">
                  {formatMoney(totalRaised)}
                </div>
              </div>
            )}
          </Row>
        </GradientContainer>

        <div className="prose prose-sm text-ink-600 max-w-[800px]">
          <b>Rules</b>
          <ul>
            <li>
              The highest bidder at midnight Pacific Time wins{' '}
              {formatMoney(10000)}.
            </li>

            <li>
              Users can submit multiple bids. Each bid must be at least 10%
              higher than the previous bid.
            </li>

            <li>
              Users pay their highest bid. E.g. if you bid {formatMoney(5)} and
              then {formatMoney(10)}, you will end up paying {formatMoney(10)}{' '}
              in total, even if your bid does not win.
            </li>
          </ul>
        </div>

        <BidTable bids={bids} />
      </Col>
    </Page>
  )
}

const useTimer = () => {
  const [time, setTime] = useState(+new Date(2023, 3, 1))

  useEffect(() => {
    const interval = setInterval(() => setTime(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [])

  return time
}

const getCountdown = (now: number, later: number) => {
  const distance = now >= later ? 0 : later - now

  const days = Math.floor(distance / (1000 * 60 * 60 * 24))

  const hours = Math.floor(
    (distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)
  )
  const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60))
  const seconds = Math.floor((distance % (1000 * 60)) / 1000)

  return buildArray(
    days > 0 && days + 'd',
    `${hours}h ${minutes}m ${seconds}s`
  ).join(' ')
}

const BidTable = ({ bids }: { bids: Bid[] }) => {
  if (bids.length === 0) return <></>

  return (
    <>
      <Spacer h={2} />

      <div>Bids</div>

      <Col className="bg-canvas-0 divide-ink-300 border-ink-300  w-72 divide-y-[0.5px] rounded-sm border-[0.5px]">
        {bids.map((bid) => (
          <div
            key={bid.createdTime}
            className={clsx(
              'group flex flex-row gap-1 whitespace-nowrap px-4 py-3 lg:gap-2',
              'focus:bg-ink-300/30 lg:hover:bg-ink-300/30 transition-colors',
              'justify-between'
            )}
          >
            <UserHovercard userId={bid.userId}>
              <Row className="text-ink-700 max-w-sm truncate">
                <Avatar
                  username={bid.username}
                  avatarUrl={bid.avatar}
                  size="xs"
                  className="mr-2"
                />
                {bid.displayName}
              </Row>
            </UserHovercard>

            <div>{formatMoney(bid.amount)}</div>
            <div className="text-ink-700">
              {dayjs(bid.createdTime).format('h:mm A')}
            </div>
          </div>
        ))}
      </Col>
    </>
  )
}
