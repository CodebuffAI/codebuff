'use client'

import { motion } from 'framer-motion'
import { useEffect, useState, useRef } from 'react'

interface CommandLog {
  time: number
  command: string
  response?: string
  emotion?: string
}

const TOTAL_TIME = 20000 // 20 seconds for the maze path
const BASE_Y = 150

const commandLogs: CommandLog[] = [
  { time: 1000, command: 'cmd + L "change the auth endpoint"', emotion: '👨‍💻' },
  {
    time: 2000,
    response: 'I see several endpoints. Which specific one?',
    emotion: '🤔',
  },
  { time: 3000, command: '@codebase show me auth endpoints', emotion: '👨‍💻' },
  {
    time: 4000,
    response: 'Here are the auth endpoints I found...',
    emotion: '🧐',
  },
  { time: 5000, command: 'cmd + L "the one in AuthController"', emotion: '😕' },
  {
    time: 6000,
    response: "I don't see AuthController. Did you mean UserController?",
    emotion: '😣',
  },
  { time: 7000, command: '@search AuthController', emotion: '😤' },
  {
    time: 8000,
    response: 'No results found for "AuthController"',
    emotion: '😫',
  },
  { time: 9000, command: 'cmd + L "show all controllers"', emotion: '😭' },
  {
    time: 10000,
    response: 'Here are all controllers in the project...',
    emotion: '🤦‍♂️',
  },
  { time: 11000, command: '@file src/controllers/auth.ts', emotion: '😤' },
  {
    time: 12000,
    response: 'File not found. Similar files: src/auth/controller.ts',
    emotion: '😡',
  },
  { time: 13000, command: '@open src/auth/controller.ts', emotion: '😠' },
  { time: 14000, command: 'cmd + L "now change the endpoint"', emotion: '🤬' },
  {
    time: 15000,
    response: "Here's a suggestion to modify the endpoint...",
    emotion: '😫',
  },
  { time: 16000, command: '/revert', emotion: '😖' },
  {
    time: 17000,
    command: 'cmd + L "let\'s try a different approach"',
    emotion: '😩',
  },
  {
    time: 18000,
    response: 'Would you like me to suggest alternative approaches?',
    emotion: '😤',
  },
  { time: 19000, command: '@quit', emotion: '😑' },
]

export function CursorMaze() {
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
    <div className="relative w-[700px] h-full flex gap-8">
      <div className="flex-1 h-full bg-black rounded-lg p-4 overflow-hidden">
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
                  <div className="text-amber-400 flex items-center gap-2">
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
    </div>
  )
}
