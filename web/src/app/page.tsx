'use client'
import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CodeIcon, BrainCircuitIcon, TerminalIcon } from 'lucide-react'
import { BackgroundBeams } from '@/components/ui/background-beams'
import Globe from '@/components/magicui/globe'

const Home = () => {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  return (
    <div className="overflow-hidden">
      <BackgroundBeams />

      <main className="container mx-auto px-4 py-20 text-center relative z-10">
        <h1 className="text-5xl md:text-7xl font-bold mb-6">
          Code at the Speed of Thought
        </h1>
        <p className="text-xl md:text-2xl mb-12 text-gray-500 max-w-3xl mx-auto">
          Manicode: The AI-powered tool that transforms natural language into
          expert code. Edit your codebase with simple instructions to Mani, your
          personal AI programming assistant.
        </p>
        <div className="flex flex-col md:flex-row justify-center items-center space-y-4 md:space-y-0 md:space-x-4">
          <Input
            type="email"
            placeholder="Enter your email"
            className="max-w-xs bg-gray-800 border-gray-700 text-white placeholder:italic placeholder:text-slate-200 "
          />
          <Button className="bg-blue-600 hover:bg-blue-700 text-white transition-colors">
            Start Coding with AI
          </Button>
        </div>
      </main>

      <section
        id="features"
        className="container mx-auto px-4 py-20 relative z-10"
      >
        <h2 className="text-3xl md:text-4xl font-bold mb-12 text-center">
          Revolutionize Your Coding Workflow
        </h2>
        <div className="grid md:grid-cols-3 gap-8">
          <div className="bg-gray-900 p-6 rounded-lg">
            <CodeIcon className="h-12 w-12 text-blue-500 mb-4" />
            <h3 className="text-xl text-white font-semibold mb-2">
              Global Code Understanding
            </h3>
            <p className="text-gray-500">
              Mani understands your entire codebase, providing context-aware
              suggestions and edits.
            </p>
          </div>
          <div className="bg-gray-900 p-6 rounded-lg">
            <TerminalIcon className="h-12 w-12 text-blue-500 mb-4" />
            <h3 className="text-xl text-white font-semibold mb-2">
              Natural Language Coding
            </h3>
            <p className="text-gray-500">
              Write code using plain English. Mani translates your instructions
              into efficient, clean code.
            </p>
          </div>
          <div className="bg-gray-900 p-6 rounded-lg">
            <BrainCircuitIcon className="h-12 w-12 text-blue-500 mb-4" />
            <h3 className="text-xl text-white font-semibold mb-2">
              AI-Powered Refactoring
            </h3>
            <p className="text-gray-500">
              Automatically improve code quality, fix bugs, and optimize
              performance with AI-driven refactoring.
            </p>
          </div>
        </div>
      </section>

      <section className="py-20 relative">
        <div className="container mx-auto px-4 text-center relative z-10">
          <h2 className="text-3xl md:text-4xl font-bold mb-6">
            Experience the Future of Coding
          </h2>
          <p className="text-xl mb-8 text-gray-500 dark:text-gray-300 max-w-2xl mx-auto">
            Join thousands of developers who are already coding at the speed of
            thought with Manicode.
          </p>
          <Button className="bg-blue-600 hover:bg-blue-700 text-white transition-colors">
            Try Manicode Free
          </Button>
        </div>
        {mounted && (
          <div className="absolute inset-0 flex items-center justify-center opacity-50">
            <Globe />
          </div>
        )}
      </section>

      <section className="bg-gray-900 py-12 relative z-10">
        <div className="container mx-auto px-4 text-center">
          <h3 className="text-2xl font-semibold mb-4">
            Get Started with Manicode
          </h3>
          <div className="bg-black rounded-lg p-4 inline-block">
            <code className="text-blue-400">npm install -g manicode</code>
          </div>
        </div>
      </section>
    </div>
  )
}

export default Home
