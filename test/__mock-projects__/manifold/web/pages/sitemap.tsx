import { useState } from 'react'
import Link from 'next/link'
import { MailIcon, NewspaperIcon } from '@heroicons/react/outline'
import {
  TbBrandAndroid,
  TbBrandApple,
  TbBrandDiscord,
  TbBrandTwitter,
} from 'react-icons/tb'

import {
  APPLE_APP_URL,
  GOOGLE_PLAY_APP_URL,
  TRADE_TERM,
} from 'common/envs/constants'
import { MobileAppsQRCodeDialog } from 'web/components/buttons/mobile-apps-qr-code-button'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { ManifoldLogo } from 'web/components/nav/manifold-logo'
import { PrivacyTermsLab } from 'web/components/privacy-terms'
import { SEO } from 'web/components/SEO'
import { Title } from 'web/components/widgets/title'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import { useUser } from 'web/hooks/use-user'
import { getNativePlatform } from 'web/lib/native/is-native'
import { isIOS } from 'web/lib/util/device'
import { LabCard } from './lab'
import { capitalize } from 'lodash'

export default function AboutPage() {
  const { isNative, platform } = getNativePlatform()

  const isMobile = useIsMobile()
  const [isModalOpen, setIsModalOpen] = useState(false)

  const appCallback = isMobile
    ? { href: isIOS() ? APPLE_APP_URL : GOOGLE_PLAY_APP_URL }
    : ({
        href: '#',
        onClick: (e: any) => {
          e.preventDefault()
          setIsModalOpen(true)
        },
      } as { href: string }) // typechecker is dumb

  const user = useUser()

  return (
    <Page trackPageView={'about page'}>
      <SEO
        title="About"
        description={`Manifold is a social prediction game. ${capitalize(
          TRADE_TERM
        )} on news, politics, tech, & AI with play money. Or create your own prediction market.`}
      />

      <Col className="p-4">
        <Title className="hidden sm:flex">Sitemap</Title>
        <ManifoldLogo className="mb-4 flex sm:hidden" />
        <div className="mb-5">
          <h2 className={'text-ink-600 text-xl'}>Socials</h2>

          <MobileAppsQRCodeDialog
            isModalOpen={isModalOpen}
            setIsModalOpen={setIsModalOpen}
          />

          <div className="  mt-3 grid grid-cols-2  gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <SocialLink
              Icon={TbBrandDiscord}
              href="https://discord.com/invite/eHQBNBqXuh"
              target="_blank"
            >
              Discord
            </SocialLink>
            <SocialLink
              Icon={NewspaperIcon}
              href="https://news.manifold.markets"
              target="_blank"
            >
              Newsletter
            </SocialLink>
            <SocialLink
              Icon={TbBrandTwitter}
              href="https://twitter.com/ManifoldMarkets"
              target="_blank"
            >
              Twitter
            </SocialLink>
            <SocialLink
              Icon={MailIcon}
              href="mailto:info@manifold.markets"
              target="_blank"
            >
              Email
            </SocialLink>
            {!isNative && (
              <SocialLink
                Icon={!isMobile || isIOS() ? TbBrandApple : TbBrandAndroid}
                {...appCallback}
              >
                Mobile App
              </SocialLink>
            )}
          </div>
        </div>

        <div className="mb-3">
          <h2 className={'text-ink-600  text-xl'}>Site pages</h2>
          <div className="mt-4 grid gap-x-2 md:grid-cols-3">
            <LabCard
              title="⚙️ Notification & email settings"
              href="/notifications?tab=settings"
            />
            {user && (
              <LabCard
                title="✏️ Edit profile"
                href={`/${user?.username ?? ''}?tab=edit+profile`}
              />
            )}
            {user && (!isNative || (isNative && platform !== 'ios')) && (
              <LabCard title="💰 Get mana" href="/add-funds" />
            )}
            {user && <LabCard title="🤗‍ Refer a friend" href="/referrals" />}

            <LabCard title="🏁 Leagues" href="/leagues" />
            <LabCard title="🏆 Leaderboards" href="/leaderboards" />

            {(!isNative || (isNative && platform !== 'ios')) && (
              <LabCard title="🫀 Charity" href="/charity" />
            )}

            <LabCard title="📺 TV" href="/tv" />
            <LabCard title="️🔖 Dashboards" href="/dashboard" />
            <LabCard title="⚡️ Site activity" href="/live" />
            <LabCard title="🤖 AI" href="/ai" />
            <LabCard title="🇺🇸 US elections" href="/election" />
            {/* <LabCard title="️🧪 Lab" href="/lab" /> */}
          </div>
        </div>
        <div className="mb-3">
          <h2 className={'text-ink-600 text-xl'}>Informative resources</h2>
          <div className="mt-4 grid gap-x-2 md:grid-cols-3">
            <LabCard title="ℹ️ About page" href="/about" />
            <LabCard
              title="📜 Community guidelines"
              href="https://manifoldmarkets.notion.site/New-WIP-Community-Guidelines-2b986d33f0c646478d4921667c272f21"
              target="_blank"
            />
            <LabCard
              title="📚 FAQ"
              href="https://docs.manifold.markets/faq"
              target="_blank"
            />
            <LabCard
              title="🎯 Calibration & track record"
              href="/calibration"
            />
            <LabCard
              title="🦋 Changelog"
              href="https://manifoldmarkets.notion.site/Changelog-da5b4fe95872484f8fa4ee5cc71806d8"
              target="_blank"
            />
            <LabCard
              title="👑 Creator Partner Program"
              href="/partner-explainer"
            />
            <LabCard
              title="📠 API docs"
              href="https://docs.manifold.markets/api"
              target="_blank"
            />
          </div>
        </div>
        <div>
          <h2 className={'text-ink-600 text-xl'}>External sites</h2>
          <div className="mt-4 grid gap-x-2 md:grid-cols-3">
            {' '}
            <LabCard
              title="🧑‍💻 Open source repo"
              href="https://github.com/manifoldmarkets/manifold"
              target="_blank"
            />
            <LabCard
              title="️🎊 Manifest"
              href="https://www.manifest.is/"
              target="_blank"
            />{' '}
            <LabCard
              title="️💘 Bet on Love"
              href="https://www.youtube.com/watch?v=mEF0S1qOsFI"
              target="_blank"
            />
            <LabCard
              title="❤️ Manifold.love"
              href="https://manifold.love"
              target="_blank"
            />
            <LabCard
              title="🦊 Manifund"
              href="https://manifund.org/"
              target="_blank"
            />
            <LabCard
              title="📈 Additional calibration"
              href="https://calibration.city/"
              target="_blank"
            />
          </div>
        </div>
      </Col>
      <PrivacyTermsLab />
    </Page>
  )
}

const SocialLink = (props: {
  href: string
  onClick?: () => void
  Icon: any
  children: React.ReactNode
  target?: string
}) => {
  const { href, onClick, Icon, children, target } = props
  return (
    <Link
      href={href}
      onClick={onClick}
      target={target}
      className="bg-canvas-0 text-ink-800 hover:text-primary-800 hover:bg-primary-100 flex items-center justify-center gap-1.5 whitespace-nowrap rounded p-2 font-semibold transition-colors"
    >
      <Icon className="h-6 w-6" />
      {children}
    </Link>
  )
}
