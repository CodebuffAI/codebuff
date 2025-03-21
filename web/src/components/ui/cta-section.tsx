'use client'

import Link from 'next/link'
import { BlockColor } from './decorative-blocks'
import { HeroButtons } from './hero-buttons'
import { useState } from 'react'
import { Section } from './section'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

// Benefit card component for the CTA section
function BenefitCard({ 
  title, 
  description, 
  icon, 
  index 
}: { 
  title: string; 
  description: string; 
  icon: string; 
  index: number;
}) {
  return (
    <motion.div 
      className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-4 flex gap-3 items-start"
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: index * 0.1 }}
      viewport={{ once: true }}
    >
      <div className="text-2xl mt-1">{icon}</div>
      <div>
        <h3 className="text-white font-medium text-lg">{title}</h3>
        <p className="text-white/70 text-sm">{description}</p>
      </div>
    </motion.div>
  );
}

export function CTASection() {
  const [isHovered, setIsHovered] = useState(false)

  const decorativeColors = isHovered
    ? [BlockColor.AcidMatrix, BlockColor.GenerativeGreen, BlockColor.CRTAmber]
    : [
        BlockColor.TerminalYellow,
        BlockColor.CRTAmber,
        BlockColor.DarkForestGreen,
      ]

  // Benefits data
  const benefits = [
    {
      icon: "⚡", 
      title: "Lightning Fast", 
      description: "Start using Codebuff in under 30 seconds with a simple install"
    },
    {
      icon: "🔒", 
      title: "No Card Required", 
      description: "Free tier available with no credit card or complicated signup"
    },
    {
      icon: "🛠️", 
      title: "Use Anywhere", 
      description: "Works in any terminal or development environment"
    }
  ];

  return (
    <Section background="black">
      <div className="max-w-4xl mx-auto relative">
        <motion.div 
          className="text-center mb-12"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <motion.h2 
            className="text-4xl md:text-5xl font-medium mb-4 text-white relative inline-block font-serif"
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5 }}
            viewport={{ once: true }}
          >
            Start Buffing Your Code Today
            <motion.span 
              className="absolute -bottom-2 left-0 w-full h-1 bg-gradient-to-r from-green-400 to-blue-500"
              initial={{ scaleX: 0 }}
              whileInView={{ scaleX: 1 }}
              transition={{ duration: 0.5, delay: 0.3 }}
              viewport={{ once: true }}
            />
          </motion.h2>
          
          <motion.p 
            className="text-lg text-white/80 max-w-2xl mx-auto"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            viewport={{ once: true }}
          >
            Get started in seconds with no credit card required. Join thousands of developers 
            saving time with Codebuff's intelligent coding assistant.
          </motion.p>
        </motion.div>

        {/* Benefits grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10">
          {benefits.map((benefit, index) => (
            <BenefitCard
              key={index}
              icon={benefit.icon}
              title={benefit.title}
              description={benefit.description}
              index={index}
            />
          ))}
        </div>

        {/* Attention-grabbing highlight box */}
        <motion.div 
          className="bg-gradient-to-r from-green-500/20 to-blue-500/20 border border-green-500/30 rounded-lg p-6 mb-10"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          viewport={{ once: true }}
        >
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex-1 min-w-[250px]">
              <h3 className="text-xl font-medium text-white mb-2">Ready to transform your coding experience?</h3>
              <p className="text-white/70">Start for free and upgrade anytime.</p>
            </div>
            <motion.div 
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.98 }}
              transition={{ duration: 0.2 }}
              onMouseEnter={() => setIsHovered(true)}
              onMouseLeave={() => setIsHovered(false)}
            >
              <HeroButtons 
                decorativeColors={decorativeColors}
              />
            </motion.div>
          </div>
        </motion.div>

        {/* Documentation and GitHub links */}
        <motion.div 
          className="flex justify-center space-x-8 relative"
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          viewport={{ once: true }}
        >
          <Link
            href="/docs"
            className={cn(
              "flex items-center rounded-lg border border-zinc-800 px-4 py-3",
              "hover:bg-zinc-800/50 transition-all duration-300",
              "text-white group"
            )}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="w-5 h-5 mr-2 group-hover:text-green-400 transition-colors"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25"
              />
            </svg>
            <span>Documentation</span>
          </Link>
          <Link
            href="https://github.com/CodebuffAI/codebuff"
            className={cn(
              "flex items-center rounded-lg border border-zinc-800 px-4 py-3",
              "hover:bg-zinc-800/50 transition-all duration-300",
              "text-white group"
            )}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="w-5 h-5 mr-2 group-hover:text-green-400 transition-colors"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0-3.09 3.09Z"
              />
            </svg>
            <span>GitHub Repo</span>
          </Link>
        </motion.div>
      </div>
    </Section>
  )
}
