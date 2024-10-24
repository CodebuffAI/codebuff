'use client'
import { Button } from '@/components/ui/button'
import { CodeIcon, BrainCircuitIcon, TerminalIcon } from 'lucide-react'
import Link from 'next/link'
import { BackgroundBeams } from '@/components/ui/background-beams'
import { useTheme } from 'next-themes'

const Home = () => {
  const { theme } = useTheme()

  return (
    <div className="overflow-hidden">
      <BackgroundBeams />

      <div className="max-w-6xl mx-auto">
        <main className="px-6 py-20 relative z-10 text-center space-y-8">
          <h1 className="text-5xl md:text-7xl font-bold -mt-6 mx-auto">
            Code at the Speed of Thought
          </h1>
          <div className="text-2xl text-gray-600 dark:text-gray-300 max-w-3xl mx-auto">
            <p>Use natural language to edit your codebase and</p>
            <p>run commands from your terminal faster.</p>
          </div>
          <section className="relative z-10">
            <div className="mb-4">Try Manicode for free:</div>
            <div className="px-4 ">
              <div className="bg-gray-800 rounded-lg p-4 inline-block">
                <code className="text-white">npm install -g manicode</code>
              </div>
            </div>
          </section>
        </main>

        <section className="py-10 px-4 relative z-10 space-y-8">
          <h2 className="text-3xl md:text-4xl font-bold text-center">
            Watch the Demo
          </h2>
          <div className="max-w-3xl mx-auto">
            <div className="aspect-w-16 aspect-h-full h-96">
              <iframe
                src="https://www.youtube.com/embed/eezrK8JPgxU"
                title="Manicode Demo"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="h-full w-full rounded-lg shadow-lg"
              ></iframe>
            </div>
          </div>

          <div className="flex justify-center space-x-8">
            <div className="flex flex-col items-center">
              <p>Backed by</p>
              <Link
                target="_blank"
                href="https://www.ycombinator.com/companies/manicode"
              >
                <img
                  src="/y-combinator.svg"
                  alt="y combinator logo"
                  className="h-8 w-full"
                />
              </Link>
            </div>
            <a
              href="https://www.producthunt.com/posts/manicode?embed=true&utm_source=badge-featured&utm_medium=badge&utm_souce=badge-manicode"
              target="_blank"
            >
              <img
                src={`https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=501055&theme=${theme}`}
                alt="Manicode - Better&#0032;code&#0032;generation&#0032;than&#0032;Cursor&#0044;&#0032;from&#0032;your&#0032;CLI | Product Hunt"
                style={{
                  width: '250px',
                  height: '54px',
                }}
                width="250"
                height="54"
              />
            </a>
          </div>
        </section>

        <section id="features" className="px-4 py-20 relative z-10">
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
                Manicode understands your entire codebase, providing
                context-aware suggestions and edits.
              </p>
            </div>
            <div className="bg-gray-900 p-6 rounded-lg">
              <TerminalIcon className="h-12 w-12 text-blue-500 mb-4" />
              <h3 className="text-xl text-white font-semibold mb-2">
                Natural Language Coding
              </h3>
              <p className="text-gray-500">
                Write code using plain English. Manicode translates your
                instructions into efficient, clean code.
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

        <section className="py-12 relative z-10">
          <div className="px-4 text-center">
            <Button className="bg-blue-600 hover:bg-blue-700 text-white transition-colors">
              <Link
                href="https://www.npmjs.com/package/manicode"
                target="_blank"
              >
                Get Started Coding with AI
              </Link>
            </Button>
          </div>
        </section>
      </div>
    </div>
  )
}

export default Home
