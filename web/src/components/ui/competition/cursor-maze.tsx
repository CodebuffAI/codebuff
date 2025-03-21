'use client'

import { motion, useAnimation } from 'framer-motion'
import { useEffect, useState, useRef } from 'react'

interface Point {
  x: number
  y: number
  time: number
}

interface CommandLog {
  time: number
  command: string
  response?: string
  emotion?: string
}

interface TrailPoint {
  x: number
  y: number
  timestamp: number
}

const TOTAL_TIME = 20000
const BASE_Y = 150
const DEAD_END_OFFSET = 50
const ZIGZAG_OFFSET = 30

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
  { time: 9000, command: 'cmd + L "show all controllers"', emotion: '😩' },
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
  const controls = useAnimation()
  const [visibleLogs, setVisibleLogs] = useState<CommandLog[]>([])
  const [currentTime, setCurrentTime] = useState(0)
  const [currentEmotion, setCurrentEmotion] = useState('👨‍💻')
  const [currentPathIndex, setCurrentPathIndex] = useState(1)
  const [trailPoints, setTrailPoints] = useState<TrailPoint[]>([])
  const [currentPosition, setCurrentPosition] = useState({
    x: 0,
    y: BASE_Y,
  })
  const logContainerRef = useRef<HTMLDivElement>(null)

  const path = [
    { x: 0, y: BASE_Y, time: 0 },
    { x: 50, y: BASE_Y - DEAD_END_OFFSET, time: 1000 },
    { x: 50, y: BASE_Y + DEAD_END_OFFSET, time: 2000 },
    { x: 30, y: BASE_Y, time: 3000 },
    { x: 100, y: BASE_Y + ZIGZAG_OFFSET, time: 4000 },
    { x: 120, y: BASE_Y - ZIGZAG_OFFSET, time: 5000 },
    { x: 140, y: BASE_Y + ZIGZAG_OFFSET, time: 6000 },
    { x: 160, y: BASE_Y - ZIGZAG_OFFSET, time: 7000 },
    { x: 180, y: BASE_Y, time: 8000 },
    { x: 180, y: BASE_Y - DEAD_END_OFFSET * 1.5, time: 9000 },
    { x: 160, y: BASE_Y - DEAD_END_OFFSET * 1.2, time: 10000 },
    { x: 140, y: BASE_Y - DEAD_END_OFFSET * 0.8, time: 11000 },
    { x: 120, y: BASE_Y - DEAD_END_OFFSET * 0.4, time: 12000 },
    { x: 100, y: BASE_Y, time: 13000 },
    { x: 150, y: BASE_Y + DEAD_END_OFFSET, time: 14000 },
    { x: 200, y: BASE_Y + DEAD_END_OFFSET * 1.2, time: 15000 },
    { x: 180, y: BASE_Y, time: 16000 },
    { x: 220, y: BASE_Y - ZIGZAG_OFFSET / 2, time: 17000 },
    { x: 240, y: BASE_Y + ZIGZAG_OFFSET / 2, time: 18000 },
    { x: 250, y: BASE_Y, time: 19000 },
    { x: 250, y: BASE_Y + DEAD_END_OFFSET / 3, time: 20000 },
  ]

  const getCurrentPath = () => {
    return `M ${path
      .slice(0, currentPathIndex)
      .map((p) => `${p.x} ${p.y}`)
      .join(' L ')}`
  }

  useEffect(() => {
    const newLogs = commandLogs.filter((log) => log.time <= currentTime)
    setVisibleLogs(newLogs)

    const latestEmotion = newLogs.findLast((log) => log.emotion)?.emotion
    if (latestEmotion) {
      setCurrentEmotion(latestEmotion)
    }
  }, [currentTime])

  useEffect(() => {
    const animate = async () => {
      for (let i = 0; i < path.length - 1; i++) {
        const current = path[i]
        const next = path[i + 1]

        await controls.start({
          x: next.x - 24,
          y: next.y - 24,
          transition: {
            duration: (next.time - current.time) / 1000,
            ease: 'easeInOut',
          },
          onUpdate: (latest) => {
            setCurrentPosition(latest as { x: number; y: number })
          },
        })

        setCurrentTime(next.time)
        setCurrentPathIndex(i + 2)
      }
    }

    animate()
  }, [controls])

  useEffect(() => {
    const interval = setInterval(() => {
      setTrailPoints((prevPoints) => {
        const now = Date.now()
        const recentPoints = prevPoints.filter((p) => now - p.timestamp < 1000)

        return [
          ...recentPoints,
          {
            ...currentPosition,
            timestamp: now,
          },
        ]
      })
    }, 50)

    return () => clearInterval(interval)
  }, [currentPosition])

  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight
    }
  }, [visibleLogs])

  return (
    <div className="relative w-[700px] h-[300px] flex gap-8">
      <div className="relative w-[300px] h-[300px]">
        <svg className="absolute inset-0" width="300" height="300">
          <path
            d={getCurrentPath()}
            fill="none"
            stroke="rgba(0,0,0,0.3)"
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray="2 4"
          />
          <path
            d={getCurrentPath()}
            fill="none"
            stroke="rgba(255,255,255,0.1)"
            strokeWidth="2"
            strokeLinecap="round"
          />

          {trailPoints.length >= 2 && (
            <>
              <path
                d={`M ${trailPoints.map((p) => `${p.x} ${p.y}`).join(' L ')}`}
                fill="none"
                stroke="rgba(255, 0, 0, 0.2)"
                strokeWidth="8"
                strokeLinecap="round"
                filter="url(#glow)"
              />
              <path
                d={`M ${trailPoints.map((p) => `${p.x} ${p.y}`).join(' L ')}`}
                fill="none"
                stroke="rgba(255, 0, 0, 0.4)"
                strokeWidth="3"
                strokeLinecap="round"
              />
            </>
          )}

          <defs>
            <filter id="glow">
              <feGaussianBlur stdDeviation="2" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
        </svg>

        <motion.div
          className="absolute w-12 h-12 flex items-center justify-center"
          initial={{ x: path[0].x - 24, y: path[0].y - 24 }}
          animate={controls}
        >
          <motion.div
            className="text-3xl"
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
        </motion.div>
      </div>

      <div className="flex-1 h-full bg-black rounded-lg p-4 overflow-hidden">
        <div
          ref={logContainerRef}
          className="h-full overflow-y-auto space-y-2 font-mono text-sm"
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
      </div>
    </div>
  )
}
