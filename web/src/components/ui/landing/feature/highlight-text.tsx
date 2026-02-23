import { motion } from 'framer-motion'

import { cn } from '@/lib/utils'

interface HighlightTextProps {
  text: string
  isLight?: boolean
  icon?: string
}

export function HighlightText({ text, isLight, icon = '⚡' }: HighlightTextProps) {
  return (
    <motion.div
      className={cn(
        'p-4 rounded-lg mt-4 font-semibold flex items-center',
        'bg-muted border border-border',
        isLight
          ? 'dark:bg-black/10 dark:border-black/20'
          : 'dark:bg-white/5 dark:border-white/20',
      )}
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.4, delay: 0.5 }}
    >
      <div className="mr-3 text-xl text-green-500">{icon}</div>
      <div className="opacity-80">{text}</div>
    </motion.div>
  )
}
