import { motion } from 'framer-motion'
import { Code } from 'lucide-react'
import { DemoCodeDisplay } from '@/components/ui/landing/demo-code-display'

interface CodeIllustrationProps {
  codeSample: string[]
  isLight: boolean
  className?: string
}

export function CodeIllustration({
  codeSample,
  isLight,
  className,
}: CodeIllustrationProps) {
  return (
    <div className={className}>
      <DemoCodeDisplay
        lines={codeSample}
        variant={isLight ? 'light' : 'default'}
        className="shadow-xl"
      />
    </div>
  )
}
