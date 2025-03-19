import Link from "next/link";
import { Button } from "./button";
import { Terminal } from "lucide-react";
import { GreenSplash, YellowSplash, ColorBar } from "./decorative-splash";

export function CTASection() {
  return (
    <section className="py-24 bg-gradient-to-b from-[#003300] to-[#ffff33] relative overflow-hidden">
      {/* Decorative elements */}
      <GreenSplash className="top-0 left-1/4 opacity-40" />
      <YellowSplash className="bottom-0 right-1/4 opacity-60" />
      <ColorBar
        color="primary"
        width={200}
        className="absolute top-1/4 left-20 rotate-12 hidden md:block"
      />
      <ColorBar
        color="primary"
        width={150}
        className="absolute top-1/3 right-10 -rotate-12 hidden md:block"
      />
      <ColorBar
        color="yellow"
        width={180}
        className="absolute bottom-1/4 right-1/3 rotate-45 hidden md:block"
      />

      <div className="codebuff-container text-center relative z-10">
        <div className="max-w-4xl mx-auto relative">
          <h2 className="text-4xl md:text-5xl font-serif font-medium mb-6 text-white relative inline-block">
            Start Buffing Your Code For Free
            <span className="absolute -bottom-2 left-0 w-full h-1 bg-white"></span>
          </h2>
          <p className="text-lg mb-10 text-white/80 max-w-2xl mx-auto">
            No card required. Start hacking in 30 seconds. Check out the docs.
          </p>

          <div className="flex flex-col md:flex-row items-center justify-center gap-6 max-w-2xl mx-auto mb-12 relative">
            <div className="absolute w-[350px] h-[350px] rounded-full bg-yellow-300/20 blur-[100px] -z-10"></div>

            <Button
              size="lg"
              className="w-full md:w-[320px] text-base font-medium h-[42px] transition-all duration-300 hover:scale-105 relative group overflow-hidden"
              asChild
            >
              <Link href="/signup" className="relative z-10 flex items-center justify-center">
                <span className="mr-2">Try Free</span>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  className="transition-transform duration-300 group-hover:translate-x-1"
                >
                  <path
                    d="M1 8H15M15 8L8 1M15 8L8 15"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </Link>
            </Button>

            <div className="terminal w-full md:w-[320px] flex items-center group relative backdrop-blur-sm bg-black/80 border border-zinc-700">
              <div className="terminal-command group-hover:opacity-80 transition-opacity duration-300">
                <Terminal size={16} className="text-primary" />
                <code className="font-mono">npm install -g codebuff</code>
              </div>
              <button
                className="ml-auto p-1 text-zinc-400 hover:text-primary transition-colors duration-300"
                aria-label="Copy to clipboard"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  className="transition-transform duration-300 hover:scale-110"
                >
                  <path
                    d="M5.75 4.75H3.75C3.19772 4.75 2.75 5.19772 2.75 5.75V12.25C2.75 12.8023 3.19772 13.25 3.75 13.25H10.25C10.8023 13.25 11.25 12.8023 11.25 12.25V10.25"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <rect
                    x="5.75"
                    y="2.75"
                    width="7.5"
                    height="7.5"
                    rx="1.25"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </div>
          </div>

          <div className="flex justify-center space-x-6 relative">
            <Link href="/docs" className="flex items-center text-white hover:text-primary transition-colors duration-300">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                className="w-5 h-5 mr-2"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25"
                />
              </svg>
              <span>Documentation</span>
            </Link>
            <Link href="https://github.com/CodebuffAI/codebuff" className="flex items-center text-white hover:text-primary transition-colors duration-300">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                className="w-5 h-5 mr-2"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z"
                />
              </svg>
              <span>GitHub Repo</span>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}