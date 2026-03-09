import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
      <h1 className="text-6xl font-bold mb-4">404</h1>
      <p className="text-xl text-zinc-400 mb-8">Page not found</p>
      <Link
        href="/"
        className="px-6 py-3 bg-white text-black rounded-lg hover:bg-zinc-200 transition-colors"
      >
        Go home
      </Link>
    </div>
  )
}
