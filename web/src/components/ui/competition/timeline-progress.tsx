'use client'

import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { useIsMobile } from '@/hooks/use-mobile'

export interface TimelineEvent {
  timestamp: number
  type: 'error' | 'success' | 'retry'
  emotion: 'confused' | 'frustrated' | 'confident'
  label?: string // Optional label for the event
}

interface TimelineProgressProps {
  progress: number
  events?: TimelineEvent[]
  className?: string
}

export function TimelineProgress({ progress, events = [], className }: TimelineProgressProps) {
  const isMobile = useIsMobile()
  
  // Calculate the timeframe based on the last event
  const maxTimestamp = Math.max(...events.map(e => e.timestamp), 20000)

  return (
    <div className={cn('relative', className)}>
      {/* Progress label */}
      <div className="flex justify-between text-xs text-white/40 mb-1 font-mono">
        <div>0:00</div>
        <div>{(maxTimestamp / 1000).toFixed(0)}:00</div>
      </div>
      
      {/* Main timeline bar */}
      <div className="relative h-3 bg-white/5 rounded-full overflow-hidden">
        <motion.div
          className="absolute h-full bg-gradient-to-r from-blue-600 to-green-400"
          style={{ width: `${progress}%` }}
          initial={{ width: '0%' }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.5 }}
        />
      </div>

      {/* Event markers with enhanced visualization */}
      {events.map((event, index) => (
        <motion.div
          key={index}
          className={cn(
            'absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 border-black/50',
            {
              'bg-red-400': event.type === 'error',
              'bg-yellow-400': event.type === 'retry',
              'bg-green-400': event.type === 'success'
            }
          )}
          style={{ 
            left: `${(event.timestamp / maxTimestamp) * 100}%`,
            marginTop: isMobile ? '0px' : '1px'
          }}
          initial={{ scale: 0, opacity: 0 }}
          animate={{ 
            scale: progress >= (event.timestamp / maxTimestamp) * 100 ? 1 : 0.5,
            opacity: progress >= (event.timestamp / maxTimestamp) * 100 ? 1 : 0.3,
            boxShadow: progress >= (event.timestamp / maxTimestamp) * 100 && event.type === 'error' ? 
              '0 0 8px rgba(248, 113, 113, 0.6)' : 
              progress >= (event.timestamp / maxTimestamp) * 100 && event.type === 'retry' ? 
              '0 0 8px rgba(251, 191, 36, 0.6)' : 
              '0 0 0px transparent'
          }}
          transition={{ duration: 0.3 }}
        >
          {/* Emotion indicators with labels */}
          <motion.div
            className="absolute -top-6 left-1/2 -translate-x-1/2 text-sm"
            variants={{
              confused: { rotate: [0, -5, 5, -5, 0] },
              frustrated: { y: [0, -2, 0] },
              confident: { scale: [1, 1.1, 1] }
            }}
            animate={
              progress >= (event.timestamp / maxTimestamp) * 100 
                ? event.emotion
                : undefined
            }
            transition={{ repeat: Infinity, duration: 1.5 }}
          >
            {event.emotion === 'confused' && '🤔'}
            {event.emotion === 'frustrated' && '😤'}
            {event.emotion === 'confident' && '✓'}
          </motion.div>
          
          {/* Event label if provided */}
          {event.label && progress >= (event.timestamp / maxTimestamp) * 100 && (
            <motion.div 
              className={cn(
                "absolute -bottom-6 left-1/2 -translate-x-1/2 text-xs px-1.5 py-0.5 rounded whitespace-nowrap max-w-[120px] overflow-hidden text-ellipsis",
                event.type === 'error' ? "bg-red-950/70 text-red-400" :
                event.type === 'retry' ? "bg-yellow-950/70 text-yellow-400" :
                "bg-green-950/70 text-green-400"
              )}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              {event.label}
            </motion.div>
          )}
        </motion.div>
      ))}
      
      {/* Current position marker */}
      <motion.div
        className="absolute top-0 h-3 w-2 bg-white rounded-full shadow-glow"
        style={{ 
          left: `${progress}%`,
          marginLeft: '-1px',
          boxShadow: '0 0 5px rgba(255, 255, 255, 0.7)'
        }}
        animate={{ y: [0, -1, 0] }}
        transition={{ repeat: Infinity, duration: 1 }}
      />
      
      {/* Time markers */}
      {!isMobile && Array.from({ length: 5 }).map((_, i) => (
        <div 
          key={i}
          className="absolute top-1.5 h-1.5 w-0.5 bg-white/20"
          style={{ left: `${i * 25}%` }}
        />
      ))}
    </div>
  )
}