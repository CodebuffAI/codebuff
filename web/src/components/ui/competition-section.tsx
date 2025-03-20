import { CompetitionTabs } from './competition/competition-tabs'

export function CompetitionSection() {
  return (
    <section className="py-24 bg-[#003300] relative overflow-hidden">
      <div className="codebuff-container relative z-10">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-medium mb-6 text-white relative inline-block hero-heading">
            The Competition
            <span className="absolute -bottom-2 left-0 w-full h-1 bg-primary"></span>
          </h2>
          <p className="text-lg mb-8 text-zinc-300 max-w-3xl mx-auto">
            See how Codebuff compares to other AI coding assistants.
            We're faster, smarter, and work anywhere you do.
          </p>
        </div>

        <CompetitionTabs />
      </div>
    </section>
  )
}