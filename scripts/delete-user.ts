import { createInterface } from 'readline'

import db from '@codebuff/internal/db'
import * as schema from '@codebuff/internal/db/schema'
import { eq, sql } from 'drizzle-orm'

type TargetKind = 'auto' | 'email' | 'user-id'

type Options = {
  target: string
  targetKind: TargetKind
  execute: boolean
  deleteOwnedOrgs: boolean
  yes: boolean
}

type UserSummary = {
  id: string
  email: string
  name: string | null
  stripe_customer_id: string | null
}

type OrgSummary = {
  id: string
  name: string
  slug: string
}

type PublisherSummary = {
  id: string
  name: string
  org_id: string | null
}

type Plan = {
  ownedOrgs: OrgSummary[]
  publishersToDelete: PublisherSummary[]
  counts: Array<{ label: string; count: number }>
}

type CountRow = {
  label: string
  count: number | string
}

function usage(exitCode = 1): never {
  console.error(`usage:
  bun scripts/delete-user.ts <email-or-user-id>
  bun scripts/delete-user.ts --email <email> [--execute] [--yes]
  bun scripts/delete-user.ts --user-id <id> [--execute] [--yes]

Options:
  --execute            Actually delete data. Without this, prints a dry-run plan.
  --delete-owned-orgs  Also delete organizations owned by the user. This can delete
                       org members, org billing rows, org repos, and org messages.
  --yes                Skip the interactive confirmation prompt.

Notes:
  This only deletes from Postgres. Stripe, BigQuery, Loops, and other external
  systems are intentionally not modified by this script.`)
  process.exit(exitCode)
}

function parseArgs(argv: string[]): Options {
  let target: string | undefined
  let targetKind: TargetKind = 'auto'
  let execute = false
  let deleteOwnedOrgs = false
  let yes = false

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    switch (arg) {
      case '--email':
      case '--user-id': {
        const value = argv[i + 1]
        if (!value || value.startsWith('--')) usage()
        if (target) usage()
        target = value
        targetKind = arg === '--email' ? 'email' : 'user-id'
        i += 1
        break
      }
      case '--execute':
        execute = true
        break
      case '--delete-owned-orgs':
        deleteOwnedOrgs = true
        break
      case '--yes':
      case '-y':
        yes = true
        break
      case '--help':
      case '-h':
        usage(0)
        break
      default:
        if (arg.startsWith('--')) usage()
        if (target) usage()
        target = arg
    }
  }

  if (!target) usage()
  return { target, targetKind, execute, deleteOwnedOrgs, yes }
}

function prompt(
  rl: ReturnType<typeof createInterface>,
  question: string,
): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()))
  })
}

async function lookupUser(
  target: string,
  targetKind: TargetKind,
): Promise<UserSummary | null> {
  const lookupKind =
    targetKind === 'auto'
      ? target.includes('@')
        ? 'email'
        : 'user-id'
      : targetKind
  const normalized = target.toLowerCase()
  const [user] = await db
    .select({
      id: schema.user.id,
      email: schema.user.email,
      name: schema.user.name,
      stripe_customer_id: schema.user.stripe_customer_id,
    })
    .from(schema.user)
    .where(
      lookupKind === 'email'
        ? sql`lower(${schema.user.email}) = ${normalized}`
        : eq(schema.user.id, target),
    )
    .limit(1)

  return user ?? null
}

async function collectPlan(
  user: UserSummary,
  deleteOwnedOrgs: boolean,
): Promise<Plan> {
  const emailLower = user.email.toLowerCase()
  const ownedOrgLabel = deleteOwnedOrgs
    ? 'owned org rows deleted'
    : 'owned org rows (execution blocked without --delete-owned-orgs)'

  const ownedOrgs = await db
    .select({
      id: schema.org.id,
      name: schema.org.name,
      slug: schema.org.slug,
    })
    .from(schema.org)
    .where(eq(schema.org.owner_id, user.id))

  const publishersToDelete = (await db.execute(sql`
    WITH owned_orgs AS (
      SELECT id FROM ${schema.org} WHERE owner_id = ${user.id}
    )
    SELECT p.id, p.name, p.org_id
    FROM ${schema.publisher} p
    WHERE p.user_id = ${user.id}
       OR (
         ${deleteOwnedOrgs}
         AND p.org_id IN (SELECT id FROM owned_orgs)
       )
    ORDER BY p.id
  `)) as PublisherSummary[]

  const countRows = (await db.execute(sql`
    WITH owned_orgs AS (
      SELECT id FROM ${schema.org} WHERE owner_id = ${user.id}
    ),
    publishers_to_delete AS (
      SELECT p.id
      FROM ${schema.publisher} p
      WHERE p.user_id = ${user.id}
         OR (
           ${deleteOwnedOrgs}
           AND p.org_id IN (SELECT id FROM owned_orgs)
         )
    )
    SELECT ${'verificationToken rows for email'} AS label, (SELECT COUNT(*) FROM ${schema.verificationToken} WHERE lower(identifier) = ${emailLower})::int AS count
    UNION ALL SELECT ${'referral rows where referrer/referred'}, (SELECT COUNT(*) FROM ${schema.referral} WHERE referrer_id = ${user.id} OR referred_id = ${user.id})::int
    UNION ALL SELECT ${'account rows'}, (SELECT COUNT(*) FROM ${schema.account} WHERE "userId" = ${user.id})::int
    UNION ALL SELECT ${'session rows'}, (SELECT COUNT(*) FROM ${schema.session} WHERE "userId" = ${user.id})::int
    UNION ALL SELECT ${'encrypted_api_keys rows'}, (SELECT COUNT(*) FROM ${schema.encryptedApiKeys} WHERE user_id = ${user.id})::int
    UNION ALL SELECT ${'message rows for user'}, (SELECT COUNT(*) FROM ${schema.message} WHERE user_id = ${user.id})::int
    UNION ALL SELECT ${'credit_ledger rows for user'}, (SELECT COUNT(*) FROM ${schema.creditLedger} WHERE user_id = ${user.id})::int
    UNION ALL SELECT ${'subscription rows for user/customer'}, (SELECT COUNT(*) FROM ${schema.subscription} WHERE user_id = ${user.id} OR (${user.stripe_customer_id}::text IS NOT NULL AND stripe_customer_id = ${user.stripe_customer_id}))::int
    UNION ALL SELECT ${'ad_impression rows'}, (SELECT COUNT(*) FROM ${schema.adImpression} WHERE user_id = ${user.id})::int
    UNION ALL SELECT ${'limit_override rows'}, (SELECT COUNT(*) FROM ${schema.limitOverride} WHERE user_id = ${user.id})::int
    UNION ALL SELECT ${'agent_run rows'}, (SELECT COUNT(*) FROM ${schema.agentRun} WHERE user_id = ${user.id})::int
    UNION ALL SELECT ${'agent_step rows through agent_run'}, (SELECT COUNT(*) FROM ${schema.agentStep} s JOIN ${schema.agentRun} r ON r.id = s.agent_run_id WHERE r.user_id = ${user.id})::int
    UNION ALL SELECT ${'free_session rows'}, (SELECT COUNT(*) FROM ${schema.freeSession} WHERE user_id = ${user.id})::int
    UNION ALL SELECT ${'free_mode_country_access_cache rows'}, (SELECT COUNT(*) FROM ${schema.freeModeCountryAccessCache} WHERE user_id = ${user.id})::int
    UNION ALL SELECT ${'free_session_admit rows'}, (SELECT COUNT(*) FROM ${schema.freeSessionAdmit} WHERE user_id = ${user.id})::int
    UNION ALL SELECT ${'org_member rows for user'}, (SELECT COUNT(*) FROM ${schema.orgMember} WHERE user_id = ${user.id})::int
    UNION ALL SELECT ${'org_repo rows approved by user, reassigned outside owned orgs'}, (SELECT COUNT(*) FROM ${schema.orgRepo} r JOIN ${schema.org} o ON o.id = r.org_id WHERE r.approved_by = ${user.id} AND o.owner_id <> ${user.id})::int
    UNION ALL SELECT ${'org_invite rows invited by user, reassigned outside owned orgs'}, (SELECT COUNT(*) FROM ${schema.orgInvite} i JOIN ${schema.org} o ON o.id = i.org_id WHERE i.invited_by = ${user.id} AND o.owner_id <> ${user.id})::int
    UNION ALL SELECT ${'org_invite rows accepted by user, cleared'}, (SELECT COUNT(*) FROM ${schema.orgInvite} WHERE accepted_by = ${user.id})::int
    UNION ALL SELECT ${'org_invite rows sent to user email'}, (SELECT COUNT(*) FROM ${schema.orgInvite} WHERE lower(email) = ${emailLower})::int
    UNION ALL SELECT ${'publisher rows created by user, reassigned outside owned orgs'}, (SELECT COUNT(*) FROM ${schema.publisher} p JOIN ${schema.org} o ON o.id = p.org_id WHERE p.created_by = ${user.id} AND p.user_id IS NULL AND o.owner_id <> ${user.id})::int
    UNION ALL SELECT ${'publisher rows created by user, reassigned to user owner'}, (SELECT COUNT(*) FROM ${schema.publisher} WHERE created_by = ${user.id} AND user_id IS NOT NULL AND user_id <> ${user.id})::int
    UNION ALL SELECT ${'publisher rows with user email, cleared if retained'}, (SELECT COUNT(*) FROM ${schema.publisher} WHERE lower(email) = ${emailLower})::int
    UNION ALL SELECT ${'publisher rows deleted'}, (SELECT COUNT(*) FROM publishers_to_delete)::int
    UNION ALL SELECT ${'agent_config rows through deleted publishers'}, (SELECT COUNT(*) FROM ${schema.agentConfig} WHERE publisher_id IN (SELECT id FROM publishers_to_delete))::int
    UNION ALL SELECT ${ownedOrgLabel}, (SELECT COUNT(*) FROM owned_orgs)::int
    UNION ALL SELECT ${'message rows through owned orgs'}, (SELECT COUNT(*) FROM ${schema.message} WHERE org_id IN (SELECT id FROM owned_orgs))::int
    UNION ALL SELECT ${'credit_ledger rows through owned orgs'}, (SELECT COUNT(*) FROM ${schema.creditLedger} WHERE org_id IN (SELECT id FROM owned_orgs))::int
    UNION ALL SELECT ${'org_member rows through owned orgs'}, (SELECT COUNT(*) FROM ${schema.orgMember} WHERE org_id IN (SELECT id FROM owned_orgs))::int
    UNION ALL SELECT ${'org_repo rows through owned orgs'}, (SELECT COUNT(*) FROM ${schema.orgRepo} WHERE org_id IN (SELECT id FROM owned_orgs))::int
    UNION ALL SELECT ${'org_invite rows through owned orgs'}, (SELECT COUNT(*) FROM ${schema.orgInvite} WHERE org_id IN (SELECT id FROM owned_orgs))::int
    UNION ALL SELECT ${'org_feature rows through owned orgs'}, (SELECT COUNT(*) FROM ${schema.orgFeature} WHERE org_id IN (SELECT id FROM owned_orgs))::int
    UNION ALL SELECT ${'user row'}, 1
  `)) as CountRow[]

  const counts = countRows
    .map(({ label, count }) => ({ label, count: Number(count) }))
    .filter(({ count }) => count > 0)

  return { ownedOrgs, publishersToDelete, counts }
}

function printPlan(user: UserSummary, plan: Plan, options: Options) {
  console.log('User deletion plan')
  console.log('------------------')
  console.log(`User:    ${user.email} (${user.id})`)
  console.log(`Name:    ${user.name ?? '(no name)'}`)
  console.log(`Stripe:  ${user.stripe_customer_id ?? '(none)'}`)
  console.log(`Mode:    ${options.execute ? 'EXECUTE' : 'DRY RUN'}`)

  if (plan.ownedOrgs.length > 0) {
    console.log('\nOwned organizations:')
    for (const org of plan.ownedOrgs) {
      console.log(`  ${org.name} (${org.slug}, ${org.id})`)
    }
    if (!options.deleteOwnedOrgs) {
      console.log(
        '\nExecution will stop unless --delete-owned-orgs is passed, because deleting an org owner can remove shared organization data.',
      )
    }
  }

  if (plan.publishersToDelete.length > 0) {
    console.log('\nPublishers to delete:')
    for (const publisher of plan.publishersToDelete) {
      console.log(
        `  ${publisher.name} (${publisher.id})${
          publisher.org_id ? ` org=${publisher.org_id}` : ''
        }`,
      )
    }
  }

  console.log('\nRows affected or cascaded:')
  for (const { label, count } of plan.counts) {
    console.log(`  ${String(count).padStart(8)}  ${label}`)
  }
}

async function confirmExecution(user: UserSummary, options: Options) {
  if (!options.execute || options.yes) return

  if (!process.stdin.isTTY) {
    throw new Error('Refusing to execute without an interactive TTY or --yes.')
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout })
  try {
    const expected = user.email.toLowerCase()
    const answer = await prompt(
      rl,
      `\nType ${expected} to permanently delete this Postgres user: `,
    )
    if (answer.toLowerCase() !== expected) {
      console.log('Aborted.')
      process.exit(0)
    }
  } finally {
    rl.close()
  }
}

async function executeDeletion(user: UserSummary, options: Options) {
  const emailLower = user.email.toLowerCase()

  await db.transaction(async (tx) => {
    if (!options.deleteOwnedOrgs) {
      const ownedOrgRows = await tx
        .select({ id: schema.org.id })
        .from(schema.org)
        .where(eq(schema.org.owner_id, user.id))
        .limit(1)

      if (ownedOrgRows.length > 0) {
        throw new Error(
          'User owns organizations. Re-run with --delete-owned-orgs to delete them, or transfer ownership first.',
        )
      }
    }

    await tx.execute(sql`
      DELETE FROM ${schema.verificationToken}
      WHERE lower(identifier) = ${emailLower}
    `)

    await tx.execute(sql`
      DELETE FROM ${schema.referral}
      WHERE referrer_id = ${user.id} OR referred_id = ${user.id}
    `)

    await tx.execute(sql`
      DELETE FROM ${schema.orgInvite}
      WHERE lower(email) = ${emailLower}
    `)

    await tx.execute(sql`
      UPDATE ${schema.orgInvite}
      SET accepted_by = NULL
      WHERE accepted_by = ${user.id}
    `)

    await tx.execute(sql`
      UPDATE ${schema.orgInvite} i
      SET invited_by = o.owner_id
      FROM ${schema.org} o
      WHERE o.id = i.org_id
        AND i.invited_by = ${user.id}
        AND o.owner_id <> ${user.id}
    `)

    await tx.execute(sql`
      UPDATE ${schema.orgRepo} r
      SET approved_by = o.owner_id
      FROM ${schema.org} o
      WHERE o.id = r.org_id
        AND r.approved_by = ${user.id}
        AND o.owner_id <> ${user.id}
    `)

    await tx.execute(sql`
      UPDATE ${schema.publisher} p
      SET created_by = o.owner_id
      FROM ${schema.org} o
      WHERE o.id = p.org_id
        AND p.created_by = ${user.id}
        AND p.user_id IS NULL
        AND o.owner_id <> ${user.id}
    `)

    await tx.execute(sql`
      UPDATE ${schema.publisher}
      SET created_by = user_id
      WHERE created_by = ${user.id}
        AND user_id IS NOT NULL
        AND user_id <> ${user.id}
    `)

    await tx.execute(sql`
      UPDATE ${schema.publisher}
      SET email = NULL
      WHERE lower(email) = ${emailLower}
    `)

    await tx.execute(sql`
      WITH publishers_to_delete AS (
        SELECT p.id
        FROM ${schema.publisher} p
        WHERE p.user_id = ${user.id}
           OR (
             ${options.deleteOwnedOrgs}
             AND p.org_id IN (
               SELECT id FROM ${schema.org} WHERE owner_id = ${user.id}
             )
           )
      )
      DELETE FROM ${schema.agentConfig} ac
      USING publishers_to_delete ptd
      WHERE ac.publisher_id = ptd.id
    `)

    await tx.execute(sql`
      DELETE FROM ${schema.publisher} p
      WHERE p.user_id = ${user.id}
         OR (
           ${options.deleteOwnedOrgs}
           AND p.org_id IN (
             SELECT id FROM ${schema.org} WHERE owner_id = ${user.id}
           )
         )
    `)

    await tx.execute(sql`
      DELETE FROM ${schema.subscription}
      WHERE user_id = ${user.id}
         OR (
           ${user.stripe_customer_id}::text IS NOT NULL
           AND stripe_customer_id = ${user.stripe_customer_id}
         )
    `)

    if (options.deleteOwnedOrgs) {
      await tx.execute(sql`
        DELETE FROM ${schema.org}
        WHERE owner_id = ${user.id}
      `)
    }

    await tx.delete(schema.user).where(eq(schema.user.id, user.id))
  })
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const user = await lookupUser(options.target, options.targetKind)
  if (!user) {
    console.error(`User not found: ${options.target}`)
    process.exit(1)
  }

  const plan = await collectPlan(user, options.deleteOwnedOrgs)
  printPlan(user, plan, options)

  if (!options.execute) {
    console.log('\nDRY RUN: pass --execute to delete these Postgres rows.')
    return
  }

  await confirmExecution(user, options)
  await executeDeletion(user, options)

  const remaining = await lookupUser(user.id, 'user-id')
  if (remaining) {
    throw new Error(`Delete finished but user row still exists: ${user.id}`)
  }

  console.log(`\nDeleted Postgres user ${user.email} (${user.id}).`)
  console.log('External systems were not modified.')
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
