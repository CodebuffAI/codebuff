import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core'

import type { SQL } from 'drizzle-orm'

import { agentRunStatus, agentStepStatus } from './enums'
import { org } from './organizations'
import { user } from './users'

export const publisher = pgTable(
  'publisher',
  {
    id: text('id').primaryKey().notNull(), // user-selectable id (must match /^[a-z0-9-]+$/)
    name: text('name').notNull(),
    email: text('email'), // optional, for support
    verified: boolean('verified').notNull().default(false),
    bio: text('bio'),
    avatar_url: text('avatar_url'),

    // Ownership - exactly one must be set
    user_id: text('user_id').references(() => user.id, {
      onDelete: 'no action',
    }),
    org_id: text('org_id').references(() => org.id, { onDelete: 'no action' }),

    created_by: text('created_by')
      .notNull()
      .references(() => user.id),
    created_at: timestamp('created_at', { mode: 'date', withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { mode: 'date', withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // Constraint to ensure exactly one owner type
    check(
      'publisher_single_owner',
      sql`(${table.user_id} IS NOT NULL AND ${table.org_id} IS NULL) OR
    (${table.user_id} IS NULL AND ${table.org_id} IS NOT NULL)`,
    ),
  ],
)

export const agentConfig = pgTable(
  'agent_config',
  {
    id: text('id')
      .notNull()
      .$defaultFn(() => crypto.randomUUID()),
    version: text('version').notNull(), // Semantic version e.g., '1.0.0'
    publisher_id: text('publisher_id')
      .notNull()
      .references(() => publisher.id),
    major: integer('major').generatedAlwaysAs(
      (): SQL =>
        sql`CAST(SPLIT_PART(${agentConfig.version}, '.', 1) AS INTEGER)`,
    ),
    minor: integer('minor').generatedAlwaysAs(
      (): SQL =>
        sql`CAST(SPLIT_PART(${agentConfig.version}, '.', 2) AS INTEGER)`,
    ),
    patch: integer('patch').generatedAlwaysAs(
      (): SQL =>
        sql`CAST(SPLIT_PART(${agentConfig.version}, '.', 3) AS INTEGER)`,
    ),
    data: jsonb('data').notNull(), // All agentConfig details
    created_at: timestamp('created_at', { mode: 'date', withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { mode: 'date', withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.publisher_id, table.id, table.version] }),
    index('idx_agent_config_publisher').on(table.publisher_id),
  ],
)

export const agentRun = pgTable(
  'agent_run',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    // Identity and relationships
    user_id: text('user_id').references(() => user.id, { onDelete: 'cascade' }),

    // Agent identity (either "publisher/agent@version" OR a plain string with no '/' or '@')
    agent_id: text('agent_id').notNull(),

    // Agent identity (full versioned ID like "CodebuffAI/reviewer@1.0.0")
    publisher_id: text('publisher_id').generatedAlwaysAs(
      sql`CASE
             WHEN agent_id ~ '^[^/@]+/[^/@]+@[^/@]+$'
               THEN split_part(agent_id, '/', 1)
             ELSE NULL
           END`,
    ),
    // agent_name: middle part for full pattern; otherwise the whole id
    agent_name: text('agent_name').generatedAlwaysAs(
      sql`CASE
             WHEN agent_id ~ '^[^/@]+/[^/@]+@[^/@]+$'
               THEN split_part(split_part(agent_id, '/', 2), '@', 1)
             ELSE agent_id
           END`,
    ),
    agent_version: text('agent_version').generatedAlwaysAs(
      sql`CASE
             WHEN agent_id ~ '^[^/@]+/[^/@]+@[^/@]+$'
               THEN split_part(agent_id, '@', 2)
             ELSE NULL
           END`,
    ),

    // Hierarchy tracking
    ancestor_run_ids: text('ancestor_run_ids').array(), // array of ALL run IDs from root (inclusive) to self (exclusive)
    // Derived from ancestor_run_ids - root is first element
    root_run_id: text('root_run_id').generatedAlwaysAs(
      sql`CASE WHEN array_length(ancestor_run_ids, 1) >= 1 THEN ancestor_run_ids[1] ELSE id END`,
    ),
    // Derived from ancestor_run_ids - parent is second-to-last element
    parent_run_id: text('parent_run_id').generatedAlwaysAs(
      sql`CASE WHEN array_length(ancestor_run_ids, 1) >= 1 THEN ancestor_run_ids[array_length(ancestor_run_ids, 1)] ELSE NULL END`,
    ),
    // Derived from ancestor_run_ids - depth is array length minus 1
    depth: integer('depth').generatedAlwaysAs(
      sql`COALESCE(array_length(ancestor_run_ids, 1), 1)`,
    ),

    // Performance metrics
    duration_ms: integer('duration_ms').generatedAlwaysAs(
      sql`CASE WHEN completed_at IS NOT NULL THEN EXTRACT(EPOCH FROM (completed_at - created_at)) * 1000 ELSE NULL END::integer`,
    ), // total time from start to completion in milliseconds
    total_steps: integer('total_steps').default(0), // denormalized count

    // Credit tracking
    direct_credits: numeric('direct_credits', {
      precision: 10,
      scale: 6,
    }).default('0'), // credits used by this agent only
    total_credits: numeric('total_credits', {
      precision: 10,
      scale: 6,
    }).default('0'), // credits used by this agent + all descendants

    // Status tracking
    status: agentRunStatus('status').notNull().default('running'),
    error_message: text('error_message'),

    // Timestamps
    created_at: timestamp('created_at', { mode: 'date', withTimezone: true })
      .notNull()
      .defaultNow(),
    completed_at: timestamp('completed_at', {
      mode: 'date',
      withTimezone: true,
    }),
  },
  (table) => [
    // Performance indices
    index('idx_agent_run_user_id').on(table.user_id, table.created_at),
    index('idx_agent_run_parent').on(table.parent_run_id),
    index('idx_agent_run_root').on(table.root_run_id),
    index('idx_agent_run_agent_id').on(table.agent_id, table.created_at),
    index('idx_agent_run_publisher').on(table.publisher_id, table.created_at),
    index('idx_agent_run_status')
      .on(table.status)
      .where(sql`${table.status} = 'running'`),
    index('idx_agent_run_ancestors_gin').using('gin', table.ancestor_run_ids),
    // Performance indexes for agent store
    index('idx_agent_run_completed_publisher_agent')
      .on(table.publisher_id, table.agent_name)
      .where(sql`${table.status} = 'completed'`),
    index('idx_agent_run_completed_recent')
      .on(table.created_at, table.publisher_id, table.agent_name)
      .where(sql`${table.status} = 'completed'`),
    index('idx_agent_run_completed_version')
      .on(
        table.publisher_id,
        table.agent_name,
        table.agent_version,
        table.created_at,
      )
      .where(sql`${table.status} = 'completed'`),
    index('idx_agent_run_completed_user')
      .on(table.user_id)
      .where(sql`${table.status} = 'completed'`),
  ],
)

export const agentStep = pgTable(
  'agent_step',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    // Relationship to run
    agent_run_id: text('agent_run_id')
      .notNull()
      .references(() => agentRun.id, { onDelete: 'cascade' }),
    step_number: integer('step_number').notNull(), // sequential within the run

    // Performance metrics
    duration_ms: integer('duration_ms').generatedAlwaysAs(
      sql`CASE WHEN completed_at IS NOT NULL THEN EXTRACT(EPOCH FROM (completed_at - created_at)) * 1000 ELSE NULL END::integer`,
    ), // total time from start to completion in milliseconds
    credits: numeric('credits', {
      precision: 10,
      scale: 6,
    })
      .notNull()
      .default('0'), // credits used by this step

    // Spawned agents tracking
    child_run_ids: text('child_run_ids').array(), // array of agent_run IDs created by this step
    spawned_count: integer('spawned_count').generatedAlwaysAs(
      sql`array_length(child_run_ids, 1)`,
    ),

    // Message tracking (if applicable)
    message_id: text('message_id'), // reference to message table if needed

    // Status
    status: agentStepStatus('status').notNull().default('completed'),
    error_message: text('error_message'),

    // Timestamps
    created_at: timestamp('created_at', { mode: 'date', withTimezone: true })
      .notNull()
      .defaultNow(),
    completed_at: timestamp('completed_at', {
      mode: 'date',
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // Unique constraint for step numbers per run
    uniqueIndex('unique_step_number_per_run').on(
      table.agent_run_id,
      table.step_number,
    ),
    // Performance indices
    index('idx_agent_step_run_id').on(table.agent_run_id),
    index('idx_agent_step_children_gin').using('gin', table.child_run_ids),
  ],
)

export type GitEvalMetadata = {
  numCases?: number // Number of eval cases successfully run (total)
  avgScore?: number // Average score across all cases
  avgCompletion?: number // Average completion across all cases
  avgEfficiency?: number // Average efficiency across all cases
  avgCodeQuality?: number // Average code quality across all cases
  avgDuration?: number // Average duration across all cases
  suite?: string // Name of the repo (eg: codebuff, manifold)
  avgTurns?: number // Average number of user turns across all cases
}

// Request type for the insert API
export interface GitEvalResultRequest {
  cost_mode?: string
  reasoner_model?: string
  agent_model?: string
  metadata?: GitEvalMetadata
  cost?: number
}

export const gitEvalResults = pgTable('git_eval_results', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  cost_mode: text('cost_mode'),
  reasoner_model: text('reasoner_model'),
  agent_model: text('agent_model'),
  metadata: jsonb('metadata'), // GitEvalMetadata
  cost: integer('cost').notNull().default(0),
  is_public: boolean('is_public').notNull().default(false),
  created_at: timestamp('created_at', { mode: 'date', withTimezone: true })
    .notNull()
    .defaultNow(),
})
