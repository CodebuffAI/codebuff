import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

interface HighlightTextProps {
  text: string
  isLight: boolean
}

export function HighlightText({ text, isLight }: HighlightTextProps) {
  return (
    <motion.div
      className={cn(
        'p-4 rounded-lg mt-4 text-base font-medium flex items-center',
        {
          'bg-black/10 border border-black/20 text-black/80': isLight,
          'bg-white/5 border border-white/20 text-white/80': !isLight,
        }
      )}
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.4, delay: 0.5 }}
    >
      <div
        className={cn('mr-3 text-xl', {
          'text-black': isLight,
          'text-green-400': !isLight,
        })}
      >
        ⚡
      </div>
      <div>{text}</div>
    </motion.div>
  )
}