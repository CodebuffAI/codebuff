import { TbBrandDiscord } from 'react-icons/tb'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { ManifoldLogo } from 'web/components/nav/manifold-logo'
import { PrivacyTermsLab } from 'web/components/privacy-terms'
import { SEO } from 'web/components/SEO'
import { Title } from 'web/components/widgets/title'
import { getNativePlatform } from 'web/lib/native/is-native'
import { ExplainerPanel } from 'web/components/explainer-panel'
import { LabCard } from './lab'
import { TRADE_TERM } from 'common/envs/constants'
import { capitalize } from 'lodash'

export default function AboutPage() {
  getNativePlatform()

  return (
    <Page trackPageView={'about page'}>
      <SEO
        title="About"
        description={`Manifold is a prediction market platform. Users place ${TRADE_TERM}s on an upcoming event which creates a probability of how likely it will happen. ${capitalize(
          TRADE_TERM
        )} on current events, politics, tech, & AI with play money. Or create your own prediction market for others to trade on!`}
      />

      <Col className=" p-4">
        <Title className="hidden sm:flex">About</Title>
        <ManifoldLogo className="mb-4 flex sm:hidden" />
        <Col className="gap-4">
          <div>
            <div className="mb-1 text-lg">
              Manifold lets you {TRADE_TERM} on upcoming events using play
              money. As other users {TRADE_TERM} against you, it creates a
              probability of how likely the event will happen—this is known as a
              prediction market.
            </div>
            <div className=" text-lg">
              {capitalize(TRADE_TERM)} on current events, politics, tech, and
              AI, or create your own market about an event you care about for
              others to trade on!
            </div>
          </div>

          <ExplainerPanel className={'max-w-full'} showWhatIsManifold={false} />

          <div>
            <h2 className={'text-ink-600 mb-2 text-xl'}>Our mission</h2>
            <div className="mb-1 text-lg">
              <li>
                Provide the most accurate, real-time predictions on any event.
              </li>
              <li>
                Combat misleading news by incentivising traders to be fast and
                correct.
              </li>
              <li>
                Help people make more informed decisions by improving their
                model of the future.
              </li>
            </div>
          </div>
          <div>
            <h2 className={'text-ink-600 mb-2 text-xl'}>Intro video</h2>
            <div className="mb-1 text-lg">
              Everything you need to know in 7 minutes presented by an animated
              corgi:
            </div>
            <iframe
              src="https://www.youtube.com/embed/DB5TfX7eaVY?start=9"
              className="mb-4 h-80 w-full max-w-2xl"
            ></iframe>
          </div>
          <div>
            <h2 className={'text-ink-600 mb-2 text-xl'}>
              Still have questions?
            </h2>

            <div className="mt-4 grid gap-x-2 md:grid-cols-3">
              <LabCard
                title="📚 FAQ"
                href="https://docs.manifold.markets/faq"
                target="_blank"
                description="For a more comprehensive overview"
              />
              <LabCard
                title="📜 Community guidelines"
                href="https://manifoldmarkets.notion.site/New-WIP-Community-Guidelines-2b986d33f0c646478d4921667c272f21"
                target="_blank"
                description="Rules, norms, and expectations"
              />

              <LabCard
                title="Discord"
                href="https://discord.com/invite/eHQBNBqXuh"
                target="_blank"
                icon={<TbBrandDiscord className="h-6 w-6" />}
                description="For the fastest help"
              />
              <LabCard
                title="📧 Email us"
                href="mailto:info@manifold.markets"
                target="_blank"
                description="If Discord didn't help"
              />
              <LabCard
                title="🗺️ Sitemap"
                href="/sitemap"
                description="I can't find something"
              />
            </div>
            <div className="text-lg">
              If you need help with a specific market please tag @mods in a
              comment for help!
            </div>
          </div>
        </Col>
      </Col>
      <PrivacyTermsLab />
    </Page>
  )
}
