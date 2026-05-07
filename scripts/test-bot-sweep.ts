/**
 * One-off runner to execute the bot-sweep pipeline directly (bypassing the
 * HTTP endpoint) and email the result. Use this to exercise
 * identifyBotSuspects + formatSweepReport + sendBasicEmail end-to-end before
 * the GitHub Action is wired up.
 *
 * usage:  infisical run --env=prod --path=/ -- bun scripts/test-bot-sweep.ts
 */

import { sendBasicEmail } from '@codebuff/internal/loops/client'

import {
  formatSweepReport,
  identifyBotSuspects,
} from '../web/src/server/free-session/abuse-detection'
import { reviewSuspects } from '../web/src/server/free-session/abuse-review'

const RECIPIENT = process.env.BOT_SWEEP_TEST_RECIPIENT ?? 'james@codebuff.com'

const logger = {
  debug: (...args: any[]) => console.log('[debug]', ...args),
  info: (...args: any[]) => console.log('[info]', ...args),
  warn: (...args: any[]) => console.log('[warn]', ...args),
  error: (...args: any[]) => console.log('[error]', ...args),
}

async function main() {
  console.log('Running identifyBotSuspects…')
  const report = await identifyBotSuspects({ logger })

  const { subject, message } = formatSweepReport(report)
  console.log('\n--- SUBJECT ---')
  console.log(subject)
  console.log('\n--- RULE-BASED BODY ---')
  console.log(message)

  console.log('\nRunning agent review (Claude Sonnet 4.6)…')
  const agentReview = await reviewSuspects({ report, logger })
  if (agentReview) {
    console.log('\n--- AGENT REVIEW ---')
    console.log(agentReview)
  } else {
    console.log('(agent review returned null — falling back to rule-only)')
  }
  console.log('\n--- END ---')

  const fullMessage = agentReview
    ? `=== AGENT REVIEW (Claude Sonnet 4.6) ===\n\n${agentReview}\n\n=== RAW RULE-BASED DATA ===\n\n${message}`
    : message

  console.log(`\nSending email to ${RECIPIENT}…`)
  const result = await sendBasicEmail({
    email: RECIPIENT,
    data: { subject, message: fullMessage },
    logger,
  })

  if (result.success) {
    console.log(`✅ Email sent (loopsId=${result.loopsId ?? 'n/a'})`)
  } else {
    console.error(`❌ Email failed: ${result.error}`)
    process.exit(1)
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
