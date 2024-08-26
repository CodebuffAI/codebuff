import clsx from 'clsx'
import { useState } from 'react'
import Link from 'next/link'
import Router from 'next/router'

import { Contract, tradingAllowed } from 'common/contract'
import { SEO } from 'web/components/SEO'
import { Button } from 'web/components/buttons/button'
import { BinaryResolutionOrChance } from 'web/components/contract/contract-price'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { Row } from 'web/components/layout/row'
import { useUser } from 'web/hooks/use-user'
import { Linkify } from 'web/components/widgets/linkify'
import { useAdminOrMod } from 'web/hooks/use-admin'
import {
  BinaryBetPanel,
  SimpleMultiOverview,
} from 'web/components/contract/contract-overview'
import { PublicChat } from 'web/components/chat/public-chat'
import { Tabs } from 'web/components/layout/tabs'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import { ScheduleItem } from './tv-schedule'
import { ScheduleTVModal } from './schedule-tv-modal'
import { DOMAIN, TRADE_TERM } from 'common/envs/constants'
import { Presence } from './tv-page'
import { sortBy } from 'lodash'
import { Avatar } from '../widgets/avatar'
import { buildArray } from 'common/util/array'

export function TVDisplay(props: {
  contract: Contract
  stream?: ScheduleItem
  watchers?: Presence[]
}) {
  const { contract, stream, watchers } = props

  const user = useUser()

  const isMod = useAdminOrMod()
  const showModify = user?.id === stream?.creator_id || isMod

  const isMobile = useIsMobile(1280) //xl
  const [showSettings, setShowSettings] = useState(false)

  const isBinary = contract.outcomeType === 'BINARY'
  const isMulti =
    contract.outcomeType === 'MULTIPLE_CHOICE' &&
    contract.mechanism === 'cpmm-multi-1'

  const betPanel = (
    <>
      {tradingAllowed(contract) && isBinary && (
        <BinaryBetPanel contract={contract} user={user} />
      )}
      {tradingAllowed(contract) && isMulti && (
        <SimpleMultiOverview contract={contract} />
      )}
    </>
  )

  const channelId = `tv-${stream?.id ?? 'default'}`

  const streamSrc = (() => {
    if (stream?.source === 'twitch') {
      return `https://player.twitch.tv/?channel=${stream.stream_id}&parent=${DOMAIN}&autoplay=true`
    } else if (stream?.source === 'youtube') {
      return (
        'https://www.youtube.com/embed/' + stream?.stream_id + '?autoplay=1'
      )
    } else if (stream?.source === 'twitter') {
      return `https://platform.twitter.com/embed/Tweet.html?dnt=false&embedId=twitter-widget-0&features=eyJ0ZndfdGltZWxpbmVfbGlzdCI6eyJidWNrZXQiOltdLCJ2ZXJzaW9uIjpudWxsfSwidGZ3X2ZvbGxvd2VyX2NvdW50X3N1bnNldCI6eyJidWNrZXQiOnRydWUsInZlcnNpb24iOm51bGx9LCJ0ZndfdHdlZXRfZWRpdF9iYWNrZW5kIjp7ImJ1Y2tldCI6Im9uIiwidmVyc2lvbiI6bnVsbH0sInRmd19yZWZzcmNfc2Vzc2lvbiI6eyJidWNrZXQiOiJvbiIsInZlcnNpb24iOm51bGx9LCJ0ZndfZm9zbnJfc29mdF9pbnRlcnZlbnRpb25zX2VuYWJsZWQiOnsiYnVja2V0Ijoib24iLCJ2ZXJzaW9uIjpudWxsfSwidGZ3X21peGVkX21lZGlhXzE1ODk3Ijp7ImJ1Y2tldCI6InRyZWF0bWVudCIsInZlcnNpb24iOm51bGx9LCJ0ZndfZXhwZXJpbWVudHNfY29va2llX2V4cGlyYXRpb24iOnsiYnVja2V0IjoxMjA5NjAwLCJ2ZXJzaW9uIjpudWxsfSwidGZ3X3Nob3dfYmlyZHdhdGNoX3Bpdm90c19lbmFibGVkIjp7ImJ1Y2tldCI6Im9uIiwidmVyc2lvbiI6bnVsbH0sInRmd19kdXBsaWNhdGVfc2NyaWJlc190b19zZXR0aW5ncyI6eyJidWNrZXQiOiJvbiIsInZlcnNpb24iOm51bGx9LCJ0ZndfdXNlX3Byb2ZpbGVfaW1hZ2Vfc2hhcGVfZW5hYmxlZCI6eyJidWNrZXQiOiJvbiIsInZlcnNpb24iOm51bGx9LCJ0ZndfdmlkZW9faGxzX2R5bmFtaWNfbWFuaWZlc3RzXzE1MDgyIjp7ImJ1Y2tldCI6InRydWVfYml0cmF0ZSIsInZlcnNpb24iOm51bGx9LCJ0ZndfbGVnYWN5X3RpbWVsaW5lX3N1bnNldCI6eyJidWNrZXQiOnRydWUsInZlcnNpb24iOm51bGx9LCJ0ZndfdHdlZXRfZWRpdF9mcm9udGVuZCI6eyJidWNrZXQiOiJvbiIsInZlcnNpb24iOm51bGx9fQ%3D%3D&frame=false&hideCard=false&hideThread=false&id=${stream.stream_id}&lang=en&maxWidth=1000px&maxHeight=300px&origin=https%3A%2F%2Fpublish.twitter.com%2F%23&sessionId=6def12a89bdb0d99bf58197bc34012a9f3f22936&theme=light&widgetsVersion=2615f7e52b7e0%3A1702314776716`
    }
    return ''
  })()

  return (
    <Page trackPageView="tv page" className="!mt-0 xl:col-span-10 xl:pr-0">
      <SEO
        title={`${stream?.title} on Manifold TV`}
        description={`Watch the stream and ${TRADE_TERM} on ${contract.question}`}
        url={`/tv/${stream?.id}`}
        image={contract.coverImageUrl}
      />
      <Row className="w-full items-start">
        <Col className={clsx('bg-canvas-0 w-full rounded-b ')}>
          <iframe
            src={streamSrc}
            title="Manifold Live video"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="bg-canvas-0 h-[300px] w-full lg:h-[500px]"
          />

          <Col className="mb-2 p-4 md:pb-8 lg:px-8">
            <Row className="justify-between gap-4">
              <Row className="gap-2 text-xl font-medium sm:text-2xl">
                <Link
                  href={`/${contract.creatorUsername}/${contract.slug}`}
                  target="_blank"
                  className="hover:underline"
                >
                  <Linkify text={contract.question} />
                </Link>
              </Row>
              {isBinary && (
                <BinaryResolutionOrChance isCol contract={contract} />
              )}
            </Row>
            {isMobile ? (
              <Tabs
                tabs={buildArray([
                  { title: 'Market', content: betPanel },
                  {
                    title: 'Chat',
                    content: (
                      <PublicChat
                        channelId={channelId}
                        key={channelId}
                        className="bg-canvas-50"
                      />
                    ),
                  },
                  watchers && {
                    title: `${watchers.length} Viewers`,
                    content: <Watchers watchers={watchers} />,
                  },
                ])}
              />
            ) : (
              betPanel
            )}
          </Col>

          <Row className="m-4 gap-4">
            {showModify && (
              <Button
                color="indigo-outline"
                onClick={() => setShowSettings(true)}
              >
                Modify event
              </Button>
            )}
            <Button
              color="indigo-outline"
              onClick={() => Router.push('/tv/schedule')}
            >
              See schedule
            </Button>
            <ScheduleTVModal
              open={showSettings}
              setOpen={() => setShowSettings(false)}
              stream={stream}
              slug={contract.slug}
            />
          </Row>
        </Col>

        <Col className="sticky top-0 ml-4 hidden h-screen w-[300px] max-w-[375px] xl:flex xl:w-[350px]">
          {watchers && (
            <div className="text-ink-500">
              <div>{watchers.length} viewers</div>
              <Watchers watchers={watchers} limit={10} />
            </div>
          )}
          <div className={'border-b-2 py-2 text-xl text-indigo-700'}>
            Live chat
          </div>
          <PublicChat
            channelId={channelId}
            key={channelId}
            className="min-h-0 grow"
          />
        </Col>
      </Row>
    </Page>
  )
}

const Watchers = (props: { watchers: Presence[]; limit?: number }) => {
  const { watchers, limit } = props
  const sorted = sortBy(watchers, 'onlineAt')
  const displayed = limit ? sorted.slice(-limit) : sorted.reverse()

  return (
    <div className="flex flex-wrap gap-1 py-1">
      {displayed.map((watcher) => (
        <Avatar
          key={watcher.id}
          username={watcher.username}
          avatarUrl={watcher.avatarUrl}
          size="sm"
        />
      ))}
    </div>
  )
}
