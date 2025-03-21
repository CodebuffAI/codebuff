import { cn } from '@/lib/utils'
import Terminal, { ColorMode } from '@/components/ui/terminal'
import TerminalOutput from '@/components/ui/terminal/terminal-output'
import { DecorativeBlocks, BlockColor } from './decorative-blocks'
import { Section } from './section'

interface FeatureSectionProps {
  title: string
  description: string
  backdropColor?: BlockColor
  imagePosition?: 'left' | 'right'
  codeSample?: string[]
  tagline?: string
  decorativeColors?: BlockColor[]
}

export function FeatureSection({
  title,
  description,
  backdropColor = BlockColor.DarkForestGreen,
  imagePosition = 'right',
  codeSample = [],
  tagline,
  decorativeColors = [BlockColor.GenerativeGreen, BlockColor.DarkForestGreen],
}: FeatureSectionProps) {
  const isLight = backdropColor === BlockColor.CRTAmber || backdropColor === BlockColor.TerminalYellow

  return (
    <Section background={backdropColor}>
      <div className="grid lg:grid-cols-2 gap-12 lg:gap-24 items-center">
        {imagePosition === 'left' ? (
          <>
            <DecorativeBlocks
              colors={decorativeColors}
              initialPlacement="top-left"
            >
              <div className="relative">
                <Terminal
                  name="Terminal"
                  colorMode={ColorMode.Dark}
                  prompt="> "
                  showWindowButtons={true}
                >
                  {codeSample.map((line, i) => (
                    <TerminalOutput key={i}>{line}</TerminalOutput>
                  ))}
                </Terminal>
              </div>
            </DecorativeBlocks>

            <div className="space-y-8">
              <div>
                <h2 className={cn('text-3xl lg:text-4xl hero-heading', {
                  'text-black': isLight,
                  'text-white': !isLight,
                })}>
                  {title}
                </h2>
                {tagline && (
                  <span className={cn('text-xs font-semibold uppercase tracking-wider mt-2 block', {
                    'text-black/70': isLight,
                    'text-white/70': !isLight
                  })}>
                    {tagline}
                  </span>
                )}
              </div>
              <p className={cn('text-lg', {
                'text-black/70': isLight,
                'text-white/70': !isLight
              })}>
                {description}
              </p>
            </div>
          </>
        ) : (
          <>
            <div className="space-y-8">
              <div>
                <h2 className={cn('text-3xl lg:text-4xl hero-heading', {
                  'text-black': isLight,
                  'text-white': !isLight,
                })}>
                  {title}
                </h2>
                {tagline && (
                  <span className={cn('text-xs font-semibold uppercase tracking-wider mt-2 block', {
                    'text-black/70': isLight,
                    'text-white/70': !isLight
                  })}>
                    {tagline}
                  </span>
                )}
              </div>
              <p className={cn('text-lg', {
                'text-black/70': isLight,
                'text-white/70': !isLight
              })}>
                {description}
              </p>
            </div>

            <DecorativeBlocks
              colors={decorativeColors}
              initialPlacement="bottom-right"
            >
              <div className="relative">
                <Terminal
                  name="Terminal"
                  colorMode={ColorMode.Dark}
                  prompt="> "
                  showWindowButtons={true}
                >
                  {codeSample.map((line, i) => (
                    <TerminalOutput key={i}>{line}</TerminalOutput>
                  ))}
                </Terminal>
              </div>
            </DecorativeBlocks>
          </>
        )}
      </div>
    </Section>
  )
}
