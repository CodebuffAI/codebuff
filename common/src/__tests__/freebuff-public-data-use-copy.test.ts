import { describe, expect, test } from 'bun:test'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  FREEBUFF_AI_TRAINING_NOTICE,
  FREEBUFF_DATA_USE_GENERATED_MARKDOWN_BLOCK,
  FREEBUFF_DATA_USE_GENERATED_MDX_BLOCK,
  FREEBUFF_POLICY_ROLLOUT,
  FREEBUFF_PUBLIC_DATA_USE_COPY,
  renderFreebuffDataUseFaqMarkdown,
  renderFreebuffDataUseFaqMdx,
} from '../constants/freebuff-data-use'

const REPO_ROOT = resolve(import.meta.dir, '../../..')

function readRepoFile(path: string): string {
  return readFileSync(resolve(REPO_ROOT, path), 'utf8')
}

function listPublicTextFiles(path: string): string[] {
  const absolutePath = resolve(REPO_ROOT, path)
  if (!statSync(absolutePath).isDirectory()) return [path]

  return readdirSync(absolutePath).flatMap((entry) => {
    const child = `${path}/${entry}`
    const childPath = resolve(REPO_ROOT, child)

    if (statSync(childPath).isDirectory()) return listPublicTextFiles(child)
    return /\.(?:md|mdx|ts|tsx)$/.test(entry) ? [child] : []
  })
}

function generatedBlock(
  source: string,
  markers: { start: string; end: string },
): string {
  const start = source.indexOf(markers.start)
  const end = source.indexOf(markers.end, start)

  expect(start).toBeGreaterThanOrEqual(0)
  expect(end).toBeGreaterThan(start)

  return source.slice(start, end + markers.end.length)
}

describe('public Freebuff data-use copy', () => {
  test('the July 23 policy rollout metadata and notice stay aligned', () => {
    expect(FREEBUFF_POLICY_ROLLOUT).toEqual({
      version: '2026-07-23',
      effectiveDate: 'July 23, 2026',
      lastUpdated: '07/23/2026',
      noticeEndsAt: '2026-08-23T00:00:00-07:00',
      notice: {
        title:
          'We’ve updated our Terms and Privacy Policy, effective July 23, 2026.',
        summary:
          'Prompts may be used to personalize ads, AI training applies only to labeled models or features, and usage restrictions were updated.',
      },
    })
  })

  test.each(['README.md', 'freebuff/cli/release/README.md'])(
    '%s matches the generated Markdown FAQ',
    (path) => {
      expect(
        generatedBlock(
          readRepoFile(path),
          FREEBUFF_DATA_USE_GENERATED_MARKDOWN_BLOCK,
        ),
      ).toBe(renderFreebuffDataUseFaqMarkdown())
    },
  )

  test.each([
    'web/src/content/advanced/privacy.mdx',
    'web/src/content/help/faq.mdx',
  ])('%s matches the generated MDX FAQ', (path) => {
    expect(
      generatedBlock(readRepoFile(path), FREEBUFF_DATA_USE_GENERATED_MDX_BLOCK),
    ).toBe(renderFreebuffDataUseFaqMdx())
  })

  test('the standalone landing prototype matches canonical FAQ copy', () => {
    const source = readRepoFile('landing-lab/src/components/sections/Faq.tsx')

    expect(source).toContain(FREEBUFF_PUBLIC_DATA_USE_COPY.trainingQuestion)
    expect(source).toContain(FREEBUFF_PUBLIC_DATA_USE_COPY.trainingAnswer)
    expect(source).toContain(FREEBUFF_PUBLIC_DATA_USE_COPY.storageQuestion)
    expect(source).toContain(FREEBUFF_PUBLIC_DATA_USE_COPY.storageAnswer)
  })

  test.each([
    'freebuff/web/src/lib/home-faqs.ts',
    'freebuff/web/src/components/landing/sections/Faq.tsx',
    'freebuff/web/src/components/landing/cloud/CloudLanding.tsx',
    'freebuff/web/src/vly/components/pages/WebLandingSections.tsx',
    'freebuff/web/src/lib/blog/posts/freebuff-launch.ts',
    'freebuff/web/src/lib/blog/posts/free-cloud-coding-agent.ts',
    'freebuff/web/src/lib/blog/posts/freebuff-web-launch.ts',
    'freebuff/web/src/lib/blog/posts/vly-becomes-freebuff-web.ts',
    'freebuff/web/src/lib/blog/posts/free-antigravity-cli-coding-agent-alternative-freebuff.ts',
    'freebuff/web/src/lib/blog/posts/free-alternative-to-devin.ts',
    'freebuff/web/src/lib/blog/posts/free-codex-cli-openai-coding-agent-alternative-freebuff.ts',
    'freebuff/web/src/lib/blog/posts/free-claude-code-cli-coding-agent-alternative-freebuff.ts',
    'web/src/app/docs/[category]/[slug]/page.tsx',
  ])('%s imports canonical data-use copy', (path) => {
    expect(readRepoFile(path)).toContain('FREEBUFF_PUBLIC_DATA_USE_COPY')
  })

  test.each([
    'freebuff/web/src/app/privacy-policy/page.tsx',
    'freebuff/web/src/app/terms-of-service/page.tsx',
    'freebuff/web/src/components/policy-update-notice.tsx',
  ])('%s imports canonical policy metadata', (path) => {
    expect(readRepoFile(path)).toContain('FREEBUFF_POLICY_ROLLOUT')
  })

  test('the policy update banner uses the canonical rollout copy', () => {
    const source = readRepoFile(
      'freebuff/web/src/components/policy-update-notice.tsx',
    )

    expect(source).toContain('FREEBUFF_POLICY_ROLLOUT.notice.title')
    expect(source).toContain('FREEBUFF_POLICY_ROLLOUT.notice.summary')
    expect(source).toContain('Review updates')
    expect(source).toContain('FREEBUFF_POLICY_ROLLOUT.noticeEndsAt')
    expect(source).toContain("'/login'")
    expect(source).toContain("pathname.startsWith('/web/invite/')")
    expect(source).not.toContain("'upcoming'")
  })

  test.each([
    'freebuff/web/src/components/login/login-card.tsx',
    'freebuff/web/src/app/get-started/get-started-onboarding.tsx',
    'freebuff/web/src/components/creators/auth/creators-auth-page.tsx',
    'freebuff/web/src/app/web/affiliate/page.tsx',
    'freebuff/web/src/app/web/invite/[token]/page.tsx',
  ])('%s shows the shared policy agreement notice', (path) => {
    expect(readRepoFile(path)).toContain('PolicyAgreementNotice')
  })

  test('the shared login notice uses the requested acceptance language', () => {
    const source = readRepoFile(
      'freebuff/web/src/components/policy-agreement-notice.tsx',
    )

    expect(source).toContain('By continuing, you agree to the')
    expect(source).toContain('Terms')
  })

  test.each([
    'freebuff/web/src/app/privacy-policy/page.tsx',
    'freebuff/web/src/app/terms-of-service/page.tsx',
  ])('%s is updated for the July 23 rollout', (path) => {
    expect(readRepoFile(path)).toContain('FREEBUFF_POLICY_ROLLOUT.lastUpdated')
  })

  test('the Privacy Policy keeps explicit training and advertising boundaries', () => {
    const source = readRepoFile('freebuff/web/src/app/privacy-policy/page.tsx')

    expect(FREEBUFF_AI_TRAINING_NOTICE).toContain('AI training')
    expect(source).toContain('FREEBUFF_AI_TRAINING_NOTICE')
    expect(source).toContain('legally recognized opt-out preference')
    expect(source).toContain('service providers acting on our')
    expect(source).not.toContain('submitted on or after')
    expect(source).not.toContain('submitted before')
    expect(FREEBUFF_PUBLIC_DATA_USE_COPY.storageAnswer).not.toContain(
      'Starting ',
    )
    expect(source).toMatch(
      /may not\s+use that information for their own independent purposes/,
    )
    expect(source).toContain('fine-tuning')
    expect(source).toContain('legitimate business')
    expect(source).not.toContain('CALIFORNIA_DISCLOSURES')
    expect(source).not.toContain('detect and remove credentials')
    expect(source).not.toContain('designed not to include raw prompts')
    expect(source).not.toContain(
      'Raw prompts and messages used for advertising',
    )
    expect(source).not.toContain('longer-term advertising profile')

    for (const vendor of [
      'Fireworks AI',
      'OpenAI',
      'OpenRouter',
      'Anthropic',
      'Convex',
      'PostHog',
      'Axiom',
      'Reddit',
    ]) {
      expect(source).not.toContain(vendor)
    }
  })

  test('the Terms retain the requested consumer safeguards', () => {
    const source = readRepoFile(
      'freebuff/web/src/app/terms-of-service/page.tsx',
    )

    expect(source).toContain('AI Output and Actions')
    expect(source).toContain('third-party claims')
    expect(source).toContain('GREATER OF $100')
    expect(source).toContain('San Francisco County')
    expect(source).toContain('advance notice when required by law')
    expect(source).toMatch(
      /provide,\s+maintain,\s+develop,\s+evaluate,\s+improve/,
    )
    expect(source).toMatch(/Freebuff, Inc\.\s+has/)
    expect(source).not.toContain('damage or falsify Company rating')
  })

  test('retired privacy claims do not reappear on public surfaces', () => {
    const publicPaths = [
      'README.md',
      'freebuff/cli/release/README.md',
      'freebuff/web/src/lib/home-faqs.ts',
      'freebuff/web/src/components/landing',
      'freebuff/web/src/vly/components/pages',
      'freebuff/web/src/lib/blog/posts',
      'freebuff/web/scripts/generate-cli-blog-posts.ts',
      'landing-lab/src',
      'web/src/content',
      'web/src/app/docs/[category]/[slug]/page.tsx',
    ].flatMap(listPublicTextFiles)

    const retiredClaims = [
      /we (?:do not|don't) store your codebase/i,
      /only collect minimal logs/i,
      /we (?:do not|don't) share your (?:data|repo|code) with third parties that would train/i,
      /we do not train on your data/i,
      /no training on your code/i,
      /your code is never used for training/i,
      /logs[^.]*not shared with third parties/i,
      /only use information from your current session context/i,
      /privacy mode[^.]*won't store/i,
      /(?:code|codebase|repo(?:sitory)?) (?:never|doesn['’]t|does not) leave (?:your|the) (?:machine|laptop)/i,
      /your code stays local/i,
      /no upload required/i,
      /stored locally \(and nowhere else\)/i,
      /no telemetry attached to your code/i,
      /tracking pixel anywhere near your repo/i,
      /the server is stateless/i,
      /local-first[^.]*privacy/i,
    ]

    for (const path of publicPaths) {
      const source = readRepoFile(path)
      for (const retiredClaim of retiredClaims) {
        if (retiredClaim.test(source)) {
          throw new Error(`${path} contains retired claim ${retiredClaim}`)
        }
      }
    }
  })
})
