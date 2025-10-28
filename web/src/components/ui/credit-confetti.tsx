import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'

interface CreditParticle {
  id: number
  x: number
  delay: number
  color: string
  content: string
  size: number
  rotation: number
}

// CLI and coding themed symbols
const symbols = [
  '$ ', // CLI prompt
  '> ', // Another CLI prompt
  '✨', // Sparkles for magic
  '🚀', // Rocket for speed
  '💻', // Computer
  '⚡️', // Lightning for power
  '🤖', // Robot for AI
  '🔧', // Tool
  '{}', // Code braces
  '()', // Parentheses
  '[]', // Brackets
  '</>', // Code tags
  '#!/', // Shebang
]

// Brand-aligned colors
const colors = [
  'text-green-400', // Matrix green
  'text-green-500',
  'text-emerald-400',
  'text-emerald-500',
  'text-primary',
  'text-blue-400', // For variety
]

export function CreditConfetti({ amount }: { amount: number }) {
  const [particles, setParticles] = useState<CreditParticle[]>([])

  useEffect(() => {
    // Create 15-30 particles based on amount
    const particleCount = Math.min(30, Math.max(15, Math.floor(amount / 500)))
    const creditsPerParticle = Math.ceil(amount / particleCount)

    const newParticles = Array.from({ length: particleCount }, (_, i) => ({
      id: i,
      x: Math.random() * 100, // Random x position across screen
      delay: Math.random() * 0.8, // Longer stagger for more natural feel
      color: colors[Math.floor(Math.random() * colors.length)],
      content:
        i % 3 === 0
          ? `+${creditsPerParticle}`
          : symbols[Math.floor(Math.random() * symbols.length)],
      size: Math.random() * 16 + 16, // Random size between 16-32px
      rotation: Math.random() * 360, // Random initial rotation
    }))
    setParticles(newParticles)
  }, [amount])

  return (
    <div className="fixed inset-0 pointer-events-none z-50">
      {particles.map((particle) => (
        <motion.div
          key={particle.id}
          className={`absolute font-mono font-bold ${particle.color}`}
          style={{ fontSize: particle.size }}
          initial={{
            y: -20,
            x: `${particle.x}vw`,
            scale: 0,
            opacity: 0,
            rotate: particle.rotation,
          }}
          animate={{
            y: '120vh',
            scale: [0, 1, 1, 0.5],
            opacity: [0, 1, 1, 0],
            rotate: particle.rotation + 360 * 2, // Two full rotations
          }}
          transition={{
            duration: 2.5,
            delay: particle.delay,
            ease: [0.23, 0.49, 0.22, 0.94],
          }}
          onAnimationComplete={() => {
            setParticles((current) =>
              current.filter((p) => p.id !== particle.id),
            )
          }}
        >
          {particle.content}
        </motion.div>
      ))}
    </div>
  )
}
