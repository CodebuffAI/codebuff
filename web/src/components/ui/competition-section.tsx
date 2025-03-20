import { CompetitionTabs } from './competition/competition-tabs'
import { DecorativeBlocks, BlockColor } from './decorative-blocks'

export function CompetitionSection() {
  return (
    <section className="py-24 bg-black relative overflow-hidden">
      <div className="codebuff-container relative z-10">
        <div className="space-y-8 mb-16">
          <div>
            <h2 className="text-3xl md:text-4xl font-medium text-white hero-heading">
              Codebuff vs the Competition
            </h2>
            <span className="text-xs font-semibold uppercase tracking-wider text-white/70 mt-2 block">
              Spoiler: We're faster, smarter, and work anywhere you do
            </span>
          </div>
        </div>

        <CompetitionTabs />
      </div>
    </section>
  )
}
