import { motion } from 'framer-motion'

import { cn } from '@/lib/utils'

interface HighlightTextProps {
  text: string
  isLight?: boolean
}

export function HighlightText({ text, isLight }: HighlightTextProps) {
  return (
    <motion.div
      className={cn(
        'p-4 rounded-lg mt-4 font-semibold flex items-center',
        isLight
          ? 'bg-black/10 border border-black/20'
          : 'bg-white/5 border border-white/20',
      )}
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.4, delay: 0.5 }}
    >
      <div className="mr-3 text-xl text-green-400">⚡</div>
      <div className="opacity-80">{text}</div>
    </motion.div>
  )
}
