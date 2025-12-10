export interface HeaderWritable {
  headers: { set: (k: string, v: string) => void }
}

export function applyCacheHeaders<T extends HeaderWritable>(res: T): T {
  res.headers.set(
    'Cache-Control',
    'public, max-age=300, s-maxage=600, stale-while-revalidate=3600',
  )
  res.headers.set('Vary', 'Accept-Encoding')
  res.headers.set('X-Content-Type-Options', 'nosniff')
  res.headers.set('Content-Type', 'application/json; charset=utf-8')
  return res
}
