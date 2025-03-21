'use client'

import { useState, useEffect } from 'react'
import { BlockColor } from './decorative-blocks'
import { HeroButtons } from './hero-buttons'
import { Section } from './section'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

// Typing effect component for hero headline
function TypingEffect({ words }: { words: string[] }) {
  const [currentWordIndex, setCurrentWordIndex] = useState(0)
  const [currentText, setCurrentText] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)
  
  useEffect(() => {
    const typeSpeed = isDeleting ? 50 : 100
    
    const timer = setTimeout(() => {
      const currentWord = words[currentWordIndex]
      
      if (!isDeleting) {
        // Typing effect
        setCurrentText(currentWord.substring(0, currentText.length + 1))
        
        // If fully typed, start deleting after a delay
        if (currentText === currentWord) {
          setTimeout(() => {
            setIsDeleting(true)
          }, 2000) // Wait time when word is complete
        }
      } else {
        // Deleting effect
        setCurrentText(currentWord.substring(0, currentText.length - 1))
        
        // If fully deleted, move to next word
        if (currentText === '') {
          setIsDeleting(false)
          setCurrentWordIndex((currentWordIndex + 1) % words.length)
        }
      }
    }, typeSpeed)
    
    return () => clearTimeout(timer)
  }, [currentText, currentWordIndex, isDeleting, words])
  
  return (
    <span className="text-green-400 relative">
      {currentText}
      <motion.span 
        className="absolute -right-[3px] top-0 h-full w-1 bg-green-500"
        animate={{ opacity: [1, 0] }}
        transition={{ duration: 0.8, repeat: Infinity }}
      />
    </span>
  )
}

export function Hero() {
  const typingWords = ["4x Faster", "Lower CPU", "Smarter", "Anywhere"]
  
  return (
    <Section hero>
      <div className="relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7 }}
        >
          <motion.h1 
            className="hero-heading text-center mb-8 text-white text-balance"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ 
              duration: 0.8, 
              ease: [0.165, 0.84, 0.44, 1]
            }}
          >
            <motion.span 
              className="relative inline-block"
              initial={{ y: 20 }}
              animate={{ y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
            >
              <span className="relative z-10">Revolutionize</span>
              <motion.span 
                className="absolute -bottom-2 left-0 h-3 w-full bg-green-500/20 rounded-sm"
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ duration: 0.5, delay: 0.4 }}
              />
            </motion.span>{' '}
            Your{' '}
            <motion.span 
              className="relative inline-block"
              initial={{ y: 20 }}
              animate={{ y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              <span className="relative z-10">Codeflow</span>
              <motion.span 
                className="absolute -bottom-2 left-0 h-3 w-full bg-green-500/20 rounded-sm"
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ duration: 0.5, delay: 0.5 }}
              />
            </motion.span>
          </motion.h1>
        </motion.div>

        <motion.h2 
          className="hero-subtext text-center mx-auto max-w-xl mb-6"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
        >
          <TypingEffect words={typingWords} /> AI programming that 
          works where you work and knows your entire stack.
        </motion.h2>
        
        <motion.p 
          className="text-white/70 text-center max-w-2xl mx-auto mb-14 text-balance"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.4 }}
        >
          Transform your coding experience with Codebuff - the smartest AI partner that 
          operates in your terminal or favorite IDE. 
          <span className="hidden md:inline"> Get 4x faster results, with lower CPU usage, at half the cost.</span>
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.5 }}
        >
          <HeroButtons />
        </motion.div>
        
        {/* Key features badges */}
        <motion.div 
          className="flex flex-wrap justify-center gap-3 mt-10"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.6 }}
        >
          {[
            { icon: "⚡", text: "4x Faster" },
            { icon: "💻", text: "Lower CPU Usage" },
            { icon: "🔮", text: "Full Context Awareness" },
            { icon: "🌍", text: "Works Anywhere" }
          ].map((feature, index) => (
            <motion.div 
              key={index}
              className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-full px-3 py-1 text-white/90 text-sm flex items-center"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: 0.6 + (index * 0.1) }}
              whileHover={{ 
                scale: 1.05, 
                backgroundColor: "rgba(255, 255, 255, 0.1)",
                transition: { duration: 0.2 } 
              }}
            >
              <span className="mr-1">{feature.icon}</span> {feature.text}
            </motion.div>
          ))}
        </motion.div>
      </div>
      
      {/* Decorative gradient */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[30%] left-1/2 -translate-x-1/2 w-full aspect-square bg-gradient-to-b from-green-500/20 to-transparent rounded-full blur-3xl opacity-30" />
      </div>
    </Section>
  )
}
