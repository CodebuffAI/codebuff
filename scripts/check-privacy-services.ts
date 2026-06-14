/**
 * Health-check the three IP-privacy providers used by free-mode country access:
 * ipinfo, spur, scamalytics. Reports HTTP status + a snippet of the body so we
 * can tell quota exhaustion / auth failure (the cause of mass "limited mode")
 * apart from a healthy service.
 *
 * Read-only. Run:
 *   infisical run --env=prod --silent -- bun scripts/check-privacy-services.ts [ip]
 */

const ip = process.argv[2] ?? '24.48.0.1' // a Canadian residential IP (clean)

function snippet(s: string, n = 600) {
  return s.length > n ? s.slice(0, n) + '…' : s
}

function tokenStatus(token: string | undefined) {
  return token ? `set (${token.length} chars)` : 'MISSING'
}

// Hit one provider and print its HTTP status, an optional quota/header line, and
// a body snippet — so quota exhaustion / auth failure is distinguishable from a
// healthy response. `headerLine` formats the provider-specific diagnostic header.
async function checkService(
  name: string,
  url: string,
  init?: RequestInit,
  headerLine?: (r: Response) => string,
) {
  try {
    const r = await fetch(url, init)
    const body = await r.text()
    console.log(`=== ${name} === HTTP ${r.status} ${r.ok ? 'OK' : 'NOT OK'}`)
    if (headerLine) console.log(`  ${headerLine(r)}`)
    console.log(`  body: ${snippet(body)}`)
  } catch (e) {
    console.log(`=== ${name} === THREW: ${e}`)
  }
  console.log('')
}

async function run() {
  const ipinfoToken = process.env.IPINFO_TOKEN
  const spurToken = process.env.SPUR_TOKEN
  const scamalyticsKey = process.env.SCAMALYTICS_API_KEY
  const scamalyticsUser = process.env.scamalyticsUser ?? 'codebuff'

  console.log(`Testing IP: ${ip}\n`)
  console.log('Token presence:')
  console.log(`  IPINFO_TOKEN:        ${tokenStatus(ipinfoToken)}`)
  console.log(`  SPUR_TOKEN:          ${tokenStatus(spurToken)}`)
  console.log(`  SCAMALYTICS_API_KEY: ${tokenStatus(scamalyticsKey)}`)
  console.log(`  scamalyticsUser:     ${scamalyticsUser}`)
  console.log('')

  await checkService(
    'ipinfo',
    `https://api.ipinfo.io/lookup/${encodeURIComponent(ip)}?token=${encodeURIComponent(ipinfoToken ?? '')}`,
    undefined,
    (r) =>
      `x-ratelimit headers: limit=${r.headers.get('x-ratelimit-limit')} remaining=${r.headers.get('x-ratelimit-remaining')}`,
  )

  await checkService(
    'spur',
    `https://api.spur.us/v2/context/${encodeURIComponent(ip)}`,
    { headers: { Token: spurToken ?? '' } },
    (r) => {
      const matched: Record<string, string> = {}
      r.headers.forEach((value, key) => {
        if (/balance|quota|limit|remain/i.test(key)) matched[key] = value
      })
      return `x-balance/quota headers: ${JSON.stringify(matched)}`
    },
  )

  await checkService(
    'scamalytics',
    `https://api11.scamalytics.com/v3/${encodeURIComponent(scamalyticsUser)}/?key=${encodeURIComponent(scamalyticsKey ?? '')}&ip=${encodeURIComponent(ip)}`,
  )
}

run()
