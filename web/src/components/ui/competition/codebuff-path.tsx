'use client'

import { motion } from 'framer-motion'
import { useEffect, useState, useRef } from 'react'

interface CommandLog {
  time: number
  command: string
  response?: string
  emotion?: string
}

const TOTAL_TIME = 5000 // 5 seconds for the direct path

const commandLogs: CommandLog[] = [
  { time: 0, command: 'cmd + L "change the auth endpoint"', emotion: '👨‍💻' },
  {
    time: 1000,
    response: 'Found auth endpoint in src/auth/controller.ts',
    emotion: '🔍',
  },
  {
    time: 2000,
    command: '@edit src/auth/controller.ts',
    emotion: '✍️',
  },
  {
    time: 3000,
    response: 'Updated endpoint successfully',
    emotion: '✅',
  },
  {
    time: 4000,
    command: '@test auth',
    emotion: '🧪',
  },
  {
    time: 5000,
    response: 'All tests passing',
    emotion: '🎉',
  },
]

export function CodebuffPath() {
  const [visibleLogs, setVisibleLogs] = useState<CommandLog[]>([])
  const [currentTime, setCurrentTime] = useState(0)
  const [currentEmotion, setCurrentEmotion] = useState('👨‍💻')
  const logContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const newLogs = commandLogs.filter((log) => log.time <= currentTime)
    setVisibleLogs(newLogs)

    const latestEmotion = newLogs.findLast((log) => log.emotion)?.emotion
    if (latestEmotion) {
      setCurrentEmotion(latestEmotion)
    }
  }, [currentTime])

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime((time) => {
        if (time >= TOTAL_TIME) {
          clearInterval(timer)
          return time
        }
        return time + 1000
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight
    }
  }, [visibleLogs])

  return (
    <div className="h-[300px] bg-black rounded-lg overflow-hidden">
      <div className="h-full flex flex-col">
        <div
          ref={logContainerRef}
          className="flex-1 overflow-y-auto space-y-2 font-mono text-sm min-h-0"
        >
          {visibleLogs.map((log, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="font-mono"
            >
              {log.command ? (
                <div className="text-green-400 flex items-center gap-2">
                  <span className="opacity-50">$</span>
                  {log.command}
                </div>
              ) : log.response ? (
                <div className="text-zinc-400 pl-4 border-l border-zinc-800 flex items-center gap-2">
                  {log.response}
                </div>
              ) : null}
            </motion.div>
          ))}
        </div>

        <motion.div
          className="text-3xl mt-4 text-center flex-shrink-0"
          animate={{
            scale: [1, 1.2, 1],
          }}
          transition={{
            repeat: Infinity,
            duration: 1.5,
          }}
        >
          {currentEmotion}
        </motion.div>
      </div>
    </div>
  )
}
