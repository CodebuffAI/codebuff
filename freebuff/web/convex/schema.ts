import { defineSchema, defineTable } from 'convex/server'
import { Infer, v } from 'convex/values'
import { modelValidator } from './utils/registry_validators'
import { PAUSE_REASON_VALIDATOR } from './constants'

// The schema is entirely optional.
// You can delete this file (schema.ts) and the
// app will continue to work.
// The schema provides more precise TypeScript types.

export const integrationTypeValidator = v.union(
  v.literal('user generated'),
  v.literal('official'),
)

export type IntegrationType = Infer<typeof integrationTypeValidator>

export const integrationApprovalStatusValidator = v.union(
  v.literal('pending'),
  v.literal('approved'),
  v.literal('rejected'),
)

export type IntegrationApprovalStatus = Infer<
  typeof integrationApprovalStatusValidator
>

export const errorStatusValidator = v.union(
  v.literal('unresolved'),
  v.literal('resolved'),
  v.literal('dismissed'),
  v.literal('invalidated'),
)

export const ticketStatusValidator = v.union(
  v.literal('open'),
  v.literal('in_progress'),
  v.literal('resolved'),
  v.literal('closed'),
)

export type TicketStatus = Infer<typeof ticketStatusValidator>

export const messageRoleValidator = v.union(
  v.literal('user'),
  v.literal('admin'),
)

export type MessageRole = Infer<typeof messageRoleValidator>

export type ErrorStatus = Infer<typeof errorStatusValidator>

// Organization role types
export type OrgRole = 'org:admin' | 'org:member' | 'org:viewer'
export type OrgPermission = 'read' | 'write' | 'admin' | 'billing'

export default defineSchema(
  {
    users: defineTable({
      name: v.string(),
      email: v.string(),
      profile_image: v.optional(v.string()),
      clerk_id: v.string(),
      freebuff_user_id: v.optional(v.string()),
      role: v.optional(
        v.union(v.literal('god'), v.literal('admin'), v.literal('member')),
      ),
      tier: v.optional(v.union(v.literal('free'), v.literal('pro'))),
      community_badge_tier: v.optional(v.number()), // 0-9 based on subscription tier for community badges
      onboarding_completed: v.optional(v.boolean()),
      referral_code: v.optional(v.string()), // The referral code used during signup
      is_beta: v.optional(v.boolean()), // Beta tester flag for gradual feature rollouts
      interested_in_hiring: v.optional(v.boolean()), // Track interest in hiring developers
      resend_contact_last_synced_email: v.optional(v.string()), // Lowercased email when successfully synced to Resend contacts
      resend_contact_synced_at: v.optional(v.number()), // Last successful sync timestamp
      resend_contact_sync_error: v.optional(v.string()), // Last sync failure reason for debugging
      codex_auth_fingerprint: v.optional(v.string()), // Salted hash of Codex device auth token tuple (never raw tokens)
      codex_auth_encrypted_payload: v.optional(v.string()), // Encrypted Codex auth.json payload for cross-project restore
      codex_auth_encryption_version: v.optional(v.number()), // Encryption payload version for future migrations
      codex_auth_mode: v.optional(v.string()), // Last observed auth_mode from ~/.codex/auth.json
      codex_auth_last_refresh: v.optional(v.string()), // Last observed refresh timestamp from ~/.codex/auth.json
      codex_auth_updated_at: v.optional(v.number()), // Last time auth fingerprint metadata was updated
    })
      .index('by_clerk_id', ['clerk_id'])
      .index('by_freebuff_user_id', ['freebuff_user_id'])
      .index('by_email', ['email'])
      .index('by_referral_code', ['referral_code'])
      .index('by_role', ['role'])
      .index('by_resend_contact_last_synced_email', [
        'resend_contact_last_synced_email',
      ]),
    project: defineTable({
      name: v.optional(v.string()),
      semantic_identifier: v.string(),
      sandbox_id: v.string(),
      old_sandbox_id: v.optional(v.string()), // old (CSB) sandbox id
      state: v.union(
        v.literal('initializing'),
        v.literal('unassigned'),
        v.literal('active'),
        v.literal('processing'),
      ),
      github_url: v.optional(v.string()),
      preview_url: v.optional(v.string()),
      pretty_preview_url: v.optional(v.string()),
      // Screenshot - stores in Cloudflare R2, triggered after 10 agent commits
      screenshot_r2_url: v.optional(v.string()), // Public R2 URL
      screenshot_storage_id: v.optional(v.string()), // DEPRECATED: old Convex storage ID, migrated to R2
      commits_since_screenshot: v.optional(v.number()), // Counter for agent commits

      last_opened: v.optional(v.number()),
      primary_document: v.optional(v.id('document')),
      template_id: v.optional(v.string()),
      custom_instructions: v.optional(v.string()),
      terminated: v.optional(v.boolean()),
      analytics_enabled: v.optional(v.boolean()),
      deleted: v.optional(v.boolean()),

      // Organization context - null for personal projects
      organization_id: v.optional(v.string()),

      // Sandbox size for quota tracking (small, medium, large)
      // If undefined, defaults to "small" (legacy projects from beta era)
      sandbox_size: v.optional(
        v.union(v.literal('small'), v.literal('medium'), v.literal('large')),
      ),

      // Package manager used by the project (pnpm or bun)
      // If undefined, defaults to "bun" for new projects
      packageManager: v.optional(v.union(v.literal('pnpm'), v.literal('bun'))),

      // TODO: delete and clean up. currently still here due to errors
      files_in_context: v.optional(
        v.array(
          v.object({
            file_path: v.string(),
            importance: v.number(),
          }),
        ),
      ),

      // DEPRECATED
      active_workflow_id: v.optional(v.string()), // no longer used. MAY NEED TO BRING BACK FOR CLAUDE CODE

      // DEPRECATED
      active_thread: v.optional(v.id('thread')), // DEPRECATED: Use active_agent_thread for new agent-based threads

      active_agent_thread: v.optional(v.id('agent_thread')), // Active agent thread (Claude Code, Gemini CLI, or Codex)

      prod_deployment_slug: v.optional(v.string()),
      convex_url: v.optional(v.string()),
      spec: v.optional(v.string()),
    })
      .index('by_semantic_identifier', ['semantic_identifier'])
      .index('by_sandbox_id', ['sandbox_id'])
      .index('by_state', ['state'])
      .index('by_prod_deployment_slug', ['prod_deployment_slug'])
      .index('by_organization', ['organization_id']),

    daytona_migration: defineTable({
      project_id: v.id('project'),
      daytona_server: v.optional(
        v.union(v.literal('legacy'), v.literal('new')),
      ),
      migration_status: v.optional(
        v.union(
          v.literal('idle'),
          v.literal('queued'),
          v.literal('copying'),
          v.literal('validating'),
          v.literal('cutting_over'),
          v.literal('done'),
          v.literal('failed'),
        ),
      ),
      migration_error: v.optional(v.string()),
      legacy_sandbox_id: v.optional(v.string()),
      migration_target_sandbox_id: v.optional(v.string()),
      migration_started_at: v.optional(v.number()),
      migration_completed_at: v.optional(v.number()),
      updated_at: v.optional(v.number()),
    })
      .index('by_project_id', ['project_id'])
      .index('by_daytona_server', ['daytona_server'])
      .index('by_migration_status', ['migration_status']),

    // DEPRECATED: Legacy thread format for old message-based system
    // Use agent_thread for new agent-based systems (Claude Code, Gemini CLI, Codex)
    thread: defineTable({
      project: v.id('project'),
      entry_point: v.optional(v.id('entry_point')),
      title: v.optional(v.string()),
      status: v.union(v.literal('active'), v.literal('processing')),
      files_in_context: v.optional(
        v.array(
          v.object({
            file_path: v.string(),
            importance: v.number(),
          }),
        ),
      ),
      // integrations that are in context
      integrations_in_context: v.optional(
        v.array(v.id('integration')), // max 3 integrations. kick off otherwise
      ),
      // Track when the latest external change happened (e.g., versions page revert, git sync)
      // to hide undo buttons for messages that existed before the external change
      latest_external_change_timestamp: v.optional(v.number()),
      // Thread-level chat history compaction state for deterministic prompt assembly.
      compacted_history_summary: v.optional(v.string()),
      compacted_history_up_to_message_time: v.optional(v.number()),
      compacted_history_tokens: v.optional(v.number()),
      compacted_history_message_count: v.optional(v.number()),
      compacted_history_updated_at: v.optional(v.number()),
      compaction_count: v.optional(v.number()),
    }).index('by_project_by_entry_point', ['project']),
    freebuff_agent_runs: defineTable({
      run_id: v.string(),
      work_id: v.optional(v.string()),
      // Optional for compatibility with runs created before usage tracking.
      user_id: v.optional(v.id('users')),
      project_id: v.id('project'),
      thread_id: v.id('agent_thread'),
      message_id: v.id('agent_message'),
      status: v.union(
        v.literal('queued'),
        v.literal('running'),
        v.literal('completed'),
        v.literal('paused'),
        v.literal('error'),
        v.literal('timed_out'),
        v.literal('cancelled'),
      ),
      queued_at: v.number(),
      started_at: v.optional(v.number()),
      last_event_at: v.optional(v.number()),
      completed_at: v.optional(v.number()),
      timed_out_at: v.optional(v.number()),
      error: v.optional(v.string()),
      metered_credits: v.optional(v.number()),
    })
      .index('by_run_id', ['run_id'])
      .index('by_status', ['status'])
      .index('by_status_started_at', ['status', 'started_at']),
    freebuff_daily_usage: defineTable({
      user_id: v.id('users'),
      day: v.string(),
      run_count: v.number(),
      metered_credits: v.number(),
      error_count: v.number(),
      timed_out_count: v.number(),
      last_run_at: v.number(),
    })
      .index('by_user_day', ['user_id', 'day'])
      .index('by_day_metered_credits', ['day', 'metered_credits']),
    temporary_stream: defineTable({
      content: v.string(),
      resolved: v.boolean(),
    }),
    deployments: defineTable({
      project: v.id('project'),
      freestyleDeploymentId: v.optional(v.string()),
      convexDeploymentName: v.optional(v.string()),
      deploymentDomain: v.optional(v.string()),
      state: v.union(
        v.literal('active'),
        v.literal('deploying'),
        v.literal('cancelling'),
        v.literal('cancelled'),
        v.literal('error'),
        v.literal('obsolete'),
      ),
      deploy_status_text: v.optional(v.string()),
      // GitHub deployment integration
      github_deployment_id: v.optional(v.number()),
      github_deployment_url: v.optional(v.string()),
    })
      .index('by_project', ['project'])
      .index('by_project_and_state', ['project', 'state']),

    entry_point: defineTable({
      project: v.id('project'),
      type: v.union(v.literal('page')), // currently only pages are supported
      associated_files: v.array(v.string()), // the files that are associated with the file / page
      abstraction: v.string(), // the abstraction document representing the page
      status: v.union(v.literal('active'), v.literal('processing')), // page status and locking
      canvas_state: v.optional(
        v.object({
          x: v.number(),
          y: v.number(),
        }),
      ),
      // page specific fields
      page: v.optional(
        v.object({
          page_title: v.string(),
          page_display_url: v.string(),
          page_file: v.string(), // the path to the file
          has_dynamic_params: v.boolean(),
          resolved_display_url: v.optional(v.string()),

          // DO THIS LATER
          navigation_paths: v.array(
            v.object({
              navigation_path: v.string(),
              description: v.string(),
              line_number: v.number(),
            }),
          ),
        }),
      ),
      active_thread: v.optional(v.id('thread')),
    })
      .index('by_project', ['project'])
      .index('by_project_and_page_file', ['project', 'page.page_file']),

    // multi member
    project_member: defineTable({
      project: v.id('project'),
      user: v.id('users'),
      project_role: v.union(
        v.literal('member'),
        v.literal('admin'),
        v.literal('owner'),
      ),
    })
      .index('by_project', ['project'])
      .index('by_user', ['user'])
      .index('by_project_and_user', ['project', 'user'])
      .index('by_project_and_role', ['project', 'project_role']),
    // New invites table for project sharing via email.
    invites: defineTable({
      project: v.id('project'),
      email: v.string(),
      token: v.string(),
      expires_at: v.optional(v.number()),
      project_role: v.optional(
        v.union(v.literal('member'), v.literal('admin'), v.literal('owner')),
      ),
    })
      .index('by_project', ['project'])
      .index('by_email', ['email'])
      .index('by_token', ['token']),

    // DEPRECATED: Legacy messages table for old message-based system
    // Use agent_message for new agent-based systems (Claude Code, Gemini CLI, Codex)
    // Old format had separate messages for user/assistant turns
    messages: defineTable({
      project_id: v.id('project'),
      thread: v.optional(v.id('thread')),
      role: v.union(v.literal('user'), v.literal('assistant')),
      selected_entry_point_ids: v.optional(v.array(v.id('entry_point'))),
      reasoningText: v.optional(v.string()), // reasoning for the main ai agent
      content: v.string(), // the streamed ai output or tool call output
      date: v.number(), // date of the message
      streaming: v.boolean(), // whether the message is busy streaming
      isFastReturn: v.optional(v.boolean()), // whether the message is a fast return

      // Images field for storing image storage IDs
      images: v.optional(v.array(v.id('_storage'))),

      object: v.optional(v.string()), // the object that was extracted or tool call that was extracted
      result: v.optional(v.string()), // the resulting response

      summarization: v.optional(v.string()), // paragraph list summarization
      compact_summarization: v.optional(v.string()), // sentence summarization
      code_summarization: v.optional(v.string()), // code summarization

      tool_call: v.optional(v.string()), // the name of the tool used. DEPRECATED

      thinking: v.optional(v.string()), // the thinking that was done

      // just make it do object stuff
      codegen: v.optional(v.array(v.string())), // the secondary file edits
      // TODO: codegen should store more information. such as file path, raw content, parsed content, etc

      error_check: v.optional(v.string()), // the formatted error check result

      file_apply_results: v.optional(
        v.array(
          v.object({
            path: v.string(),
            success: v.boolean(),
            error: v.optional(v.string()),
          }),
        ),
      ),

      core_message: v.optional(v.string()),
      fast_return_preview: v.optional(v.string()),

      // token usage
      token_usage: v.optional(
        v.array(
          v.object({
            input_tokens: v.number(),
            output_tokens: v.number(),
            model: modelValidator,
          }),
        ),
      ),
      // Actual credits deducted (after tier multiplier)
      credits_deducted: v.optional(v.number()),
      total_cost_usd: v.optional(v.number()),
      usage_breakdown: v.optional(
        v.object({
          input_tokens: v.number(),
          cached_input_tokens: v.number(),
          output_tokens: v.number(),
          reasoning_tokens: v.optional(v.number()),
          cache_write_input_tokens: v.optional(v.number()),
          other: v.optional(v.string()),
        }),
      ),
      provider_metadata: v.optional(v.string()),
      // Human-friendly semantic model name (e.g., "GPT 5", "Claude 4 Sonnet")
      model_semantic_name: v.optional(v.string()),
      thread_id: v.optional(v.id('thread')),
      exclude_from_agent_history: v.optional(v.boolean()),

      commit_hash: v.optional(v.string()),
      checkpoint_id: v.optional(v.string()), // Checkpoint identifier (format: projectId_commitHashPrefix)
      deactivated: v.optional(v.boolean()), // whether the message was rolled back

      // AI-generated suggestions that appear after message completion
      suggestions: v.optional(v.array(v.string())), // Array of 3 suggestion strings

      // Message state for tracking current status
      message_state: v.optional(
        v.object({
          status: v.union(
            v.literal('complete'),
            v.literal('error'),
            v.literal('type_errors'),
            v.literal('checking_errors'),
            v.literal('processing_tools'),
            v.literal('streaming'),
            v.literal('thinking'),
            v.literal('insufficient_credits'),
          ),
          message: v.optional(v.string()), // Additional context about the state
          color: v.optional(
            v.union(
              v.literal('green'),
              v.literal('red'),
              v.literal('yellow'),
              v.literal('blue'),
              v.literal('gray'),
              v.literal('orange'),
            ),
          ), // Color coding for the state
          timestamp: v.optional(v.number()), // When the state was last updated
        }),
      ),

      // Temporary context for injection during processing (not permanently stored)
      pageContext: v.optional(v.string()),
      debug_prompt_log: v.optional(v.string()),

      // env vars
      integration_references: v.optional(v.array(v.id('integration'))), // array of integration IDs attached to this message
    })
      .index('by_project_and_date', ['project_id'])
      .index('by_thread', ['thread_id', 'streaming'])
      .index('by_thread_active', ['thread_id', 'streaming', 'deactivated'])
      .index('by_thread_and_commit', ['thread_id', 'commit_hash', 'streaming']),

    // New agent thread format for Claude Code, Gemini CLI, and Codex
    // Combines user and agent turns into a single thread model
    agent_thread: defineTable({
      project_id: v.id('project'),
      title: v.optional(v.string()),
      isProcessing: v.boolean(), // Whether the thread is currently being processed
      last_external_change_timestamp: v.optional(v.number()), // Track when external changes happened (e.g., git sync, reverts)
      agent_type: v.union(
        v.literal('Claude Code'),
        v.literal('Gemini CLI'),
        v.literal('Codex'),
        v.literal('Freebuff'),
      ), // Type of agent handling this thread
      last_edited_timestamp: v.number(), // Timestamp for thread ordering and last activity
      workflow_id: v.optional(v.string()), // Workflow ID from Convex workflow component
      active_session_id: v.optional(v.string()), // Active session ID for resuming conversations
      active_freebuff_run_state_storage_id: v.optional(v.id('_storage')),
      // Selected open-source Freebuff model id for this thread (drives which
      // bundled base2-free agent runs). Defaults to DEFAULT_FREEBUFF_MODEL_ID
      // when unset. Only meaningful for agent_type === 'Freebuff'.
      selected_freebuff_model: v.optional(v.string()),
    }).index('by_project', ['project_id']),

    // New agent message format for Claude Code, Gemini CLI, and Codex
    // Combines user and assistant turns into a single message
    agent_message: defineTable({
      thread_id: v.id('agent_thread'), // Reference to the agent thread
      session_id: v.optional(v.string()), // session id to track conversation sessions and forks. Tracked by message for forking for message rollbacks

      // User message (optional, since some messages might be system-initiated)
      user_message: v.optional(v.string()),

      // Assistant stream: array of stream chunks representing the streamed response
      assistant_stream: v.optional(
        v.array(
          v.object({
            type: v.string(), // could be: text, tool, tool_result, summary, error, etc
            title: v.optional(v.string()),
            status: v.optional(v.string()),
            content: v.string(),
            description: v.optional(v.string()),
          }),
        ),
      ),

      // GitHub integration fields
      commit_hash: v.optional(v.string()), // Git commit hash associated with this message
      checkpoint_id: v.optional(v.string()), // Checkpoint identifier (format: projectId_commitHashPrefix)

      // Message state and status
      deactivated: v.optional(v.boolean()), // Whether the message was rolled back/deactivated
      isStreaming: v.boolean(), // Whether the message is currently streaming
      state: v.union(
        v.literal('Processing'),
        v.literal('Completed'),
        v.literal('Paused'),
        v.literal('Cancelled'),
        v.literal('Error'),
      ), // Current state of the message
      state_message: v.optional(v.string()), // Additional context about the state, ie logging error message

      // Usage and cost tracking
      total_cost_usd: v.optional(v.number()), // Total cost in USD for this message
      credits_deducted: v.optional(v.number()), // Actual credits deducted (after tier multiplier)
      usage_breakdown: v.optional(
        // universal. put rest in other
        v.object({
          input_tokens: v.number(),
          cache_creation_input_tokens: v.number(),
          cache_read_input_tokens: v.number(),
          output_tokens: v.number(),
          other: v.optional(v.string()), // rest of the dump
        }),
      ), // Detailed usage breakdown
      model_used: v.optional(v.string()), // Model identifier used for this message

      // Images associated with the message
      images: v.optional(v.array(v.id('_storage'))), // Storage IDs for images

      // Persisted ad message payload. These rows render like assistant
      // messages, but are deduped against the agent message that triggered
      // the ad.
      ad_source_message_id: v.optional(v.id('agent_message')),
      ad_payload: v.optional(
        v.object({
          provider: v.string(),
          adText: v.string(),
          title: v.string(),
          cta: v.string(),
          brandName: v.optional(v.string()),
          url: v.string(),
          favicon: v.optional(v.string()),
          imageUrl: v.optional(v.string()),
          clickUrl: v.string(),
          impUrl: v.string(),
          placementId: v.optional(v.string()),
          servedAt: v.number(),
        }),
      ),
    })
      .index('by_thread', ['thread_id'])
      .index('by_thread_active', ['thread_id', 'isStreaming', 'deactivated'])
      .index('by_thread_and_ad_source', ['thread_id', 'ad_source_message_id'])
      .index('by_thread_and_commit', [
        'thread_id',
        'commit_hash',
        'isStreaming',
      ]), //verify these indexes

    scraped_site_logs: defineTable({
      url: v.string(),
      raw_content: v.string(),
      cleaned_content: v.string(),
      date: v.number(),
      project: v.id('project'),
    }),
    memory: defineTable({
      project: v.id('project'),
      thread: v.id('thread'),
      type: v.union(
        v.literal('error_solution'),
        v.literal('problem_solution'),
        v.literal('approved_component'),
        v.literal('unsolved_problem'),
      ),
      content: v.string(),
      date: v.number(),
      status: v.union(v.literal('logged'), v.literal('implemented')),
    }),
    domain: defineTable({
      domain: v.string(),
      ownership_verified: v.boolean(),
      wildcard_cert_generated: v.boolean(),
      pointing_verified: v.boolean(),
      ownershipVerificationCode: v.optional(v.string()),
      rootDomain: v.string(),
      owner: v.id('users'),
    })
      .index('by_domain', ['domain'])
      .index('by_rootDomain', ['rootDomain']),
    project_domain: defineTable({
      projectId: v.id('project'),
      domainId: v.id('domain'),
    })
      .index('by_project', ['projectId'])
      .index('by_domain', ['domainId']),

    // integrations
    integration: defineTable({
      cover_image: v.optional(v.string()),
      reference_id: v.string(),
      title: v.string(),
      description: v.string(),
      tags: v.array(v.string()),
      type: integrationTypeValidator,
      public: v.boolean(),
      recommended: v.optional(v.boolean()),
      documentation_urls: v.array(v.string()), // reference urls
      llm_instructions: v.string(),
      human_added_notes: v.optional(v.string()),
      env_variables: v.optional(
        v.array(
          v.object({
            id: v.string(),
            description: v.string(),
          }),
        ),
      ),
      user_instructions: v.string(), // for what the user needs to do, in markdown
      images: v.optional(v.array(v.string())), // images that go on the listing
      // unified search text across multiple fields
      search_text: v.optional(v.string()),
      context7_library_id: v.optional(v.string()), // Context7 library ID if sourced from Context7

      creator: v.optional(v.id('project')),
      last_updated: v.number(),
      approval_status: v.optional(integrationApprovalStatusValidator),
    })
      .index('by_reference_id', ['reference_id'])
      .index('by_public', ['public'])
      .index('by_type_and_approval_status', ['type', 'approval_status'])
      .index('by_last_updated', ['last_updated'])
      .index('by_public_and_last_updated', ['public', 'last_updated'])
      .searchIndex('search_all', {
        searchField: 'search_text',
        filterFields: ['public'],
      }),

    search_logs: defineTable({
      projectId: v.id('project'),
      userId: v.id('users'),
      date: v.number(),
      query: v.string(),
      response: v.string(),
      model: v.string(),
      citations: v.array(v.string()),
    }).index('by_project', ['projectId']),
    project_integration: defineTable({
      projectId: v.id('project'),
      integrationId: v.id('integration'),
    })
      .index('by_project', ['projectId'])
      .index('by_integration', ['integrationId'])
      .index('by_project_and_integration', ['projectId', 'integrationId']),

    integration_bearer_keys: defineTable({
      project_id: v.id('project'),
      key: v.string(),
    })
      .index('by_project', ['project_id'])
      .index('by_key', ['key']),

    runtime_error: defineTable({
      projectId: v.id('project'),
      error: v.string(),
      stack_trace: v.optional(v.string()),
      filename: v.optional(v.string()),
      lineno: v.optional(v.number()),
      colno: v.optional(v.number()),
      url: v.string(),
      date: v.number(),
      resolved: v.optional(v.boolean()),
      status: v.optional(errorStatusValidator),
    })
      .index('by_project', ['projectId'])
      .index('by_project_and_status', ['projectId', 'status']),
    build_error: defineTable({
      projectId: v.id('project'),
      error: v.string(),
      build_log: v.string(),
      date: v.number(),
      resolved: v.optional(v.boolean()),
      status: v.optional(errorStatusValidator),
    })
      .index('by_project', ['projectId'])
      .index('by_project_and_status', ['projectId', 'status']),

    // GitHub integration tables
    github_connections: defineTable({
      user_id: v.id('users'),
      github_user_id: v.string(),
      github_username: v.string(),
      access_token: v.string(), // encrypted OAuth token
      refresh_token: v.optional(v.string()),
      token_expires_at: v.optional(v.number()),
      installation_id: v.optional(v.number()), // GitHub App installation ID
      installation_token: v.optional(v.string()), // encrypted installation token
      installation_token_expires_at: v.optional(v.number()),
      rotation_lock_expires_at: v.optional(v.number()), // Distributed lock for token rotation
      repositories: v.optional(v.array(v.string())), // list of repo names
      created_at: v.number(),
      updated_at: v.number(),
    })
      .index('by_user', ['user_id'])
      .index('by_github_user_id', ['github_user_id'])
      // CRITICAL: Used by token rotation cron job to find expiring tokens via range queries
      // Prevents table scans across 5000+ connections during scheduled rotation
      .index('by_installation_token_expires_at', [
        'installation_token_expires_at',
      ])
      .index('by_token_expires_at', ['token_expires_at'])
      .index('by_rotation_lock_expires_at', ['rotation_lock_expires_at']),

    github_sync_state: defineTable({
      project_id: v.id('project'),
      github_repo_name: v.string(),
      github_repo_owner: v.string(),
      last_sync_time: v.number(),
      sync_direction: v.literal('bidirectional'),
      last_commit_hash: v.optional(v.string()),
      sync_status: v.union(
        v.literal('synced'),
        v.literal('pending'),
        v.literal('error'),
        v.literal('conflict'),
      ),
      error_message: v.optional(v.string()),
      conflict_resolved_at: v.optional(v.number()),
      conflict_resolved_by: v.optional(v.id('users')),
    })
      .index('by_project', ['project_id'])
      .index('by_repo', ['github_repo_owner', 'github_repo_name']),

    oauth_states: defineTable({
      user_id: v.id('users'),
      state: v.string(),
      return_url: v.optional(v.string()),
      created_at: v.number(),
      used: v.optional(v.boolean()), // Track if state has been used to prevent reuse
      temp_used: v.optional(v.boolean()), // Track temporary usage during installation flow
      temp_used_at: v.optional(v.number()), // Timestamp of temporary usage
    })
      .index('by_user', ['user_id'])
      .index('by_state', ['state']),

    // Convex OAuth connections - stores encrypted OAuth tokens for user's own Convex projects
    convex_connections: defineTable({
      user_id: v.id('users'),
      projectId: v.optional(v.id('project')),

      // OAuth tokens (ENCRYPTED)
      access_token: v.string(),
      refresh_token: v.optional(v.string()),
      token_expires_at: v.optional(v.number()),

      // Convex project info (optional for pending_setup state)
      convex_project_id: v.optional(v.number()),
      project_slug: v.optional(v.string()),
      team_slug: v.optional(v.string()),

      // Deployment info (optional for pending_setup state)
      dev_deployment_name: v.optional(v.string()),
      dev_deployment_url: v.optional(v.string()),
      prod_deployment_name: v.optional(v.string()),
      prod_deployment_url: v.optional(v.string()),

      // Deploy keys (ENCRYPTED) - optional for pending_setup state
      dev_deploy_key: v.optional(v.string()),
      dev_deploy_key_name: v.optional(v.string()),
      prod_deploy_key: v.optional(v.string()),
      prod_deploy_key_name: v.optional(v.string()),

      // Metadata
      connection_type: v.union(
        v.literal('migrated'), // Migrated from VLY
        v.literal('self_hosted'), // User's own from start
        v.literal('oauth_pending_setup'), // OAuth done, waiting for deploy key
      ),
      is_active: v.boolean(),
      created_at: v.number(),
      updated_at: v.number(),
    })
      .index('by_user', ['user_id'])
      .index('by_project', ['projectId'])
      .index('by_convex_project_id', ['convex_project_id']),

    // Convex migration tracking - tracks data migration from VLY Convex to user's Convex
    convex_migrations: defineTable({
      projectId: v.id('project'),
      user_id: v.id('users'),

      // Migration status
      status: v.union(
        v.literal('initiated'),
        v.literal('exporting'),
        v.literal('importing'),
        v.literal('updating_credentials'),
        v.literal('completed'),
        v.literal('failed'),
      ),
      progress_percentage: v.number(),

      // Source (VLY-managed)
      source_dev_deployment: v.string(),
      source_prod_deployment: v.optional(v.string()),

      // Target (User's Convex)
      target_convex_project_id: v.optional(v.number()),
      target_team_slug: v.optional(v.string()),
      target_dev_deployment: v.string(),
      target_prod_deployment: v.optional(v.string()),

      // Stats
      tables_exported: v.optional(v.array(v.string())),
      total_documents_exported: v.optional(v.number()),
      total_documents_imported: v.optional(v.number()),

      // Errors
      error_message: v.optional(v.string()),
      error_details: v.optional(v.string()),

      // Timestamps
      started_at: v.number(),
      completed_at: v.optional(v.number()),
    })
      .index('by_project', ['projectId'])
      .index('by_user', ['user_id'])
      .index('by_status', ['status']),

    referral_codes: defineTable({
      code: v.string(), // Unique referral code
      owner: v.id('users'), // User who owns this referral code
      created_at: v.number(), // Timestamp when created
      uses_count: v.number(), // Number of signups using this code
      active: v.boolean(), // Whether the code is currently active
    })
      .index('by_code', ['code'])
      .index('by_owner', ['owner'])
      .index('by_active', ['active']),
    referral_rewards: defineTable({
      referrer_user_id: v.id('users'), // User who gets the reward
      referred_user_id: v.id('users'), // User who was referred
      referral_code: v.string(), // The referral code used
      reward_type: v.string(), // Type of reward (e.g., "token_credits")
      reward_amount: v.number(), // Amount of reward
      granted_at: v.number(), // Timestamp when granted
      status: v.union(
        v.literal('pending'),
        v.literal('granted'),
        v.literal('failed'),
      ), // Reward status
    })
      .index('by_referrer', ['referrer_user_id'])
      .index('by_referred_user', ['referred_user_id'])
      .index('by_status', ['status'])
      .index('by_referral_code', ['referral_code']),
    referral_spins: defineTable({
      user: v.id('users'), // User who can use this spin
      referred_user_id: v.optional(v.id('users')), // User that generated the spin (for referral spins)
      referred_user_email: v.optional(v.string()), // Lowercased referred user email snapshot for dedupe across account recreation
      referral_code: v.optional(v.string()), // Referral code that generated this spin
      source: v.union(
        v.literal('welcome'),
        v.literal('referral'),
        v.literal('manual'),
      ),
      status: v.union(
        v.literal('available'),
        v.literal('spinning'),
        v.literal('awarded'),
        v.literal('failed'),
        v.literal('revoked'),
      ),
      awarded_credits: v.optional(v.number()),
      reward_label: v.optional(v.string()),
      granted_at: v.number(),
      spun_at: v.optional(v.number()),
      awarded_at: v.optional(v.number()),
      revoked_at: v.optional(v.number()),
      revoked_reason: v.optional(v.string()),
    })
      .index('by_user', ['user'])
      .index('by_referred_user', ['referred_user_id'])
      .index('by_referred_email', ['referred_user_email'])
      .index('by_user_and_status', ['user', 'status'])
      .index('by_user_and_source', ['user', 'source'])
      .index('by_user_and_referred_user', ['user', 'referred_user_id'])
      .index('by_status', ['status']),
    bounties: defineTable({
      title: v.string(),
      description: v.string(),
      instructions: v.string(),
      evidence_requirements: v.string(),
      links: v.array(v.string()),
      reward_credits: v.number(),
      preview_image_storage_id: v.optional(v.id('_storage')),
      status: v.union(
        v.literal('active'),
        v.literal('paused'),
        v.literal('archived'),
      ),
      created_by: v.id('users'),
      updated_by: v.optional(v.id('users')),
      created_at: v.number(),
      updated_at: v.number(),
      archived_at: v.optional(v.number()),
    })
      .index('by_status', ['status'])
      .index('by_created_by', ['created_by'])
      .index('by_status_and_created_at', ['status', 'created_at']),
    bounty_submissions: defineTable({
      bounty_id: v.id('bounties'),
      user_id: v.id('users'),
      evidence_text: v.optional(v.string()),
      evidence_links: v.array(v.string()),
      evidence_image_ids: v.array(v.id('_storage')),
      status: v.union(
        v.literal('draft'),
        v.literal('pending'),
        v.literal('approved'),
        v.literal('rejected'),
        v.literal('revoked'),
      ),
      admin_review_note: v.optional(v.string()),
      reviewed_by: v.optional(v.id('users')),
      submitted_at: v.optional(v.number()),
      reviewed_at: v.optional(v.number()),
      credit_status: v.union(
        v.literal('not_granted'),
        v.literal('grant_pending'),
        v.literal('granted'),
        v.literal('grant_failed'),
        v.literal('revoke_pending'),
        v.literal('revoked'),
        v.literal('revoke_failed'),
      ),
      credited_amount: v.optional(v.number()),
      credit_awarded_at: v.optional(v.number()),
      credit_revoked_at: v.optional(v.number()),
      created_at: v.number(),
      updated_at: v.number(),
    })
      .index('by_bounty', ['bounty_id'])
      .index('by_user', ['user_id'])
      .index('by_user_and_bounty', ['user_id', 'bounty_id'])
      .index('by_status', ['status'])
      .index('by_credit_status', ['credit_status'])
      .index('by_status_and_updated_at', ['status', 'updated_at']),
    project_convex_instance: defineTable({
      projectId: v.id('project'),
      convexProjectId: v.number(),
      devDeploymentName: v.string(),
      prodDeploymentName: v.union(v.string(), v.null()),
      // Log stream IDs for new Deployment API
      devLogStreamId: v.optional(v.string()),
      prodLogStreamId: v.optional(v.string()),
    })
      .index('by_project', ['projectId'])
      .index('by_dev_deployment_name', ['devDeploymentName'])
      .index('by_prod_deployment_name', ['prodDeploymentName']),

    // Stats table for tracking overall statistics
    stats: defineTable({
      name: v.string(), // Stat name (e.g., "users", "projects")
      value: v.number(), // Current count/value
    }).index('by_name', ['name']),

    // Approximate per-user agent activity for admin dashboards (not Convex billing)
    user_platform_usage_stats: defineTable({
      userId: v.id('users'),
      agentInvocations: v.number(),
      lastInvocationAt: v.number(),
      v2Runs: v.optional(v.number()),
      cliRuns: v.optional(v.number()),
    })
      .index('by_user', ['userId'])
      .index('by_invocations', ['agentInvocations']),

    model_usage_stats: defineTable({
      agentType: v.string(),
      model: v.string(),
      total: v.number(),
      recentDay: v.number(),
      recentDayDate: v.string(),
    }).index('by_agent_model', ['agentType', 'model']),

    // tickets table
    tickets: defineTable({
      title: v.string(),
      description: v.string(),
      status: ticketStatusValidator,
      userId: v.id('users'),
      projectId: v.id('project'),
      attachments: v.optional(v.array(v.id('_storage'))),
    })
      .index('by_user', ['userId'])
      .index('by_project', ['projectId'])
      .index('by_status', ['status'])
      .index('by_user_and_project', ['userId', 'projectId']),

    // ticket messages
    tickets_messages: defineTable({
      ticketId: v.id('tickets'),
      content: v.string(),
      role: messageRoleValidator,
      userId: v.id('users'),
      attachments: v.optional(v.array(v.id('_storage'))),
      aiSummary: v.optional(v.string()),
    })
      .index('by_ticket', ['ticketId'])
      .index('by_user', ['userId']),

    // Settings table for admin controls
    settings: defineTable({
      key: v.string(),
      value: v.boolean(),
    }).index('by_key', ['key']),

    // Email notifications queue for Tickets
    emailQueue: defineTable({
      ticketId: v.id('tickets'),
      userId: v.id('users'),
      scheduledFor: v.number(),
      sent: v.boolean(),
      cancelled: v.boolean(),
    })
      .index('by_ticket', ['ticketId'])
      .index('by_scheduled', ['scheduledFor'])
      .index('by_sent', ['sent'])
      .index('by_ticket_sent_cancelled', ['ticketId', 'sent', 'cancelled'])
      .index('by_sent_cancelled_scheduled', [
        'sent',
        'cancelled',
        'scheduledFor',
      ]),

    // Ticket user read state - tracks which message each user last read
    ticketUserState: defineTable({
      ticketId: v.id('tickets'),
      userId: v.id('users'),
      lastReadMessageId: v.optional(v.id('tickets_messages')),
    })
      .index('by_ticket_and_user', ['ticketId', 'userId'])
      .index('by_user', ['userId'])
      .index('by_ticket', ['ticketId']),
    // Integration logs for tracking integration creation process
    // Feature flags for gradual rollouts and kill switches
    feature_flags: defineTable({
      key: v.string(), // Unique identifier for the feature (e.g., "billing_enforcement")
      rollout_strategy: v.union(
        v.literal('disabled'),
        v.literal('god_only'),
        v.literal('beta'),
        v.literal('percentage'),
        v.literal('enabled'),
      ), // Rollout strategy: disabled, god_only, beta, percentage, or enabled
      rollout_percentage: v.optional(v.number()), // 0-100, used when strategy is "percentage"
      description: v.optional(v.string()), // Human-readable description
      categories: v.optional(v.array(v.string())), // Categories for grouping (e.g., ["Billing", "UI"])
      runbook: v.optional(v.string()), // Markdown documentation/runbook for this category
      updated_at: v.number(), // Last update timestamp
      updated_by: v.optional(v.id('users')), // User who last updated
    }).index('by_key', ['key']),

    integration_logs: defineTable({
      projectId: v.id('project'),
      integrationId: v.optional(v.id('integration')), // Set once integration is created/added
      status: v.union(
        v.literal('draft'),
        v.literal('created'),
        v.literal('already_existing'),
        v.literal('failed'),
      ),
      type: v.union(v.literal('existing'), v.literal('new')), // Whether it's an existing integration or newly created
      query: v.string(), // Original query from the user
      steps: v.array(v.string()), // Array of step logs during the creation process
      result: v.optional(v.string()), // Final result message
      error: v.optional(v.string()), // Error message if failed
      deep_research_results: v.optional(v.string()), // Raw output from AI deep research (for new integrations)
      context7_results: v.optional(
        v.object({
          searched: v.boolean(), // Whether Context7 search was attempted
          search_results: v.optional(v.string()), // JSON string of full search results
          results_count: v.optional(v.number()), // Number of results found
          selected_library_id: v.optional(v.string()), // Library ID that was selected
          raw_documentation: v.optional(v.string()), // The full raw documentation text fetched
          documentation_length: v.optional(v.number()), // Length of documentation fetched
          error: v.optional(v.string()), // Any error that occurred
        }),
      ), // Context7 search and fetch results
      created_at: v.number(), // Timestamp when log started
      completed_at: v.optional(v.number()), // Timestamp when completed
    })
      .index('by_project', ['projectId'])
      .index('by_integration', ['integrationId']),

    // User-level pause tracking for automatic resource limit enforcement
    paused_users: defineTable({
      userId: v.id('users'),
      pauseReason: PAUSE_REASON_VALIDATOR,
      pausedAt: v.number(), // timestamp
      pausedBy: v.optional(v.id('users')), // admin userId if manual pause
      autoUnpauseEnabled: v.boolean(), // true for automatic pauses, false for manual
      unpausedAt: v.optional(v.number()), // timestamp when unpaused
      active: v.boolean(), // true if currently paused, false if unpaused
    })
      .index('by_user_and_active', ['userId', 'active'])
      .index('by_reason_and_active', [
        'pauseReason',
        'active',
        'autoUnpauseEnabled',
      ]),

    // Project-level pause tracking for admin manual pauses
    paused_projects: defineTable({
      projectId: v.id('project'),
      pauseReason: PAUSE_REASON_VALIDATOR,
      pausedAt: v.number(), // timestamp
      pausedBy: v.id('users'), // admin userId
      unpausedAt: v.optional(v.number()), // timestamp when unpaused
      active: v.boolean(), // true if currently paused, false if unpaused
    }).index('by_project_and_active', ['projectId', 'active']),

    // Hiring interest forms - for companies looking to hire developers
    hiring_interest_forms: defineTable({
      userId: v.id('users'),
      formType: v.union(
        v.literal('hiring'),
        v.literal('developer_application'),
        v.literal('enterprise'),
      ),
      // For hiring form
      companyName: v.optional(v.string()),
      whatBuilding: v.optional(v.string()),
      budget: v.optional(v.string()),
      phoneNumber: v.optional(v.string()),
      // For developer application form
      name: v.optional(v.string()),
      linkedin: v.optional(v.string()),
      github: v.optional(v.string()),
      pitch: v.optional(v.string()),
      submittedAt: v.number(),
    })
      .index('by_user', ['userId'])
      .index('by_form_type', ['formType'])
      .index('by_submitted_at', ['submittedAt'])
      .index('by_user_and_form_type', ['userId', 'formType']),

    // ============================================
    // VLY SOCIAL MEDIA TABLES
    // ============================================

    // Published projects - projects shared to the community
    community_posts: defineTable({
      projectId: v.id('project'),
      userId: v.id('users'),
      title: v.string(),
      description: v.string(),
      tags: v.array(v.string()),
      screenshotUrl: v.optional(v.string()),
      screenshotStorageId: v.optional(v.id('_storage')), // Storage ID for user-uploaded cover images
      previewUrl: v.optional(v.string()),
      likesCount: v.number(),
      commentsCount: v.number(),
      viewsCount: v.number(),
      featured: v.optional(v.boolean()),
      isPublic: v.optional(v.boolean()), // defaults to true, false = private/unlisted
      publishedAt: v.number(),
      updatedAt: v.optional(v.number()),
    })
      .index('by_user', ['userId'])
      .index('by_project', ['projectId'])
      .index('by_published_at', ['publishedAt'])
      .index('by_likes_count', ['likesCount'])
      .index('by_featured', ['featured', 'publishedAt'])
      .index('by_public_and_published_at', ['isPublic', 'publishedAt'])
      .searchIndex('search_posts', {
        searchField: 'title',
        filterFields: ['featured'],
      }),

    // Likes on community posts
    community_likes: defineTable({
      postId: v.id('community_posts'),
      userId: v.id('users'),
      createdAt: v.number(),
    })
      .index('by_post', ['postId'])
      .index('by_user', ['userId'])
      .index('by_post_and_user', ['postId', 'userId']),

    // Comments on community posts
    community_comments: defineTable({
      postId: v.id('community_posts'),
      userId: v.id('users'),
      content: v.string(),
      parentCommentId: v.optional(v.id('community_comments')),
      likesCount: v.number(),
      createdAt: v.number(),
      updatedAt: v.optional(v.number()),
    })
      .index('by_post', ['postId', 'createdAt'])
      .index('by_user', ['userId'])
      .index('by_parent', ['parentCommentId']),

    // Comment likes
    community_comment_likes: defineTable({
      commentId: v.id('community_comments'),
      userId: v.id('users'),
      createdAt: v.number(),
    })
      .index('by_comment', ['commentId'])
      .index('by_user', ['userId'])
      .index('by_comment_and_user', ['commentId', 'userId']),

    // User follows
    community_follows: defineTable({
      followerId: v.id('users'),
      followingId: v.id('users'),
      createdAt: v.number(),
    })
      .index('by_follower', ['followerId'])
      .index('by_following', ['followingId'])
      .index('by_follower_and_following', ['followerId', 'followingId']),

    // User profile extensions for social features
    community_profiles: defineTable({
      userId: v.id('users'),
      bio: v.optional(v.string()),
      website: v.optional(v.string()),
      twitter: v.optional(v.string()),
      github: v.optional(v.string()),
      followersCount: v.number(),
      followingCount: v.number(),
      postsCount: v.number(),
      totalLikesReceived: v.number(),
      updatedAt: v.number(),
    })
      .index('by_user', ['userId'])
      .index('by_followers_count', ['followersCount'])
      .index('by_total_likes', ['totalLikesReceived']),

    // Post views tracking
    community_views: defineTable({
      postId: v.id('community_posts'),
      viewerUserId: v.optional(v.id('users')),
      viewerIp: v.optional(v.string()),
      viewedAt: v.number(),
    })
      .index('by_post', ['postId'])
      .index('by_post_and_viewer', ['postId', 'viewerUserId']),

    // UI Presets (Themes & Components)
    ui_preset: defineTable({
      title: v.string(),
      description: v.string(),
      category: v.union(v.literal('theme'), v.literal('component')),
      source_url: v.string(), // Link to original creator/website
      tags: v.array(v.string()),
      keywords: v.optional(v.array(v.string())), // Use-case oriented search terms (e.g., "image zoom", "product preview")
      public: v.boolean(),
      code: v.string(), // For interactive preview (Sandpack renders this)
      prompt: v.string(), // Sent to AI when user adds to project
      last_updated: v.number(),
    })
      .index('by_category', ['category'])
      .index('by_public', ['public'])
      .index('by_category_and_public', ['category', 'public'])
      .index('by_last_updated', ['last_updated'])
      .searchIndex('search_presets', {
        searchField: 'description',
        filterFields: ['category'],
      }),

    // Junction table for project-preset associations
    project_ui_preset: defineTable({
      projectId: v.id('project'),
      uiPresetId: v.id('ui_preset'),
    })
      .index('by_project', ['projectId'])
      .index('by_ui_preset', ['uiPresetId'])
      .index('by_project_and_preset', ['projectId', 'uiPresetId']),

    // OTP codes for "Import existing projects" flow.
    // The signed-in Freebuff user (requester) requests an OTP delivered to a
    // legacy email address; on verify, projects from the legacy users row are
    // moved to the requester via Strategy A (claim legacy row) or Strategy B
    // (transfer project_member rows).
    import_email_otps: defineTable({
      requester_user_id: v.id('users'), // current signed-in Freebuff user
      email: v.string(), // lowercased legacy email the OTP was sent to
      code: v.string(), // 6-digit numeric code (string to preserve leading zeros)
      expires_at: v.number(), // ms timestamp
      attempts: v.number(), // failed verification attempts
      consumed: v.boolean(), // true once successfully used
      created_at: v.number(),
    })
      .index('by_requester_and_email', ['requester_user_id', 'email'])
      .index('by_expires_at', ['expires_at']),
  },
  {
    schemaValidation: false, // TODO: turn back to true
  },
)

export type CodegenModels = '2.5-pro' | '3.7-sonnet' | '3.5-sonnet'
