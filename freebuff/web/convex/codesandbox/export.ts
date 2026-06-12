'use node'

import { v } from 'convex/values'

import { Doc } from '!/_generated/dataModel'
import { createDeployKey } from '!/convex_management'
import { ConvexError } from 'convex/values'
import {
  hasDevServer,
  hasEnvironmentVariables,
  isVercelDeployable,
} from '../../codebase-utils/codebase/Codebase'
import { initializeCodebase } from '../../codebase-utils/codebase/initializeCodebase'
import { configProxy } from '../../codebase-utils/instanceManager'
import { deployCodebaseProd } from '../../codebase-utils/prodDeployments'
import { api, internal } from '../_generated/api'
import { action, internalAction } from '../_generated/server'
import { getAuthUser } from '../users'

export const getCodebaseDownloadUrl = action({
  args: {
    semanticIdentifier: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx)
    if (!user) {
      throw new ConvexError('Unauthorized')
    }
    if (user.role !== 'god' && user.role !== 'admin') {
      throw new ConvexError('Insufficient permissions')
    }

    const project = await ctx.runQuery(
      internal.project.getProjectFromIdentifier,
      {
        semanticIdentifier: args.semanticIdentifier,
      },
    )

    if (!project) {
      throw new Error('Project not found')
    }

    const codebase = await initializeCodebase(
      project.sandbox_id,
      project.packageManager,
    )
    return await codebase.downloadCodebase()
  },
})

export const migrateToDaytona = action({
  args: {
    projectId: v.id('project'),
  },
  handler: async (ctx, args) => {
    const project = await ctx.runQuery(internal.project.getProject, {
      projectId: args.projectId,
    })

    if (!project) {
      throw new Error('Project not found')
    }

    if (project.sandbox_id.startsWith('daytona:')) {
      throw new Error('Project is already on Daytona')
    }

    const codesandboxId: string = project.sandbox_id

    const convexInstance: Doc<'project_convex_instance'> | null =
      await ctx.runQuery(internal.convex_instance.get, {
        projectId: project._id,
      })

    if (!convexInstance) {
      throw new Error('Convex instance not found')
    }

    const convexDeployKey = await createDeployKey(
      convexInstance.devDeploymentName,
    )
    const convexDeploymentName: string = convexInstance.devDeploymentName

    const migrationResult = await fetch(
      `${process.env.MIGRATION_SERVER_URL}/migrate-daytona`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          codesandboxId,
          convexDeployKey,
          convexDeploymentName,
          daytonaSnapshotId: process.env.DAYTONA_SNAPSHOT_ID,
        }),
      },
    )

    const result = await migrationResult.json()
    const daytonaSandboxId = result.daytonaSandboxId

    if (!daytonaSandboxId) {
      throw new Error('Failed to migrate to Daytona - no sandbox ID returned')
    }

    await console.log('Migration result:', result)

    const codebase = await initializeCodebase(
      project.sandbox_id,
      project.packageManager,
    )

    if (!hasDevServer(codebase)) {
      throw new Error('Codebase does not support dev server management')
    }
    await codebase.restartDevServer()

    const previewDomain = `5173-${daytonaSandboxId}.proxy.daytona.works`

    await ctx.runMutation(internal.project.csbDaytonaMigrationUpdate, {
      projectId: project._id,
      daytonaSandboxId: daytonaSandboxId,
      previewUrl: `https://${previewDomain}`,
      templateId: process.env.DAYTONA_SNAPSHOT_ID || '',
    })

    await configProxy({
      slug: project.semantic_identifier,
      target: previewDomain,
    })

    await codebase.restartDevServer()

    return { daytonaSandboxId: daytonaSandboxId }
  },
})

export const migrateDaytonaWorkspace = action({
  args: {
    projectId: v.id('project'),
    targetSnapshotId: v.string(),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    success: boolean
    oldWorkspaceId: string
    newWorkspaceId: string
    snapshotId: string
    message: string
  }> => {
    const project: Doc<'project'> | null = await ctx.runQuery(
      internal.project.getProject,
      {
        projectId: args.projectId,
      },
    )

    if (!project) {
      throw new Error('Project not found')
    }

    if (!project.sandbox_id.startsWith('daytona:')) {
      throw new Error('Project is not a Daytona workspace')
    }

    // Extract Daytona sandbox ID from project.sandbox_id (format: "daytona:xxx")
    const sourceDaytonaId: string | undefined = project.sandbox_id.split(':')[1]

    if (!sourceDaytonaId) {
      throw new Error('Invalid Daytona sandbox ID')
    }

    const convexInstance: Doc<'project_convex_instance'> | null =
      await ctx.runQuery(internal.convex_instance.get, {
        projectId: project._id,
      })

    if (!convexInstance) {
      throw new Error('Convex instance not found')
    }

    const convexDeployKey = await createDeployKey(
      convexInstance.devDeploymentName,
    )
    const convexDeploymentName: string = convexInstance.devDeploymentName

    const migrationResult = await fetch(
      `${process.env.MIGRATION_SERVER_URL}/migrate-daytona-workspace`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sourceDaytonaId,
          targetSnapshotId: args.targetSnapshotId,
          convexDeployKey,
          convexDeploymentName,
        }),
      },
    )

    if (!migrationResult.ok) {
      const errorText = await migrationResult.text()
      throw new Error(
        `Migration failed: ${migrationResult.status} - ${errorText}`,
      )
    }

    const result = await migrationResult.json()

    if (result.status !== 'success') {
      throw new Error(result.message || 'Migration failed')
    }

    const newDaytonaSandboxId = result.newWorkspaceId

    if (!newDaytonaSandboxId) {
      throw new Error(
        'Failed to migrate workspace - no new workspace ID returned',
      )
    }

    await console.log('Workspace migration result:', result)

    // Initialize the new codebase
    const codebase = await initializeCodebase(
      `daytona:${newDaytonaSandboxId}`,
      project.packageManager,
    )

    if (!hasDevServer(codebase)) {
      throw new Error('Codebase does not support dev server management')
    }

    const previewDomain = `5173-${newDaytonaSandboxId}.proxy.daytona.works`

    // Determine sandbox size based on target snapshot tier
    const { getSnapshotById } = await import('../../config/daytona-snapshots')
    const targetSnapshot = getSnapshotById(args.targetSnapshotId)

    if (!targetSnapshot) {
      throw new ConvexError({
        message: 'Invalid target snapshot ID',
        code: 'INVALID_SNAPSHOT',
      })
    }

    const newSize = targetSnapshot.tier as 'small' | 'medium' | 'large'

    const oldSize =
      (project.sandbox_size as 'small' | 'medium' | 'large') ?? 'small'

    // Billing is disabled, so all sandbox sizes are available and no external
    // usage meter needs to be updated.
    void oldSize

    // Update project with new workspace ID, template ID, and sandbox size
    await ctx.runMutation(internal.project.csbDaytonaMigrationUpdate, {
      projectId: project._id,
      daytonaSandboxId: newDaytonaSandboxId,
      previewUrl: `https://${previewDomain}`,
      templateId: args.targetSnapshotId,
      sandboxSize: newSize,
    })

    await configProxy({
      slug: project.semantic_identifier,
      target: previewDomain,
    })

    await codebase.restartDevServer()

    return {
      success: true,
      oldWorkspaceId: sourceDaytonaId,
      newWorkspaceId: newDaytonaSandboxId,
      snapshotId: args.targetSnapshotId,
      message: result.message,
    }
  },
})

// export const getConvexDashboardUrl = action({
//   args: {
//     projectId: v.optional(v.id("project")),
//     semanticIdentifier: v.optional(v.string()),
//   },
//   handler: async (ctx, args) => {
//     const user = await getAuthUser(ctx);
//     if (!user) {
//       throw new ConvexError("Unauthorized");
//     }
//     if (user.role !== "god" && user.role !== "admin") {
//       throw new ConvexError("Insufficient permissions");
//     }

//     let project: Doc<"project"> | null = null;

//     if (args.projectId) {
//       project = await ctx.runQuery(internal.project.getProject, {
//         projectId: args.projectId,
//       });
//     } else if (args.semanticIdentifier) {
//       const semanticIdentifier = args.semanticIdentifier;
//       project = await ctx.runQuery(internal.project.getProjectFromIdentifier, {
//         semanticIdentifier: semanticIdentifier,
//       });
//     }

//     if (!project) {
//       throw new Error("Project not found");
//     }

//     const dashboardUrl = await getConvexUrl(project.sandbox_id);
//     return dashboardUrl;
//   },
// });

export const deployOnFreestyle = internalAction({
  args: {
    projectId: v.id('project'),
    slug: v.string(),
    deploymentId: v.id('deployments'),
  },
  handler: async (ctx, args) => {
    const getDomainMappingErrorMessage = (message?: string) => {
      if (!message) {
        return 'Unknown error'
      }

      try {
        const parsed = JSON.parse(message)
        if (
          parsed &&
          typeof parsed === 'object' &&
          'message' in parsed &&
          typeof parsed.message === 'string'
        ) {
          return parsed.message
        }
      } catch {
        // Fall back to the raw message when the response is not JSON.
      }

      return message
    }

    const buildDomainMappingWarning = (
      failures: Array<{ domain: string; message: string }>,
    ) => {
      const formattedFailures = failures
        .slice(0, 2)
        .map(
          ({ domain, message }) =>
            `${domain} (${getDomainMappingErrorMessage(message)})`,
        )

      const remainingFailures = failures.length - formattedFailures.length
      const suffix =
        remainingFailures > 0 ? ` and ${remainingFailures} more` : ''

      return `Deployed with custom domain warning: ${formattedFailures.join(', ')}${suffix}.`
    }

    console.log(
      '[DEBUG] deployOnFreestyle called with deploymentId:',
      args.deploymentId,
    )

    // Helper function to check if deployment has been cancelled
    const checkCancellation = async () => {
      const deployment = await ctx.runQuery(
        internal.deployment.getDeploymentById,
        {
          deploymentId: args.deploymentId,
        },
      )
      if (deployment?.state === 'cancelling') {
        await ctx.runMutation(internal.deployment.update, {
          deploymentId: args.deploymentId,
          state: 'cancelled',
        })
        throw new Error('Deployment cancelled by user')
      }
    }
    try {
      // Check for cancellation at the start
      await checkCancellation()

      const project = await ctx.runQuery(internal.project.getProject, {
        projectId: args.projectId,
      })

      if (!project) {
        throw new Error('Project not found')
      }

      const codebase = await initializeCodebase(
        project.sandbox_id,
        project.packageManager,
      )

      await ctx.runMutation(internal.deployment.setDeployStatusText, {
        deploymentId: args.deploymentId,
        deployStatusText: 'Preparing repository for deployment...',
      })

      // Prepare repository for production deployment (commit changes and create version tag)
      let preparationResult: any = null

      // Get sync state to find the GitHub repository
      const syncState = await ctx.runQuery(
        internal.github.auth.getSyncStateByProject,
        {
          projectId: args.projectId,
        },
      )

      if (!syncState) {
        console.log(
          '[DEBUG] Skipping GitHub repository preparation - no GitHub sync configured for this project',
        )
      } else {
        try {
          console.log('[DEBUG] Preparing repository for production deployment')

          // Get GitHub connection for the project owner
          const projectMember = await ctx.runQuery(
            internal.github.auth.getProjectOwner,
            {
              projectId: args.projectId,
            },
          )

          if (!projectMember) {
            throw new Error('Project owner not found')
          }

          const connection = await ctx.runQuery(
            internal.github.auth.getGitHubConnectionWithTokensInternal,
            {
              userId: projectMember.user,
            },
          )

          if (!connection) {
            throw new Error('GitHub connection not found')
          }

          preparationResult = await ctx.runAction(
            internal.github.services.deploymentService
              .prepareProductionDeployment,
            {
              projectId: args.projectId,
              sandboxId: project.sandbox_id,
              deploymentMessage: `Production deployment preparation for ${project.name || 'project'}`,
              repoOwner: syncState.github_repo_owner,
              repoName: syncState.github_repo_name,
              accessToken: connection.access_token,
              installationId: connection.installation_id,
            },
          )

          console.log(
            '[DEBUG] Repository preparation result:',
            preparationResult,
          )

          if (preparationResult.success) {
            const statusText = preparationResult.committed
              ? `Repository prepared: Changes committed${preparationResult.commitHash ? ` (${preparationResult.commitHash.substring(0, 8)})` : ''}${preparationResult.tagged ? `, Tagged: ${preparationResult.tagName}` : ''}`
              : `Repository prepared: No changes${preparationResult.tagged ? `, Tagged: ${preparationResult.tagName}` : ''}`

            await ctx.runMutation(internal.deployment.setDeployStatusText, {
              deploymentId: args.deploymentId,
              deployStatusText: statusText,
            })

            console.log(`[DEBUG] Repository prepared successfully:`, {
              committed: preparationResult.committed,
              commitHash: preparationResult.commitHash,
              tagged: preparationResult.tagged,
              tagName: preparationResult.tagName,
            })
          } else {
            console.log(
              '[DEBUG] Repository preparation failed:',
              preparationResult.message,
            )
            // Continue with deployment even if preparation fails
            await ctx.runMutation(internal.deployment.setDeployStatusText, {
              deploymentId: args.deploymentId,
              deployStatusText:
                'Repository preparation failed, continuing with deployment...',
            })
          }
        } catch (prepError) {
          console.log('[DEBUG] Repository preparation error:', prepError)
          // Continue with deployment even if preparation fails
          await ctx.runMutation(internal.deployment.setDeployStatusText, {
            deploymentId: args.deploymentId,
            deployStatusText:
              'Repository preparation error, continuing with deployment...',
          })
        }
      }

      await ctx.runMutation(internal.deployment.setDeployStatusText, {
        deploymentId: args.deploymentId,
        deployStatusText: 'Deploying codebase...',
      })

      // Check for cancellation before creating GitHub deployment
      await checkCancellation()

      // Create GitHub deployment and set status to pending
      let githubDeploymentId: number | undefined

      try {
        console.log(
          `[DEBUG] Creating GitHub deployment for deployment ${args.deploymentId}`,
        )

        // Use the commit hash from preparation if available, otherwise let GitHub deployment use the latest
        const deploymentDescription =
          preparationResult?.success && preparationResult?.tagName
            ? `Production deployment ${preparationResult.tagName} to ${args.slug}.freebuff.app`
            : `Production deployment to ${args.slug}.freebuff.app`

        const githubDeploymentResult = await ctx.runAction(
          internal.github.deployments.createGitHubDeploymentForProject,
          {
            projectId: args.projectId,
            deploymentId: args.deploymentId,
            environment: 'production',
            description: deploymentDescription,
            slug: args.slug, // Pass the slug for production URL
            commitHash: preparationResult?.success
              ? preparationResult.commitHash
              : undefined,
          },
        )

        console.log(
          `[DEBUG] GitHub deployment creation result:`,
          githubDeploymentResult,
        )

        if (
          githubDeploymentResult.success &&
          githubDeploymentResult.githubDeploymentId
        ) {
          githubDeploymentId = githubDeploymentResult.githubDeploymentId
          console.log(
            `[DEBUG] GitHub deployment created with ID: ${githubDeploymentId}`,
          )

          // Store the GitHub deployment ID in the database for future reference
          const currentDeployment = await ctx.runQuery(
            internal.deployment.get,
            {
              deploymentId: args.deploymentId,
            },
          )

          if (currentDeployment) {
            await ctx.runMutation(internal.deployment.update, {
              deploymentId: args.deploymentId,
              state: currentDeployment.state, // Preserve the current state
              github_deployment_id: githubDeploymentId,
            })
          }

          // Note: Initial deployment status is now created in createGitHubDeployment
          // No need to create a duplicate pending status here
        } else {
          console.log(
            `[DEBUG] GitHub deployment creation failed:`,
            githubDeploymentResult.message,
          )
        }
      } catch (githubError) {
        console.error(
          '[DEBUG] Failed to create GitHub deployment:',
          githubError,
        )
        // Don't fail the deployment if GitHub integration fails
      }

      // Check for cancellation before getting env vars
      await checkCancellation()

      if (!hasEnvironmentVariables(codebase) || !isVercelDeployable(codebase)) {
        throw new Error('Codebase does not support deployment')
      }
      const envVars = await codebase.getEnvVars()

      // Watermark removal is a referral perk: deploys skip the "Powered by
      // Freebuff" branding once the project owner's referral tier unlocks it
      // (see FREEBUFF_REFERRAL_TIERS) or when the owner is a platform admin.
      // The global kill-switch (isProdBrandingInjectionEnabled) still applies
      // in prodDeployments.ts.
      let skipBranding = false
      try {
        const { getReferralTier } = await import(
          '@codebuff/common/constants/freebuff-referral-tiers'
        )

        const ownerMember = await ctx.runQuery(
          internal.github.auth.getProjectOwner,
          { projectId: args.projectId },
        )
        const owner = ownerMember
          ? await ctx.runQuery(internal.users.get, {
              userId: ownerMember.user,
            })
          : null

        const isPlatformAdmin =
          owner?.role === 'god' || owner?.role === 'admin'
        const ownerTier = getReferralTier(owner?.qualified_referral_count)
        skipBranding = isPlatformAdmin || ownerTier.removesWatermark

        console.log(
          `[Deploy] Branding skip check: ownerTier=${ownerTier.tier}, admin=${isPlatformAdmin}, skipBranding=${skipBranding}`,
        )
      } catch (brandingCheckError) {
        console.error(
          '[Deploy] Failed to check branding referral tier:',
          brandingCheckError,
        )
        skipBranding = false
      }

      // Check if this is a self-hosted project
      let prodCredentials:
        | { name: string; key: string; url?: string }
        | undefined
      const connection = await ctx.runQuery(
        internal.convex_oauth.connections.getConnectionByProjectId,
        { projectId: args.projectId },
      )
      if (connection) {
        if (connection.prod_deployment_name && connection.prod_deploy_key) {
          const decryptedKey = await ctx.runAction(
            api.convex_oauth.crypto.decryptToken,
            { encrypted: connection.prod_deploy_key },
          )
          prodCredentials = {
            name: connection.prod_deployment_name,
            key: decryptedKey,
            url: connection.prod_deployment_url,
          }
          console.log(
            `[Deploy] Using self-hosted prod deployment: ${connection.prod_deployment_name}, url: ${connection.prod_deployment_url}`,
          )
        } else if (connection.convex_project_id && connection.access_token) {
          // Self-hosted but no prod deployment yet — create one
          console.log(
            `[Deploy] Self-hosted project has no prod deployment, creating one...`,
          )
          try {
            const accessToken = await ctx.runAction(
              api.convex_oauth.crypto.decryptToken,
              { encrypted: connection.access_token },
            )

            const prodResult: any = await ctx.runAction(
              internal.convex_migration.management_api.createProdDeployment,
              {
                accessToken,
                projectId: connection.convex_project_id,
              },
            )

            const prodKeyResult: any = await ctx.runAction(
              internal.convex_migration.management_api
                .createDeployKeyForDeployment,
              {
                accessToken,
                deploymentName: prodResult.deploymentName,
              },
            )

            // Encrypt the prod deploy key before storing
            const encryptedProdKey = await ctx.runAction(
              api.convex_oauth.crypto.encryptToken,
              { plaintext: prodKeyResult.deployKey },
            )

            // Store prod deployment info back in convex_connections
            await ctx.runMutation(
              internal.convex_oauth.connections.updateConnectionProdDeployment,
              {
                connectionId: connection._id,
                prod_deployment_name: prodResult.deploymentName,
                prod_deployment_url: prodResult.deploymentUrl,
                prod_deploy_key: encryptedProdKey,
                prod_deploy_key_name: `vly-${args.projectId}-prod`,
              },
            )

            prodCredentials = {
              name: prodResult.deploymentName,
              key: prodKeyResult.deployKey,
              url: prodResult.deploymentUrl,
            }

            console.log(
              `[Deploy] Created self-hosted prod deployment: ${prodResult.deploymentName}, url: ${prodResult.deploymentUrl}`,
            )
          } catch (prodCreateError) {
            console.error(
              '[Deploy] Failed to create self-hosted prod deployment:',
              prodCreateError,
            )
          }
        }
      }

      // Fetch the previous active deployment's Vercel project ID to reuse it
      const previousActiveDeployments = await ctx.runQuery(
        internal.deployment._getActiveDeploymentsByProject,
        { projectId: args.projectId },
      )
      const existingVercelProjectId =
        previousActiveDeployments?.[0]?.freestyleDeploymentId ?? undefined

      if (existingVercelProjectId) {
        console.log(
          `[Deploy] Found existing Vercel project ID from previous deployment: ${existingVercelProjectId}`,
        )
      }

      const [result, err] = await deployCodebaseProd(
        args.slug,
        codebase as any, // Type assertion needed for deployCodebaseProd
        envVars,
        ctx,
        async (log) => {
          console.log('[Deploy]', log)
          // Check for cancellation during deployment
          const deployment = await ctx.runQuery(
            internal.deployment.getDeploymentById,
            {
              deploymentId: args.deploymentId,
            },
          )
          if (deployment?.state === 'cancelling') {
            throw new Error('Deployment cancelled by user')
          }
          if (deployment && deployment.state === 'deploying') {
            await ctx.runMutation(internal.deployment.setDeployStatusText, {
              deploymentId: args.deploymentId,
              deployStatusText: log,
            })
          }
        },
        skipBranding,
        prodCredentials,
        existingVercelProjectId,
      )

      console.log('[DEBUG] deployCodebaseProd result:', result)
      console.log('[DEBUG] deployCodebaseProd error:', err)
      console.log('[DEBUG] Using deployment ID:', result?.deploymentId)

      if (err) {
        // Check if this was a cancellation error
        if (
          err.message &&
          err.message.includes('Deployment cancelled by user')
        ) {
          console.log('Deployment cancelled during build')
          await ctx.runMutation(internal.deployment.update, {
            deploymentId: args.deploymentId,
            state: 'cancelled',
          })
          await ctx.runMutation(internal.deployment.setDeployStatusText, {
            deploymentId: args.deploymentId,
            deployStatusText: 'Deployment cancelled',
          })
          return
        }

        const buildLog = err.buildLog

        // Log the build error for the agent to fix later
        await ctx.runMutation(internal.build_errors.logBuildError, {
          projectId: args.projectId,
          error: 'Build failed - ' + buildLog,
          build_log: buildLog || '',
        })

        await ctx.runMutation(internal.deployment.update, {
          deploymentId: args.deploymentId,
          state: 'error',
        })

        // Update GitHub deployment status to failure if it was created
        if (githubDeploymentId) {
          try {
            // GitHub deployment status description has a 140 character limit
            // Extract first line of error or truncate to fit
            const errorSummary = buildLog.split('\n')[0] || 'Build failed'
            const maxLength = 140 - 'Build failed: '.length
            const truncatedError =
              errorSummary.length > maxLength
                ? errorSummary.substring(0, maxLength - 3) + '...'
                : errorSummary

            await ctx.runAction(
              internal.github.deployments.updateGitHubDeploymentStatusAction,
              {
                projectId: args.projectId,
                deploymentId: args.deploymentId,
                githubDeploymentId: githubDeploymentId,
                state: 'failure',
                description: 'Build failed: ' + truncatedError,
              },
            )
          } catch (githubError) {
            console.error(
              'Failed to update GitHub deployment status to failure:',
              githubError,
            )
          }
        }

        return
      }

      // Check for cancellation before finalizing
      await checkCancellation()

      await ctx.runMutation(internal.deployment.setDeployStatusText, {
        deploymentId: args.deploymentId,
        deployStatusText: 'Removing old deployments...',
      })

      await ctx.runMutation(
        internal.deployment.markAllActiveDeploymentsAsObsolete,
        {
          projectId: args.projectId,
        },
      )

      const deploymentDomain =
        result.domains?.[0] || `${args.slug}.freebuff.app`

      // Promote the deployment before custom-domain mapping
      await ctx.runMutation(internal.deployment.update, {
        deploymentId: args.deploymentId,
        state: 'active',
        deploymentDomain: deploymentDomain,
        freestyleDeploymentId: result.projectId, // stores Vercel project ID
      })
      console.log(
        '[DEBUG] Deployment state updated to active before domain mapping',
      )

      await ctx.runMutation(internal.deployment.setDeployStatusText, {
        deploymentId: args.deploymentId,
        deployStatusText: '',
      })
      console.log('[DEBUG] Cleared deployment status text after activation')

      let domainMappingWarning = ''
      try {
        const activeProjectDomains = await ctx.runQuery(
          api.project.getActiveProjectDomains,
          {
            projectId: args.projectId,
          },
        )

        console.log(
          '[DEBUG] Active project domains query result:',
          activeProjectDomains,
        )
        console.log(
          '[DEBUG] Number of domains to map:',
          activeProjectDomains?.length || 0,
        )

        // Check for cancellation before mapping domains
        await checkCancellation()

        console.log('[DEBUG] Mapping', activeProjectDomains.length, 'domains')

        const mapDomain = async (domain: string) => {
          const mapArgs = {
            domain,
            freestyleDeploymentId: result.projectId, // Vercel project ID
          }
          const mappingResult = await ctx.runAction(
            api.domains.pointDomainToDeployment,
            mapArgs,
          )
          return { domain, ...mappingResult }
        }

        const domainMappingResults = await Promise.allSettled(
          activeProjectDomains.map((d: Doc<'domain'>) => mapDomain(d.domain)),
        )

        const failedMappings = domainMappingResults.flatMap(
          (settledResult, index) => {
            const domain =
              activeProjectDomains[index]?.domain ?? 'unknown domain'

            if (settledResult.status === 'rejected') {
              return [
                {
                  domain,
                  message:
                    settledResult.reason instanceof Error
                      ? settledResult.reason.message
                      : 'Unknown error occurred',
                },
              ]
            }

            if (settledResult.value.success) {
              return []
            }

            return [
              {
                domain,
                message:
                  settledResult.value.message ||
                  'Failed to point domain to deployment',
              },
            ]
          },
        )

        if (failedMappings.length > 0) {
          console.error('[DEBUG] Some domain mappings failed:', failedMappings)
          domainMappingWarning = buildDomainMappingWarning(failedMappings)
          console.warn(
            '[DEBUG] Continuing deployment despite domain mapping failures',
          )
        }
      } catch (domainError) {
        console.error(
          '[DEBUG] Domain mapping process failed after deployment activation:',
          domainError,
        )
        domainMappingWarning =
          'Deployed, but custom domain mapping could not be completed.'
      }

      if (domainMappingWarning) {
        await ctx.runMutation(internal.deployment.setDeployStatusText, {
          deploymentId: args.deploymentId,
          deployStatusText: domainMappingWarning,
        })
      }
      console.log(
        '[DEBUG] Deployment status text updated after domain mapping:',
        domainMappingWarning || '<cleared>',
      )

      // Update GitHub deployment status to success
      try {
        const githubSuccessDescription = (
          domainMappingWarning || 'Deployment completed successfully'
        ).slice(0, 140)
        if (githubDeploymentId) {
          console.log(
            `[DEBUG] Updating GitHub deployment ${githubDeploymentId} status to success`,
          )

          const statusUpdateResult = await ctx.runAction(
            internal.github.deployments.updateGitHubDeploymentStatusAction,
            {
              projectId: args.projectId,
              deploymentId: args.deploymentId,
              githubDeploymentId: githubDeploymentId,
              state: 'success',
              targetUrl: `https://${deploymentDomain}`,
              description: githubSuccessDescription,
            },
          )

          console.log(
            `[DEBUG] GitHub deployment status update result:`,
            statusUpdateResult,
          )

          if (!statusUpdateResult.success) {
            console.error(
              `[DEBUG] GitHub deployment status update failed:`,
              statusUpdateResult.message,
            )
          }

          // Also update the repository homepage URL to point to production
          try {
            console.log(
              `[DEBUG] Updating repository homepage to ${deploymentDomain}`,
            )

            const homepageUpdateResult = await ctx.runAction(
              internal.github.deployments.updateRepositoryHomepageAction,
              {
                projectId: args.projectId,
                productionUrl: `https://${deploymentDomain}`,
              },
            )

            console.log(
              `[DEBUG] Repository homepage update result:`,
              homepageUpdateResult,
            )

            if (!homepageUpdateResult.success) {
              console.error(
                `[DEBUG] Repository homepage update failed:`,
                homepageUpdateResult.message,
              )
            }
          } catch (homepageError) {
            console.error(
              '[DEBUG] Failed to update repository homepage:',
              homepageError,
            )
            // Don't fail the deployment if homepage update fails
          }
        } else {
          // Fallback: try to get GitHub deployment ID from database
          const deployment = await ctx.runQuery(internal.deployment.get, {
            deploymentId: args.deploymentId,
          })

          if (deployment?.github_deployment_id) {
            console.log(
              `[DEBUG] Found GitHub deployment ID ${deployment.github_deployment_id} in database, updating status to success`,
            )

            const statusUpdateResult = await ctx.runAction(
              internal.github.deployments.updateGitHubDeploymentStatusAction,
              {
                projectId: args.projectId,
                deploymentId: args.deploymentId,
                githubDeploymentId: deployment.github_deployment_id,
                state: 'success',
                targetUrl: `https://${deploymentDomain}`,
                description: githubSuccessDescription,
              },
            )

            console.log(
              `[DEBUG] GitHub deployment status update result:`,
              statusUpdateResult,
            )

            if (!statusUpdateResult.success) {
              console.error(
                `[DEBUG] GitHub deployment status update failed:`,
                statusUpdateResult.message,
              )
            }

            // Also update the repository homepage URL to point to production
            try {
              console.log(
                `[DEBUG] Updating repository homepage to ${deploymentDomain}`,
              )

              const homepageUpdateResult = await ctx.runAction(
                internal.github.deployments.updateRepositoryHomepageAction,
                {
                  projectId: args.projectId,
                  productionUrl: `https://${deploymentDomain}`,
                },
              )

              console.log(
                `[DEBUG] Repository homepage update result:`,
                homepageUpdateResult,
              )

              if (!homepageUpdateResult.success) {
                console.error(
                  `[DEBUG] Repository homepage update failed:`,
                  homepageUpdateResult.message,
                )
              }
            } catch (homepageError) {
              console.error(
                '[DEBUG] Failed to update repository homepage:',
                homepageError,
              )
              // Don't fail the deployment if homepage update fails
            }
          } else {
            console.log(
              `[DEBUG] No GitHub deployment ID available, skipping status update`,
            )
          }
        }
      } catch (githubError) {
        console.error(
          '[DEBUG] Failed to update GitHub deployment status:',
          githubError,
        )
        // Don't fail the deployment if GitHub integration fails
      }
    } catch (error) {
      if (error instanceof Error) {
        // Check if it was a cancellation
        if (error.message === 'Deployment cancelled by user') {
          console.log('Deployment cancelled by user')
          await ctx.runMutation(internal.deployment.update, {
            deploymentId: args.deploymentId,
            state: 'cancelled',
          })
          await ctx.runMutation(internal.deployment.setDeployStatusText, {
            deploymentId: args.deploymentId,
            deployStatusText: 'Deployment cancelled',
          })
          return
        }
        // Only log as error if it wasn't a cancellation
        console.error('Failed to deploy codebase', error.message)
      } else {
        console.error('Failed to deploy codebase', error)
      }

      await ctx.runMutation(internal.deployment.update, {
        deploymentId: args.deploymentId,
        state: 'error',
      })
    }
  },
})
