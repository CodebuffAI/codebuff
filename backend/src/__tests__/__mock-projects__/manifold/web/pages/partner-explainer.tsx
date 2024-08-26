import { SEO } from 'web/components/SEO'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { Subtitle } from 'web/components/widgets/subtitle'
import { Title } from 'web/components/widgets/title'
import { useUser } from 'web/hooks/use-user'

export default function PartnerExplainer() {
  const user = useUser()
  return (
    <Page trackPageView={'partner explainer'}>
      <SEO
        title="Partner Explainer"
        description="About Manifold's Creator Partner Program"
      />
      <Col className="p-4">
        <Title className="hidden sm:flex">
          How does the Creator Partner Program work?
        </Title>
        <Col className="gap-4">
          <div>
            Manifold's Creator Partner Program allows users to{' '}
            <b>monetise their questions and receive USD income</b> for getting
            traders.
          </div>
          {user ? (
            <div>
              View your{' '}
              <a
                href={`/${user.username}/partner`}
                className="text-primary-500 hover:text-primary-700 hover:underline"
              >
                progress to becoming partner here
              </a>
              .
            </div>
          ) : null}
          <div className=" text-sm">
            Legal Clarification: {''}
            <i>
              This does not allow mana to be converted to USD nor provide any
              way for users to profit real money for trading. This only provides
              real money to the creator as a reward for creating interesting
              questions.
            </i>
          </div>
          <div>
            <Subtitle className=" !mt-2">Partner perks</Subtitle>
            <li>Earn real USD for getting traders on your markets.</li>
            <li>Earn real USD for referrals.</li>
            <li>Exclusive badge. </li>
            <li> Direct access and support from the Manifold team.</li>
            <li>All perks are in addition to the existing mana bonuses.</li>
          </div>
          <div>
            <Subtitle className=" !mt-2">How to become a partner</Subtitle>
            <div>
              {' '}
              <b>Minimum Requirements:</b>
            </div>
            <li>1250 all time traders.</li>
            <li>Create 20 markets in the last 60 days.</li>
            <li>
              Create 10 markets with at least 20 traders in the last 60 days.
            </li>

            <div className="pt-2">
              <b>
                Meeting the minimum requirements is just the start to becoming a
                partner and does not guarantee partnership. We also take into
                consideration user behaviour and market quality. This includes:
              </b>
            </div>

            <li>Concise and representative market titles.</li>
            <li>Detailed market descriptions.</li>
            <li>
              Good management of markets including clarifying confusion from
              comments or unexpected events.
            </li>
            <li>Timely, accurate resolutions.</li>
            <li>
              Any previous infractions of the{' '}
              <a
                href="https://manifoldmarkets.notion.site/New-WIP-Community-Guidelines-2b986d33f0c646478d4921667c272f21"
                className="text-primary-500 hover:text-primary-700 hover:underline"
              >
                Community Guidelines.
              </a>{' '}
            </li>
          </div>
          <div>
            <Subtitle className=" !mt-2">How to apply</Subtitle>
            <div>
              Please email {''}
              <a
                href="mailto:david@manifold.markets"
                className="text-primary-500 hover:text-primary-700 hover:underline"
              >
                david@manifold.markets
              </a>{' '}
              once you meet the minimum criteria and want to join the program.{' '}
              {''}
              {user ? (
                <a>
                  You can check how close you are to qualifying at your {''}
                  <a
                    href={`/${user.username}/partner`}
                    className="text-primary-500 hover:text-primary-700 hover:underline"
                  >
                    partner dashboard
                  </a>
                  !
                </a>
              ) : null}
              {''} There are certain circumstances where we may accept
              applications outside of these criteria. Some instances may include
              having an established audience on other platforms or a history of
              exceptional forecasting.
            </div>
          </div>
          <div>
            <Subtitle className=" !mt-2">How income is calculated</Subtitle>
            <div>
              <b>Income amount:</b>
            </div>
            <li>
              USD per trader since the start of the quarter you were made a
              partner. This means you may receive some USD for traders earned in
              the weeks prior to being partnered. The quarter start date can be
              viewed in your partner dashboard.
            </li>
            <li>$0.10 per trader on Yes/No markets.</li>
            <li>$0.20 per trader on Multi-choice markets.</li>

            <li>$1.00 per new user referral.</li>
            <div className="pt-2">
              <b>Only certain questions contribute towards USD income:</b>
            </div>
            <li>
              Question type: Must be a Yes/No question or a Multiple Choice.
            </li>
            <li>
              Trader threshold: Markets must have at least 20 traders. Markets
              which have less than 20 once the quarter ends will not contribute,
              but may contribute to a future quarter if the market at some point
              passes 20 traders.
            </li>
            <li>
              Subsidized: The market must be subsidized. Most are by default.
              See why your market may become unsubsidized in our{' '}
              <a
                href="https://manifoldmarkets.notion.site/Guidance-for-running-a-market-8cb4257ed3644ec9a1d6cc6c705f7c77?pvs=4"
                className="text-primary-500 hover:text-primary-700 hover:underline"
              >
                guidelines
              </a>
              .
            </li>
            <div className="pt-2">
              <b>Disclaimer:</b>
            </div>
            <li>
              Income will be capped at $3,000 per creator for this first,
              current quarter. We hope to remove this cap in the future.
            </li>
            <li>
              Manifold reserves the right to deduct or void your income for the
              current quarter if we believe you are abusing any loopholes or
              breaking our Community Guidelines.
            </li>
            <li>
              Manifold may revoke your partnership if you break our Community
              Guidelines or we feel the quality of your markets continues to
              significantly lower, even after warnings.
            </li>
          </div>
          <div>
            <Subtitle className=" !mt-2">Receiving Payment</Subtitle>
            <li>
              To receive payment, creators must have a valid PayPal account.
              This is the only way we can currently send payments.
            </li>
            <li>
              Alternatively, type 'mana' into the payment field in your partner
              dashboard to receive your additional bonuses as mana.
            </li>
            <li>Payments to all creators will be processed quarterly.</li>
            <li>
              If quarterly income does not exceed $20, it may be rolled over
              into the following quarter and not paid out until that threshold
              is met.
            </li>
          </div>
        </Col>
      </Col>
    </Page>
  )
}
