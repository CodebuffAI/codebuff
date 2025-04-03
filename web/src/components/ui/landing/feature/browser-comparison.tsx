import { useState, useEffect, useRef } from 'react'
import { GitCompare } from 'lucide-react'
import Terminal, { ColorMode } from '@/components/ui/terminal'
import TerminalOutput from '@/components/ui/terminal/terminal-output'
import BrowserPreview from '@/components/BrowserPreview'

interface BrowserComparisonProps {
  comparisonData: {
    beforeUrl?: string
    afterUrl?: string
    beforeTitle?: string
    afterTitle?: string
    transitionDuration?: number
  }
}

export function BrowserComparison({ comparisonData }: BrowserComparisonProps) {
  const [sliderPosition, setSliderPosition] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const transitionDuration = comparisonData.transitionDuration || 3000

  useEffect(() => {
    const animateSlider = () => {
      const interval = setInterval(() => {
        setSliderPosition((prev) => {
          if (prev >= 100) return 0
          return prev + 1
        })
      }, transitionDuration / 100)

      return () => clearInterval(interval)
    }

    const animation = animateSlider()
    return () => animation()
  }, [transitionDuration])

  return (
    <div className="rounded-lg overflow-hidden shadow-xl p-0">
      <div
        className="relative h-[400px] overflow-hidden rounded-lg"
        ref={containerRef}
      >
        {/* Before browser */}
        <div className="absolute inset-0 z-10">
          <BrowserPreview
            className="h-full w-full"
            variant="before"
            url={comparisonData.beforeUrl || 'http://example.com/before'}
          />
        </div>

        {/* After browser */}
        <div
          className="absolute inset-0 z-20"
          style={{
            clipPath: `polygon(${sliderPosition}% 0, 100% 0, 100% 100%, ${sliderPosition}% 100%)`,
            transition: 'clip-path 0.3s ease-out',
          }}
        >
          <BrowserPreview
            className="h-full w-full"
            variant="after"
            url={comparisonData.afterUrl || 'http://example.com/after'}
          />
        </div>

        {/* Slider handle */}
        <div
          className="absolute top-0 bottom-0 w-1 bg-blue-500 z-30 cursor-grab"
          style={{
            left: `${sliderPosition}%`,
            transition: 'left 0.3s ease-out',
          }}
        >
          {/* Before/After labels at the bottom of the line */}
          <div className="absolute bottom-4 -left-14 bg-blue-600 text-white px-2 py-1 rounded-l-md text-xs font-semibold">
            Before
          </div>
          <div className="absolute bottom-4 left-2 bg-blue-600 text-white px-2 py-1 rounded-r-md text-xs font-semibold">
            After
          </div>
        </div>
      </div>
    </div>
  )
}
