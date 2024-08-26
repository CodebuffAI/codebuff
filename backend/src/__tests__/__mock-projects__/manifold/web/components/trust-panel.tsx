import { Col } from './layout/col'
import { ExpandSection } from './explainer-panel'
import { track } from 'web/lib/service/analytics'
import { TRADE_TERM } from 'common/envs/constants'

export const TrustPanel = (props: { className?: string }) => {
  const { className } = props
  const handleSectionClick = (sectionTitle: string) => {
    track('trust calibration section click', { sectionTitle })
  }
  return (
    <div className={className}>
      <Col className="mx-auto">
        <WhyNotAlternatives onClick={handleSectionClick} />
        <ManipulationAndHype onClick={handleSectionClick} />
        <LowTraders onClick={handleSectionClick} />
      </Col>
    </div>
  )
}

export const ManipulationAndHype = ({
  onClick,
}: {
  onClick: (sectionTitle: string) => void
}) => (
  <ExpandSection
    onClick={() => onClick('Are markets resistant to manipulation and hype?')}
    title="🤑 Are markets resistant to manipulation and hype?"
  >
    <div>
      As the market prices moves further from the true probability, the odd's
      pricing becomes better for traders to correct it in the right direction.
      Naturally, this increases the incentive to {TRADE_TERM} accurately as
      there is more money to be made once the market resolves.
    </div>
    <div className="py-2">
      Robin Hanson explores this further in his paper, {''}
      <a
        className="text-primary-700 hover:underline"
        target="_blank"
        href="https://mason.gmu.edu/~rhanson/biashelp.pdf"
      >
        A Manipulator Can Aid Prediction Market Accuracy
      </a>
      . In it he examines how both historical and lab data fail to find
      substantial effects of manipulation on average price accuracy.
      Furthermore, he finds in his model that adding a manipulator may even
      increase accuracy as it increases noise trading which tends to have a
      positive effect in low liquidity markets.
    </div>
    <div>
      See also, {''}
      <a
        className="text-primary-700 hover:underline"
        target="_blank"
        href="https://www.astralcodexten.com/i/85781340/scandal-markets"
      >
        Scott Alexander's failed manipulation attempt
      </a>{' '}
      on Manifold.
    </div>
  </ExpandSection>
)

export const LowTraders = ({
  onClick,
}: {
  onClick: (sectionTitle: string) => void
}) => (
  <ExpandSection
    onClick={() =>
      onClick('Do markets with few traders and low liquidity work?')
    }
    title="🌱 Do markets with few traders and low liquidity work?"
  >
    <div className="pb-2">
      Yes! And very reliably! The paper{' '}
      <a
        className="text-primary-700 hover:underline"
        target="_blank"
        href="https://core.ac.uk/download/pdf/235244384.pdf"
      >
        Prediction Markets: Practical Experiments in Small Markets and
        Behaviours Observed
      </a>
      , concluded,
    </div>
    <blockquote className="border-primary-700 border-l-4  pl-4">
      <div>
        “16 or more traders should be sufficient to obtain quality predictions.
        Smaller markets may be just as useful, though they may exhibit biases of
        under confidence toward market favourites.”
      </div>
    </blockquote>
    <div className="pt-2">
      Our own {''}
      <a
        className="text-primary-700 hover:underline"
        target="_blank"
        href="https://manifold.markets/vluzko/after-how-many-unique-traders-will#EiWKtYBZaWvQbj27W6tT"
      >
        data
      </a>
      {''} has shown that somewhere between 10 - 20 traders our calibration no
      longer improves with more traders. We still need to conduct analysis on
      the impact liquidity has on accuracy.
    </div>
  </ExpandSection>
)

export const WhyNotAlternatives = ({
  onClick,
}: {
  onClick: (sectionTitle: string) => void
}) => (
  <ExpandSection
    onClick={() => onClick('Why are markets better than polls or experts?')}
    title="📊 Why are markets better than polls or experts?"
  >
    <div className="pb-2">
      One paper about {''}
      <a
        className="text-primary-700 hover:underline"
        target="_blank"
        href="https://www.pnas.org/doi/10.1073/pnas.1516179112"
      >
        predicting scientific paper replication
      </a>{' '}
      {''}
      compared these forecasting methods. It found that prediction markets
      outperformed surveys and
    </div>
    <blockquote className="border-primary-700 border-l-4  pl-4">
      <div>
        ...could be used to obtain speedy information about reproducibility at
        low cost and could potentially even be used to determine which studies
        to replicate to optimally allocate limited resources into replications.”
      </div>
    </blockquote>
    <div className="pt-2">
      Either prediction markets are more accurate than experts, or experts
      should be able to make a lot of money on them, and in doing so correct the
      markets.
    </div>
  </ExpandSection>
)
