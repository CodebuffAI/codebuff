import { motion } from 'framer-motion'
import Terminal, { ColorMode } from '@/components/ui/terminal'
import TerminalOutput from '@/components/ui/terminal/terminal-output'
import { ANIMATION } from './constants'

interface DemoCodeDisplayProps {
  lines: string[]
  variant?: 'default' | 'light'
  className?: string
}

export function DemoCodeDisplay({
  lines,
  variant = 'default',
  className,
}: DemoCodeDisplayProps) {
  return (
    <div className={className}>
      <Terminal
        name="Terminal"
        colorMode={variant === 'light' ? ColorMode.Light : ColorMode.Dark}
        prompt="> "
        showWindowButtons={true}
      >
        {lines.map((line, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -10 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{
              duration: ANIMATION.fadeIn.duration,
              delay: i * 0.1,
            }}
          >
            <TerminalOutput>
              {line.startsWith('>') || line.includes('•') ? (
                <span className="text-green-400">{line}</span>
              ) : (
                line
              )}
            </TerminalOutput>
          </motion.div>
        ))}
      </Terminal>
    </div>
  )
}