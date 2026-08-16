import { describe, expect, it } from 'bun:test'

import {
  classifyEmailDomain,
  isSpendCeilingFlaggedEmailDomain,
} from '../util/disposable-email'

describe('classifyEmailDomain', () => {
  it('flags one-time inbox providers as disposable', () => {
    expect(classifyEmailDomain('bot123@mailinator.com')).toBe('disposable')
    expect(classifyEmailDomain('x@yopmail.com')).toBe('disposable')
    // Domains observed in the 2026-07 referral farm rings.
    expect(classifyEmailDomain('mrz640mq54kr@animatimg.com')).toBe('disposable')
    expect(classifyEmailDomain('a@biscoito.email')).toBe('disposable')
  })

  it('classifies mainstream privacy mailboxes without ceiling-pricing them', () => {
    // Operator decision 2026-08-14: Proton/Tutanota/Apple/DuckDuckGo/Firefox
    // are consumer providers, not bot-farm suppliers. Visible to scoring,
    // invisible to the spend ceiling.
    expect(classifyEmailDomain('4q9cq4d7cj@proton.me')).toBe(
      'mainstream_privacy',
    )
    expect(classifyEmailDomain('someone@protonmail.com')).toBe(
      'mainstream_privacy',
    )
    expect(classifyEmailDomain('g862jxscfv@privaterelay.appleid.com')).toBe(
      'mainstream_privacy',
    )
    expect(classifyEmailDomain('dev@pm.me')).toBe('mainstream_privacy')
    expect(isSpendCeilingFlaggedEmailDomain('dev@pm.me')).toBe(false)
    expect(isSpendCeilingFlaggedEmailDomain('user@tutanota.com')).toBe(false)
    // Alias products stay priced: one-address-per-signup IS the abuse shape.
    expect(classifyEmailDomain('a@simplelogin.io')).toBe('privacy_relay')
    expect(isSpendCeilingFlaggedEmailDomain('a@simplelogin.io')).toBe(true)
    expect(isSpendCeilingFlaggedEmailDomain('a@passmail.net')).toBe(true)
    // Disposables too, unchanged.
    expect(isSpendCeilingFlaggedEmailDomain('x@mailinator.com')).toBe(true)
  })

  it('matches subdomains of listed domains', () => {
    expect(classifyEmailDomain('x@inbox.mailinator.com')).toBe('disposable')
  })

  it('flags the 2026-08-01 free-mode compute ring domains and their subdomains', () => {
    // Real addresses from the ring; the deceptive subdomains are the point.
    expect(classifyEmailDomain('tbcy8kvy77z2@l0veyou.com')).toBe('disposable')
    expect(classifyEmailDomain('xtikhozbrw3z@gmail.l0veyou.com')).toBe(
      'disposable',
    )
    expect(classifyEmailDomain('kznc3jb31lsz@edu.l0veyou.com')).toBe(
      'disposable',
    )
    expect(classifyEmailDomain('ht07lgr96jsg@my.l0veyou.com')).toBe(
      'disposable',
    )
    expect(classifyEmailDomain('8cuoyn573zae@test123.l0veyou.com')).toBe(
      'disposable',
    )
    expect(classifyEmailDomain('4j4fyacbke76@pumpkinai.space')).toBe(
      'disposable',
    )
    expect(classifyEmailDomain('uhm9e3za1qft@gmail.pumpkinai.space')).toBe(
      'disposable',
    )
    expect(classifyEmailDomain('7yahsqv1o8lc@pumpkinai.it.com')).toBe(
      'disposable',
    )
  })

  it('flags the proxy-service and single-day-mint domains', () => {
    expect(classifyEmailDomain('github-1@proxyvpn.cn')).toBe('disposable')
    expect(classifyEmailDomain('yazen@impact.qd.je')).toBe('disposable')
    expect(classifyEmailDomain('x@fincy.qd.je')).toBe('disposable')
  })

  it('does not flag real providers a "proxy" substring rule would catch', () => {
    // Proximus is Belgium's largest telecom; its one user has 791 legitimate
    // messages. dns-proxy.com has a single account and no activity, so there
    // is no evidence to act on.
    expect(classifyEmailDomain('leopold.delage@proximus.lu')).toBeNull()
    expect(classifyEmailDomain('alizy@dns-proxy.com')).toBeNull()
    expect(classifyEmailDomain('someone@proxyclick.com')).toBeNull()
  })

  it('does not flag lookalikes of the ring domains', () => {
    expect(classifyEmailDomain('x@loveyou.com')).toBeNull()
    expect(classifyEmailDomain('x@notl0veyou.com')).toBeNull()
    expect(classifyEmailDomain('x@pumpkinai.com')).toBeNull()
  })

  it('treats ordinary providers as unflagged', () => {
    expect(classifyEmailDomain('person@gmail.com')).toBeNull()
    expect(classifyEmailDomain('dev@company.io')).toBeNull()
    // Substring lookalikes must not match the suffix rule.
    expect(classifyEmailDomain('x@notproton.me.example.com')).toBeNull()
    expect(classifyEmailDomain('x@fakeproton.me')).toBeNull()
  })

  it('is case-insensitive and null-safe', () => {
    expect(classifyEmailDomain('X@Proton.ME')).toBe('mainstream_privacy')
    expect(classifyEmailDomain(null)).toBeNull()
    expect(classifyEmailDomain(undefined)).toBeNull()
    expect(classifyEmailDomain('not-an-email')).toBeNull()
    expect(classifyEmailDomain('trailing@')).toBeNull()
  })
  it('flags the 2026-08-15 Singapore ring, and prices it', () => {
    // These are why the SG geography cap could come off: the abuse there was a
    // domain farm, not a country. Each cleared the file's evidence bar on ban
    // rate (see the dated block in disposable-email.ts).
    for (const domain of [
      'dhisy.com',
      'dewaa.id',
      'sendang.space',
      'yotube.id',
      'gusil.my.id',
    ]) {
      expect(classifyEmailDomain(`user@${domain}`)).toBe('disposable')
      expect(isSpendCeilingFlaggedEmailDomain(`user@${domain}`)).toBe(true)
    }
  })

  it('does NOT flag the two lookalikes that failed the evidence bar', () => {
    // gmisel.com sits one letter from the listed gmisol.my.id and shows a 2%
    // abuse rate — indistinguishable from gmail. cemararaya.id has six
    // accounts. Name similarity is not evidence; this is the regression guard
    // for adding a domain because it "looks like" one of the others.
    expect(classifyEmailDomain('user@gmisel.com')).toBeNull()
    expect(classifyEmailDomain('user@cemararaya.id')).toBeNull()
    expect(isSpendCeilingFlaggedEmailDomain('user@gmisel.com')).toBe(false)
  })
})
