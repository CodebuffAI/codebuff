import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'

interface CreditParticle {
  id: number
  x: number
  delay: number
}

export function CreditConfetti({ amount }: { amount: number }) {
  const [particles, setParticles] = useState<CreditParticle[]>([])

  useEffect(() => {
    // Create 10-20 particles based on amount
    const count = Math.min(20, Math.max(10, Math.floor(amount / 1000)))
    const newParticles = Array.from({ length: count }, (_, i) => ({
      id: i,
      x: Math.random() * 100, // Random x position across screen
      delay: Math.random() * 0.5, // Stagger the start
    }))
    setParticles(newParticles)
  }, [amount])

  return (
    <div className="fixed inset-0 pointer-events-none z-50">
      {particles.map((particle) => (
        <motion.div
          key={particle.id}
          className="absolute text-primary font-bold"
          initial={{ 
            y: -20, 
            x: `${particle.x}vw`,
            scale: 0,
            opacity: 0 
          }}
          animate={{ 
            y: '120vh',
            scale: 1,
            opacity: [0, 1, 1, 0]
          }}
          transition={{ 
            duration: 2,
            delay: particle.delay,
            ease: [0.23, 0.49, 0.22, 0.94]
          }}
          onAnimationComplete={() => {
            // Remove particle when animation is done
            setParticles(current => 
              current.filter(p => p.id !== particle.id)
            )
          }}
        >
          +1
        </motion.div>
      ))}
    </div>
  )
}