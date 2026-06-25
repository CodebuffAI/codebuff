/**
 * Differential harness for the free-mode privacy decision.
 *
 * Enumerates the full space of (ipinfo signals × Spur outcome × Scamalytics
 * outcome × client-hints) and records, for each scenario, the ACCESS OUTCOME
 * (allowed / blockReason / hard-block) and the number of second-opinion
 * providers consulted (cost).
 *
 * Usage:
 *   bun scripts/freebuff-privacy-decision-diff.ts snapshot   # write baseline
 *   bun scripts/freebuff-privacy-decision-diff.ts compare    # diff vs baseline
 *
 * The baseline is captured from the CURRENT code, then `compare` is run after a
 * rewrite to prove the access outcomes are unchanged (and to quantify the cost
 * savings from sequential early-stop escalation).
 */
import { writeFileSync, readFileSync, existsSync } from 'node:fs'

import {
  getFreeModeCountryAccess,
  getFreeModeRiskScore,
  shouldHardBlockFreeModeAccess,
  type FreeModeIpPrivacySignal,
} from '@codebuff/internal/free-mode-country/country-access'

const SNAPSHOT_PATH = '/tmp/freebuff-privacy-decision-snapshot.json'

const IPINFO_SIGNAL_SETS: FreeModeIpPrivacySignal[][] = [
  [],
  ['relay'],
  ['hosting'],
  ['service'],
  ['anonymous'],
  ['hosting', 'service'],
  ['anonymous', 'relay'],
  ['vpn'],
  ['proxy'],
  ['tor'],
  ['res_proxy'],
  ['vpn', 'hosting'],
  ['tor', 'res_proxy'],
  ['vpn', 'anonymous'],
  ['proxy', 'res_proxy'],
]

const SPUR_OUTCOMES: Record<
  string,
  { signals: FreeModeIpPrivacySignal[] } | 'fail'
> = {
  clean: { signals: [] },
  vpn: { signals: ['vpn'] },
  tor: { signals: ['tor'] },
  proxy: { signals: ['proxy'] },
  res_proxy: { signals: ['res_proxy'] },
  fail: 'fail',
}

const SCAM_OUTCOMES: Record<
  string,
  { signals: FreeModeIpPrivacySignal[]; score: number; risk: string } | 'fail'
> = {
  clean: { signals: [], score: 10, risk: 'low' },
  vpn: { signals: ['vpn'], score: 10, risk: 'low' },
  tor: { signals: ['tor'], score: 90, risk: 'very high' },
  res_proxy: { signals: ['res_proxy'], score: 60, risk: 'medium' },
  score49: { signals: [], score: 49, risk: 'low' },
  score50: { signals: [], score: 50, risk: 'medium' },
  score95: { signals: [], score: 95, risk: 'very high' },
  fail: 'fail',
}

const HINTS = ['none', 'suspicious'] as const

function makeReq(): { headers: Headers } {
  return {
    headers: new Headers({
      'cf-ipcountry': 'US',
      'cf-connecting-ip': '203.0.113.10',
    }),
  }
}

type ScenarioKey = string
type Outcome = {
  allowed: boolean
  blockReason: string | null
  hardBlock: boolean
  riskScore: number
  spurCalls: number
  scamCalls: number
}

async function runScenario(
  ipinfo: FreeModeIpPrivacySignal[],
  spurKey: string,
  scamKey: string,
  hints: (typeof HINTS)[number],
): Promise<Outcome> {
  let spurCalls = 0
  let scamCalls = 0
  const spur = SPUR_OUTCOMES[spurKey]
  const scam = SCAM_OUTCOMES[scamKey]

  const access = await getFreeModeCountryAccess(makeReq(), {
    ipinfoToken: 'x',
    spurToken: 'x',
    lookupIpPrivacy: async () => ({ signals: ipinfo }),
    lookupSpurIpPrivacy: async () => {
      spurCalls++
      if (spur === 'fail') throw new Error('spur down')
      return spur
    },
    lookupScamalyticsIpRisk: async () => {
      scamCalls++
      if (scam === 'fail') return null
      return scam
    },
    clientHints:
      hints === 'suspicious'
        ? { timezone: 'Asia/Shanghai', languages: ['zh-CN'] }
        : null,
  })

  return {
    allowed: access.allowed,
    blockReason: access.blockReason,
    hardBlock: shouldHardBlockFreeModeAccess(access),
    riskScore: getFreeModeRiskScore(access),
    spurCalls,
    scamCalls,
  }
}

async function collectAll(): Promise<Record<ScenarioKey, Outcome>> {
  const results: Record<ScenarioKey, Outcome> = {}
  for (const ipinfo of IPINFO_SIGNAL_SETS) {
    for (const spurKey of Object.keys(SPUR_OUTCOMES)) {
      for (const scamKey of Object.keys(SCAM_OUTCOMES)) {
        for (const hints of HINTS) {
          const key = `ipinfo=[${ipinfo.join(',')}] spur=${spurKey} scam=${scamKey} hints=${hints}`
          results[key] = await runScenario(ipinfo, spurKey, scamKey, hints)
        }
      }
    }
  }
  return results
}

function outcomeKeyEqual(a: Outcome, b: Outcome): boolean {
  // Compare ACCESS OUTCOME only (allowed/blockReason/hardBlock). riskScore and
  // provider call counts are reported but not part of the equivalence contract.
  return (
    a.allowed === b.allowed &&
    a.blockReason === b.blockReason &&
    a.hardBlock === b.hardBlock
  )
}

async function main() {
  const mode = process.argv[2] ?? 'compare'
  const current = await collectAll()
  const total = Object.keys(current).length

  if (mode === 'snapshot') {
    writeFileSync(SNAPSHOT_PATH, JSON.stringify(current, null, 2))
    const escalating = Object.values(current).filter(
      (o) => o.spurCalls + o.scamCalls > 0,
    ).length
    const totalCalls = Object.values(current).reduce(
      (n, o) => n + o.spurCalls + o.scamCalls,
      0,
    )
    console.log(`Wrote baseline: ${total} scenarios -> ${SNAPSHOT_PATH}`)
    console.log(
      `Escalating scenarios: ${escalating}; total provider calls: ${totalCalls}`,
    )
    return
  }

  if (!existsSync(SNAPSHOT_PATH)) {
    console.error(`No baseline at ${SNAPSHOT_PATH}; run \`snapshot\` first.`)
    process.exit(1)
  }
  const baseline = JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8')) as Record<
    ScenarioKey,
    Outcome
  >

  const diffs: string[] = []
  let baseCalls = 0
  let newCalls = 0
  for (const [key, cur] of Object.entries(current)) {
    const base = baseline[key]
    if (!base) {
      diffs.push(`NEW SCENARIO ${key}`)
      continue
    }
    baseCalls += base.spurCalls + base.scamCalls
    newCalls += cur.spurCalls + cur.scamCalls
    if (!outcomeKeyEqual(base, cur)) {
      diffs.push(
        `OUTCOME DIFF ${key}\n  base: allowed=${base.allowed} reason=${base.blockReason} hardBlock=${base.hardBlock}\n   new: allowed=${cur.allowed} reason=${cur.blockReason} hardBlock=${cur.hardBlock}`,
      )
    }
  }

  console.log(`Compared ${total} scenarios.`)
  console.log(`Provider calls: baseline=${baseCalls} new=${newCalls} (${
    baseCalls > 0 ? Math.round((100 * (baseCalls - newCalls)) / baseCalls) : 0
  }% fewer)`)
  if (diffs.length === 0) {
    console.log('✅ No access-outcome differences.')
  } else {
    console.log(`❌ ${diffs.length} outcome differences:\n`)
    console.log(diffs.join('\n'))
    process.exit(1)
  }
}

void main()
