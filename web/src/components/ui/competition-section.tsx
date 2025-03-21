import { CompetitionTabs } from './competition/competition-tabs'
import { Section } from './section'

export function CompetitionSection() {
  return (
    <Section background="black">
      <div className="space-y-8">
        <div>
          <h2 className="text-3xl md:text-4xl font-medium text-white hero-heading">
            Codebuff vs the Competition
          </h2>
          <span className="text-xs font-semibold uppercase tracking-wider text-white/70 mt-2 block">
            Spoiler: We're faster, smarter, and work anywhere you do
          </span>
        </div>

        <CompetitionTabs />
      </div>
    </Section>
  )
}
