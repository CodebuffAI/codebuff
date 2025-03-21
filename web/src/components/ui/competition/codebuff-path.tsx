'use client'

import { motion, useAnimation } from 'framer-motion'
import { useEffect, useState } from 'react'

interface Point {
  x: number
  y: number
}

const TOTAL_TIME = 5000 // 5 seconds for the direct path
const BASE_Y = 150

export function CodebuffPath() {
  const controls = useAnimation()
  const [progress, setProgress] = useState(0)
  
  // Define the direct path
  const path = [
    { x: 0, y: BASE_Y, time: 0 },
    { x: 125, y: BASE_Y, time: 2000 },
    { x: 250, y: BASE_Y, time: 5000 }
  ]

  // Animate along the path
  useEffect(() => {
    const animate = async () => {
      for (let i = 0; i < path.length - 1; i++) {
        const current = path[i]
        const next = path[i + 1]
        
        await controls.start({
          x: next.x,
          y: next.y,
          transition: {
            duration: (next.time - current.time) / 1000,
            ease: "linear"
          }
        })
        
        setProgress(next.time / TOTAL_TIME * 100)
      }
    }
    
    animate()
  }, [controls])

  return (
    <div className="relative w-[300px] h-[300px]">
      {/* Path visualization */}
      <svg className="absolute inset-0" width="300" height="300">
        <path
          d={`M ${path.map(p => `${p.x} ${p.y}`).join(' L ')}`}
          fill="none"
          stroke="rgba(255,255,255,0.1)"
          strokeWidth="2"
        />
      </svg>

      {/* Success sparkles */}
      <motion.div
        className="absolute right-12 top-1/2 -translate-y-1/2"
        animate={{
          scale: [1, 1.2, 1],
          opacity: [0.5, 1, 0.5]
        }}
        transition={{
          repeat: Infinity,
          duration: 2
        }}
      >
        ✨
      </motion.div>

      {/* Codebuff avatar */}
      <motion.div
        className="absolute w-4 h-4 bg-green-400 rounded-full"
        initial={{ x: path[0].x, y: path[0].y }}
        animate={controls}
      >
        {/* Confidence indicator */}
        <motion.div
          className="absolute -top-6 text-green-400"
          animate={{
            y: [-2, 0, -2]
          }}
          transition={{
            repeat: Infinity,
            duration: 1.5
          }}
        >
          ✓
        </motion.div>
      </motion.div>

      {/* Progress bar */}
      <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/10 rounded-full overflow-hidden">
        <motion.div
          className="h-full bg-green-400"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  )
}