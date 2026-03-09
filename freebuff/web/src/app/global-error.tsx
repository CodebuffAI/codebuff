'use client'

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="en">
      <body className="bg-black text-white">
        <div className="flex flex-col items-center justify-center min-h-screen text-center px-4">
          <h1 className="text-6xl font-bold mb-4">500</h1>
          <p className="text-xl text-zinc-400 mb-8">Something went wrong</p>
          <button
            onClick={() => reset()}
            className="px-6 py-3 bg-white text-black rounded-lg hover:bg-zinc-200 transition-colors"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  )
}
