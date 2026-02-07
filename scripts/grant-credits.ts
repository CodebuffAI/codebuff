import { createInterface } from 'readline'

import { generateCompactId } from '@codebuff/common/util/string'
import db from '@codebuff/internal/db'
import * as schema from '@codebuff/internal/db/schema'
import { eq } from 'drizzle-orm'

function prompt(rl: ReturnType<typeof createInterface>, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()))
  })
}

async function lookupUserByEmail(email: string) {
  const [user] = await db
    .select({ id: schema.user.id, email: schema.user.email, name: schema.user.name })
    .from(schema.user)
    .where(eq(schema.user.email, email.toLowerCase()))
    .limit(1)
  return user ?? null
}

async function lookupUserById(userId: string) {
  const [user] = await db
    .select({ id: schema.user.id, email: schema.user.email, name: schema.user.name })
    .from(schema.user)
    .where(eq(schema.user.id, userId))
    .limit(1)
  return user ?? null
}

async function main() {
  const rl = createInterface({ input: process.stdin, output: process.stdout })

  try {
    // 1. Get user by email or ID
    const userInput = await prompt(rl, 'Enter user email or user ID: ')
    if (!userInput) {
      console.error('No input provided.')
      process.exit(1)
    }

    const isEmail = userInput.includes('@')
    const user = isEmail
      ? await lookupUserByEmail(userInput)
      : await lookupUserById(userInput)

    if (!user) {
      console.error(`User not found: ${userInput}`)
      process.exit(1)
    }

    console.log(`\nFound user: ${user.name ?? '(no name)'} <${user.email}> (${user.id})`)

    // 2. Get credit amount
    const amountStr = await prompt(rl, 'Enter credit amount (integer): ')
    const amount = parseInt(amountStr, 10)
    if (isNaN(amount) || amount <= 0) {
      console.error('Amount must be a positive integer.')
      process.exit(1)
    }

    // 3. Get description
    const description = await prompt(rl, 'Enter description: ')
    if (!description) {
      console.error('Description is required.')
      process.exit(1)
    }

    // 4. Generate operation ID
    const operationId = `admin-${user.id}-${generateCompactId()}`

    // 5. Confirm
    console.log('\n--- Credit Grant Summary ---')
    console.log(`  User:         ${user.name ?? '(no name)'} <${user.email}>`)
    console.log(`  User ID:      ${user.id}`)
    console.log(`  Amount:       ${amount}`)
    console.log(`  Type:         admin`)
    console.log(`  Priority:     50`)
    console.log(`  Expires:      never`)
    console.log(`  Description:  ${description}`)
    console.log(`  Operation ID: ${operationId}`)
    console.log('----------------------------\n')

    const confirm = await prompt(rl, 'Proceed? (y/N): ')
    if (!/^[Yy]$/.test(confirm)) {
      console.log('Aborted.')
      process.exit(0)
    }

    // 6. Insert into credit_ledger
    await db.insert(schema.creditLedger).values({
      operation_id: operationId,
      user_id: user.id,
      principal: amount,
      balance: amount,
      type: 'admin',
      description,
      priority: 50,
      expires_at: null,
    })

    console.log(`\n✅ Granted ${amount} credits to ${user.email} (${operationId})`)
  } finally {
    rl.close()
  }

  process.exit(0)
}

main().catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})
