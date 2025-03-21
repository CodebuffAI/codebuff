'use client'

import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

interface TimelineEvent {
  timestamp: number
  type: 'error' | 'success' | 'retry'
  emotion: 'confused' | 'frustrated' | 'confident'
}

interface TimelineProgressProps {
  progress: number
  events?: TimelineEvent[]
  className?: string
}

export function TimelineProgress({ progress, events = [], className }: TimelineProgressProps) {
  return (
    <div className={cn('relative', className)}>
      {/* Main timeline bar */}
      <div className="relative h-2 bg-white/5 rounded-full overflow-hidden">
        <motion.div
          className="absolute h-full bg-gradient-to-r from-red-400 to-green-400"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Event markers */}
      {events.map((event, index) => (
        <motion.div
          key={index}
          className={cn(
            'absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full',
            {
              'bg-red-400': event.type === 'error',
              'bg-yellow-400': event.type === 'retry',
              'bg-green-400': event.type === 'success'
            }
          )}
          style={{ left: `${(event.timestamp / 20000) * 100}%` }}
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: event.timestamp / 1000 }}
        >
          {/* Emotion indicators */}
          <motion.div
            className="absolute -top-6 left-1/2 -translate-x-1/2 text-sm"
            animate={event.emotion}
            variants={{
              confused: { rotate: [0, -5, 5, -5, 0] },
              frustrated: { y: [0, -2, 0] },
              confident: { scale: [1, 1.1, 1] }
            }}
          >
            {event.emotion === 'confused' && '?'}
            {event.emotion === 'frustrated' && '😤'}
            {event.emotion === 'confident' && '✓'}
          </motion.div>
        </motion.div>
      ))}
    </div>
  )
}