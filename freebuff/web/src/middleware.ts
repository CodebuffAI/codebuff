import { NextResponse, type NextRequest } from 'next/server'

/**
 * Lightweight staging password gate for the Freebuff Web product (everything
 * under `/web`). This is intentionally NOT real security — it just stops
 * people from accidentally stumbling onto the in-progress app on prod/staging.
 *
 * Everything (cookie check, password form, and form submission) lives in this
 * one file: the form POSTs back to the same URL, which middleware intercepts.
 * Disabled in local dev so it never gets in the way.
 */

const COOKIE = 'fb_web_access'
const PASSWORD = process.env.WEB_ACCESS_PASSWORD || 'vly'
const TOKEN = `granted:${PASSWORD}`
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30 // 30 days

function gateEnabled(): boolean {
  if (process.env.DISABLE_WEB_ACCESS_GATE === 'true') return false
  return process.env.NODE_ENV === 'production'
}

/** Only allow same-origin relative paths to avoid open redirects. */
function safeNext(raw: string | null | undefined): string {
  if (raw && raw.startsWith('/') && !raw.startsWith('//')) return raw
  return '/web'
}

function gatePage(next: string, error?: string): NextResponse {
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
<title>Freebuff Web</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin:0; min-height:100dvh; display:flex; align-items:center; justify-content:center;
    background:#0a0a0b; color:#fafafa; font-family:ui-sans-serif,system-ui,-apple-system,sans-serif; padding:1rem; }
  .card { width:100%; max-width:22rem; text-align:center; }
  img { width:48px; height:48px; border-radius:12px; }
  h1 { font-size:1.25rem; font-weight:600; margin:1rem 0 .375rem; }
  p { font-size:.875rem; color:#a1a1aa; margin:0 0 1.5rem; }
  form { display:flex; flex-direction:column; gap:.75rem; }
  input { height:2.75rem; border:0; border-radius:.75rem; background:#1f1f23; color:#fafafa;
    padding:0 1rem; font-size:16px; outline:none; }
  input:focus { box-shadow:0 0 0 1px rgba(124,255,63,.5); }
  button { height:2.75rem; border:0; border-radius:.75rem; background:#7CFF3F; color:#0a0a0b;
    font-size:.875rem; font-weight:600; cursor:pointer; transition:box-shadow .15s; }
  button:hover { box-shadow:0 0 18px rgba(124,255,63,.35); }
  .err { color:#f87171; font-size:.875rem; margin:0; }
</style>
</head>
<body>
  <div class="card">
    <img src="/logo-icon.png" alt="Freebuff" />
    <h1>Freebuff Web</h1>
    <p>This preview is password protected. Enter the password to continue.</p>
    <form method="POST">
      <input type="hidden" name="next" value="${next.replace(/"/g, '&quot;')}" />
      <input type="password" name="password" placeholder="Enter password" autofocus autocomplete="off" />
      ${error ? `<p class="err">${error}</p>` : ''}
      <button type="submit">Enter</button>
    </form>
  </div>
</body>
</html>`
  return new NextResponse(html, {
    status: error ? 401 : 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  })
}

export async function middleware(request: NextRequest) {
  if (!gateEnabled()) return NextResponse.next()

  if (request.cookies.get(COOKIE)?.value === TOKEN) {
    return NextResponse.next()
  }

  const { pathname, search } = request.nextUrl

  // Form submission: validate, set cookie, and bounce back to the target.
  if (request.method === 'POST') {
    const form = await request.formData()
    const next = safeNext(String(form.get('next') || ''))
    if (String(form.get('password') || '').trim() === PASSWORD) {
      const res = NextResponse.redirect(new URL(next, request.url), 303)
      res.cookies.set(COOKIE, TOKEN, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: COOKIE_MAX_AGE,
      })
      return res
    }
    return gatePage(next, 'Incorrect password. Try again.')
  }

  return gatePage(`${pathname}${search}`)
}

export const config = {
  matcher: ['/web/:path*'],
}
