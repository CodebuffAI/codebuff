import { useState, useEffect, useRef } from 'react'
import { GitCompare } from 'lucide-react'
import { cn } from '@/lib/utils'
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
  isLight: boolean
}

export function BrowserComparison({
  comparisonData,
  isLight,
}: BrowserComparisonProps) {
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
    <div
      className={cn(
        'rounded-lg overflow-hidden shadow-xl p-4',
        isLight ? 'bg-white border border-black/10' : ''
      )}
    >
      <div className="mb-3">
        <Terminal
          name="Terminal"
          colorMode={ColorMode.Light}
          prompt="> "
          showWindowButtons={true}
        >
          <TerminalOutput>
            <span className="text-green-400">/projects/weather-app {'>'} </span>
            codebuff
          </TerminalOutput>
          <TerminalOutput className="text-gray-500">
            Welcome to Codebuff! How can I help you today?
          </TerminalOutput>
          <TerminalOutput>
            <span className="text-green-400">{'>'} </span>
            <span className="text-black">
              Add an API route on my Flask app to call the OpenWeatherMap API
              and then call it from the web app.
            </span>
          </TerminalOutput>
          <TerminalOutput className="text-gray-500">
            Working on it! Analyzing your codebase...
          </TerminalOutput>
        </Terminal>
      </div>

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
          className="absolute top-0 bottom-0 w-1 bg-green-500 z-30 cursor-grab"
          style={{
            left: `${sliderPosition}%`,
            transition: 'left 0.3s ease-out',
          }}
        >
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-green-500 flex items-center justify-center text-white">
            <GitCompare size={16} />
          </div>
        </div>
      </div>
    </div>
  )
}