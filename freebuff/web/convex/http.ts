import { httpRouter } from 'convex/server'
import { api, internal } from './_generated/api'
import { httpAction } from './_generated/server'
import { processRuntimeError } from './runtime_errors'
import { http_validateIntegrationBearerKey } from './integration_auth'
import { PauseReason } from './constants'

/**
 * Get allowed CORS origin based on environment
 */
function getAllowedOrigin(request: Request): string {
  const origin = request.headers.get('origin')

  // Always allow localhost for development
  if (origin?.includes('localhost') || origin?.includes('127.0.0.1')) {
    return origin
  }

  // In production, only allow specific domains
  const allowedOrigins = [
    'https://vly.ai',
    'https://www.vly.ai',
    ...(process.env.ALLOWED_ORIGINS?.split(',').map((o) => o.trim()) || []),
  ]

  if (origin && allowedOrigins.includes(origin)) {
    return origin
  }

  // Fallback to primary domain
  return 'https://vly.ai'
}

const http = httpRouter()

http.route({
  path: '/api/web/.well-known/jwks.json',
  method: 'GET',
  handler: httpAction(async () => {
    const publicJwk = process.env.VLY_CONVEX_JWT_PUBLIC_JWK
    if (!publicJwk) {
      return new Response('Missing VLY_CONVEX_JWT_PUBLIC_JWK', {
        status: 500,
      })
    }

    return new Response(JSON.stringify({ keys: [JSON.parse(publicJwk)] }), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300, stale-while-revalidate=300',
      },
    })
  }),
})

// Runtime error endpoint
http.route({
  path: '/runtime-error',
  method: 'POST',
  handler: processRuntimeError,
})

http.route({
  path: '/runtime-error',
  method: 'OPTIONS',
  handler: httpAction(async (_, request) => {
    // Make sure the necessary headers are present
    // for this to be a valid pre-flight request
    const headers = request.headers
    if (
      headers.get('Origin') !== null &&
      headers.get('Access-Control-Request-Method') !== null &&
      headers.get('Access-Control-Request-Headers') !== null
    ) {
      return new Response(null, {
        headers: new Headers({
          // e.g. https://mywebsite.com, configured on your Convex dashboard
          'Access-Control-Allow-Origin': getAllowedOrigin(request),
          'Access-Control-Allow-Methods': 'POST',
          'Access-Control-Allow-Headers': 'Content-Type, Digest',
          'Access-Control-Max-Age': '86400',
          'Access-Control-Allow-Credentials': 'true',
        }),
      })
    } else {
      return new Response()
    }
  }),
})

// Secure image serving endpoint
http.route({
  path: '/image',
  method: 'GET',
  handler: httpAction(async (ctx, request) => {
    const { searchParams } = new URL(request.url)
    const storageId = searchParams.get('storageId')

    if (!storageId) {
      return new Response('Missing storage ID', { status: 400 })
    }

    try {
      // Get the image blob from storage
      const blob = await ctx.storage.get(storageId)
      if (!blob) {
        return new Response('Image not found', { status: 404 })
      }

      // Get metadata for content type
      const metadata = await ctx.storage.getMetadata(storageId)

      // Return the image with proper headers
      return new Response(blob, {
        headers: {
          'Content-Type': metadata?.contentType || 'image/jpeg',
          'Cache-Control': 'private, max-age=3600',
          'Access-Control-Allow-Origin': getAllowedOrigin(request),
          'Access-Control-Allow-Methods': 'GET',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Allow-Credentials': 'true',
        },
      })
    } catch (error) {
      console.error('Error serving image:', error)
      return new Response('Internal server error', { status: 500 })
    }
  }),
})

http.route({
  path: '/allow_project',
  method: 'GET',
  handler: httpAction(async (ctx, request) => {
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId')

    if (!projectId) {
      return new Response('Missing project ID', { status: 400 })
    }

    try {
      const matchingProject = await ctx.runQuery(
        internal.project.getProjectFromIdentifier,
        {
          semanticIdentifier: projectId,
        },
      )

      if (!matchingProject) {
        return new Response('Project not found', { status: 404 })
      }

      const matchingRecord = await ctx.runQuery(internal.convex_instance.get, {
        projectId: matchingProject._id,
      })

      if (matchingRecord) {
        // Skip restoreEnvLocal for Daytona sandboxes
        if (!matchingProject.sandbox_id.startsWith('daytona:')) {
          await ctx.runAction(internal.localEnvFix.restoreEnvLocal, {
            projectId: matchingProject._id,
            devDeploymentName: matchingRecord.devDeploymentName,
          })
        }
        return new Response(JSON.stringify({ migrated: true }), {
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': getAllowedOrigin(request),
            'Access-Control-Allow-Methods': 'GET',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Allow-Credentials': 'true',
          },
        })
      } else {
        // kick off a migration job
        await ctx.scheduler.runAfter(0, internal.migrations.migrateDeployKeys, {
          project: {
            _id: matchingProject._id,
            _creationTime: matchingProject._creationTime.toString(),
            semantic_identifier: matchingProject.semantic_identifier,
            sandbox_id: matchingProject.sandbox_id,
            convex_url: matchingProject.convex_url,
          },
        })

        return new Response(
          JSON.stringify({ migrated: false, project: matchingProject }),
          {
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': getAllowedOrigin(request),
              'Access-Control-Allow-Methods': 'GET',
              'Access-Control-Allow-Headers': 'Content-Type',
              'Access-Control-Allow-Credentials': 'true',
            },
          },
        )
      }
    } catch (error) {
      console.info('Error checking allow project:', error)
      return new Response('Not allowed: ' + error, { status: 403 })
    }
  }),
})

// OPTIONS handler for allow_project endpoint CORS
http.route({
  path: '/allow_project',
  method: 'OPTIONS',
  handler: httpAction(async (_, request) => {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': getAllowedOrigin(request),
        'Access-Control-Allow-Methods': 'GET',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400',
        'Access-Control-Allow-Credentials': 'true',
      },
    })
  }),
})

// OPTIONS handler for image endpoint CORS
http.route({
  path: '/image',
  method: 'OPTIONS',
  handler: httpAction(async (_, request) => {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': getAllowedOrigin(request),
        'Access-Control-Allow-Methods': 'GET',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400',
        'Access-Control-Allow-Credentials': 'true',
      },
    })
  }),
})

// Screenshot upload endpoint - receives screenshots and uploads to Cloudflare R2
http.route({
  path: '/api/screenshot/upload',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId')
    const requestId = searchParams.get('requestId')
    const origin = getAllowedOrigin(request)

    // Helper to create response with CORS headers
    const createResponse = (
      body: string | null,
      status: number,
      contentType?: string,
    ) => {
      return new Response(body, {
        status,
        headers: {
          ...(contentType ? { 'Content-Type': contentType } : {}),
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Credentials': 'true',
        },
      })
    }

    try {
      if (!projectId || !requestId) {
        console.error('[Screenshot] Missing params', { projectId, requestId })
        return createResponse('Missing required query parameters', 400)
      }

      // Verify project exists
      const project = await ctx.runQuery(internal.project.getProject, {
        projectId: projectId as any,
      })

      if (!project) {
        console.error('[Screenshot] Project not found', {
          projectId,
          requestId,
        })
        return createResponse('Project not found', 404)
      }

      // Get and validate image blob
      const imageBlob = await request.blob()
      if (!imageBlob || imageBlob.size === 0) {
        console.error('[Screenshot] Empty image data', {
          projectId,
          requestId,
          size: imageBlob?.size,
        })
        return createResponse('Invalid image data', 400)
      }

      // Upload to Cloudflare R2 using Cloudflare API
      const r2AccountId = process.env.R2_ACCOUNT_ID
      const r2ApiToken = process.env.R2_API_TOKEN // Cloudflare API token with R2 write permissions
      const r2BucketName = process.env.R2_BUCKET_NAME
      const r2PublicDomain = process.env.R2_PUBLIC_DOMAIN // e.g., "screenshots.vly.ai"

      if (!r2AccountId || !r2ApiToken || !r2BucketName || !r2PublicDomain) {
        console.error('[Screenshot] R2 credentials not configured', {
          hasAccountId: !!r2AccountId,
          hasApiToken: !!r2ApiToken,
          hasBucketName: !!r2BucketName,
          hasPublicDomain: !!r2PublicDomain,
        })
        return createResponse('Server configuration error', 500)
      }

      // Delete old screenshot from R2 if it exists
      if (project.screenshot_r2_url) {
        try {
          // Extract filename from the old URL (e.g., "https://screenshots.vly.ai/projectId-123.png" -> "projectId-123.png")
          const oldUrl = new URL(project.screenshot_r2_url)
          const oldFilename = oldUrl.pathname.slice(1) // Remove leading slash

          if (oldFilename) {
            console.log('[Screenshot] Deleting old screenshot from R2', {
              oldFilename,
            })

            const deleteResponse = await fetch(
              `https://api.cloudflare.com/client/v4/accounts/${r2AccountId}/r2/buckets/${r2BucketName}/objects/${oldFilename}`,
              {
                method: 'DELETE',
                headers: {
                  Authorization: `Bearer ${r2ApiToken}`,
                },
              },
            )

            if (deleteResponse.ok) {
              console.log('[Screenshot] Old screenshot deleted successfully')
            } else {
              // Log but don't fail - continue with upload even if delete fails
              console.warn('[Screenshot] Failed to delete old screenshot', {
                status: deleteResponse.status,
                oldFilename,
              })
            }
          }
        } catch (deleteError) {
          // Log but don't fail - continue with upload even if delete fails
          console.warn('[Screenshot] Error deleting old screenshot', {
            error:
              deleteError instanceof Error
                ? deleteError.message
                : String(deleteError),
          })
        }
      }

      // Generate filename: projectId-timestamp.png
      const filename = `${projectId}-${Date.now()}.png`
      const r2Url = `https://${r2PublicDomain}/${filename}`

      // Upload to R2 using Cloudflare API (Bearer token auth, no AWS SDK needed)
      const arrayBuffer = await imageBlob.arrayBuffer()
      const uploadResponse = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${r2AccountId}/r2/buckets/${r2BucketName}/objects/${filename}`,
        {
          method: 'PUT',
          body: arrayBuffer,
          headers: {
            Authorization: `Bearer ${r2ApiToken}`,
            'Content-Type': 'image/png',
          },
        },
      )

      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text()
        console.error('[Screenshot] R2 upload failed', {
          status: uploadResponse.status,
          error: errorText,
        })
        throw new Error(`R2 upload failed: ${uploadResponse.status}`)
      }

      // Save R2 URL to project and reset commit counter
      await ctx.runMutation(internal.screenshot.saveProjectScreenshotInternal, {
        projectId: projectId as any,
        r2Url,
      })

      console.log('[Screenshot] OK - Uploaded to R2', {
        projectId,
        r2Url,
        size: imageBlob.size,
      })

      return createResponse(
        JSON.stringify({ success: true, r2Url, projectId, requestId }),
        200,
        'application/json',
      )
    } catch (error) {
      console.error('[Screenshot] Exception', {
        projectId,
        requestId,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })
      return createResponse(
        JSON.stringify({
          success: false,
          error: 'Failed to upload screenshot',
        }),
        500,
        'application/json',
      )
    }
  }),
})

// Screenshot upload OPTIONS handler for CORS preflight
http.route({
  path: '/api/screenshot/upload',
  method: 'OPTIONS',
  handler: httpAction(async (_, request) => {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': getAllowedOrigin(request),
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400',
        'Access-Control-Allow-Credentials': 'true',
      },
    })
  }),
})

// GitHub webhook endpoint
http.route({
  path: '/github/webhook',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    try {
      const githubEvent = request.headers.get('x-github-event') || ''

      const payload = await request.text()
      const signature = request.headers.get('x-hub-signature-256') || ''
      const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET
      const userAgent = request.headers.get('user-agent') || ''

      // Basic validation
      if (!webhookSecret) {
        console.warn('GitHub webhook secret not configured')
        return new Response('Webhook secret not configured', { status: 500 })
      }

      // Verify User-Agent header (GitHub sends "GitHub-Hookshot/...")
      if (!userAgent.startsWith('GitHub-Hookshot/')) {
        console.warn('Invalid User-Agent header:', userAgent)
        return new Response('Invalid User-Agent', { status: 403 })
      }

      // Verify HMAC signature
      if (!signature) {
        console.warn('No webhook signature received')
        return new Response('Missing signature', { status: 403 })
      }

      console.log('Calling crypto verification action for GitHub webhook')
      const isValidSignature = await ctx.runAction(
        api.utils.crypto.verifyGitHubSignature,
        {
          payload,
          signature,
          secret: webhookSecret,
        },
      )
      console.log('Crypto verification action completed', { isValidSignature })

      if (!isValidSignature) {
        console.warn('Invalid webhook signature')
        return new Response('Invalid signature', { status: 403 })
      }

      console.log('GitHub webhook signature verified successfully')

      // Process the webhook
      await ctx.runAction(
        internal.github.sync.services.webhookService.handleGitHubWebhook,
        {
          payload,
          signature,
          githubEvent,
        },
      )

      return new Response('OK', { status: 200 })
    } catch (error) {
      console.error('GitHub webhook error:', error)
      return new Response('Internal server error', { status: 500 })
    }
  }),
})

// Project owner lookup endpoint
http.route({
  path: '/project-owner',
  method: 'GET',
  handler: httpAction(async (ctx, request) => {
    try {
      // Validate API key
      const authHeader = request.headers.get('authorization')
      const apiKey = process.env.PROJECT_OWNER_API_KEY

      if (!apiKey) {
        console.error('PROJECT_OWNER_API_KEY not configured')
        return new Response(
          JSON.stringify({ error: 'API key not configured' }),
          { status: 500, headers: { 'Content-Type': 'application/json' } },
        )
      }

      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return new Response(
          JSON.stringify({ error: 'Missing or invalid authorization header' }),
          { status: 401, headers: { 'Content-Type': 'application/json' } },
        )
      }

      const providedKey = authHeader.substring(7) // Remove 'Bearer ' prefix
      if (providedKey !== apiKey) {
        return new Response(JSON.stringify({ error: 'Invalid API key' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      // Get deployment name from query params
      const { searchParams } = new URL(request.url)
      const deploymentName = searchParams.get('deployment')

      if (!deploymentName) {
        return new Response(
          JSON.stringify({ error: 'Missing deployment parameter' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } },
        )
      }

      // Look up project by deployment name
      const project = await ctx.runQuery(
        internal.project.getProjectByDeploymentName,
        { deploymentName },
      )

      if (!project) {
        return new Response(
          JSON.stringify({ error: 'Project not found for deployment' }),
          { status: 404, headers: { 'Content-Type': 'application/json' } },
        )
      }

      // Get project owner information
      const ownerInfo = await ctx.runQuery(internal.project.getProjectOwner, {
        projectId: project._id,
      })

      if (!ownerInfo) {
        return new Response(
          JSON.stringify({ error: 'Owner information not found' }),
          { status: 404, headers: { 'Content-Type': 'application/json' } },
        )
      }

      // Build response
      const response = {
        success: true,
        project: {
          id: project._id,
          name: project.name || null,
          semantic_identifier: project.semantic_identifier,
        },
        owner: ownerInfo,
      }

      return new Response(JSON.stringify(response), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': getAllowedOrigin(request),
          'Access-Control-Allow-Methods': 'GET',
          'Access-Control-Allow-Headers': 'Authorization, Content-Type',
          'Access-Control-Allow-Credentials': 'true',
        },
      })
    } catch (error) {
      console.error('Project owner lookup error:', error)
      return new Response(JSON.stringify({ error: 'Internal server error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }
  }),
})

// OPTIONS handler for project-owner endpoint CORS
http.route({
  path: '/project-owner',
  method: 'OPTIONS',
  handler: httpAction(async (_, request) => {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': getAllowedOrigin(request),
        'Access-Control-Allow-Methods': 'GET',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
        'Access-Control-Max-Age': '86400',
        'Access-Control-Allow-Credentials': 'true',
      },
    })
  }),
})

// Integration key validation endpoint
http.route({
  path: '/integration-auth/validate',
  method: 'POST',
  handler: http_validateIntegrationBearerKey,
})

// Pause user deployments by Clerk ID and Autumn feature ID
http.route({
  path: '/pause-user-deployments',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    try {
      // Validate API key
      const authHeader = request.headers.get('authorization')
      const apiKey = process.env.DEPLOYMENT_PAUSE_API_KEY

      if (!apiKey) {
        console.error('DEPLOYMENT_PAUSE_API_KEY not configured')
        return new Response(
          JSON.stringify({ error: 'API key not configured' }),
          { status: 500, headers: { 'Content-Type': 'application/json' } },
        )
      }

      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return new Response(
          JSON.stringify({ error: 'Missing or invalid authorization header' }),
          { status: 401, headers: { 'Content-Type': 'application/json' } },
        )
      }

      const providedKey = authHeader.substring(7) // Remove 'Bearer ' prefix
      if (providedKey !== apiKey) {
        return new Response(JSON.stringify({ error: 'Invalid API key' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      // Parse request body
      const body = await request.json()
      const { userId, featureId } = body

      if (!userId || !featureId) {
        return new Response(
          JSON.stringify({
            error: 'Missing required fields: userId and featureId',
          }),
          { status: 400, headers: { 'Content-Type': 'application/json' } },
        )
      }

      // Look up Convex user ID from Clerk ID
      const user = await ctx.runQuery(internal.users.getUserByClerkId, {
        clerkId: userId,
      })

      if (!user) {
        return new Response(JSON.stringify({ error: 'User not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      // Validate feature ID and map to pause reason
      // Note: This is a subset of PauseReason - only includes reasons that can be triggered by Autumn features
      // "db_storage_depleted" maps to convex_database_bw in the reverse mapping
      // "manual_admin" is not triggered via this endpoint
      const featureIdMapping: Record<
        string,
        Extract<
          PauseReason,
          | 'db_bandwidth_depleted'
          | 'compute_depleted'
          | 'file_bandwidth_depleted'
          | 'function_calls_depleted'
        >
      > = {
        convex_database_bw: 'db_bandwidth_depleted',
        convex_compute: 'compute_depleted',
        convex_file_bw: 'file_bandwidth_depleted',
        convex_function_calls: 'function_calls_depleted',
      }

      const pauseReason: PauseReason | undefined = featureIdMapping[featureId]

      if (!pauseReason) {
        return new Response(
          JSON.stringify({
            error:
              'Invalid feature ID. Supported: convex_database_bw, convex_compute, convex_file_bw, convex_function_calls',
          }),
          { status: 400, headers: { 'Content-Type': 'application/json' } },
        )
      }

      // Pause all user deployments when feature limit is exceeded
      const result = await ctx.runAction(
        internal.deployment_management.pauseAllUserDeployments,
        {
          userId: user._id,
          pauseReason,
          autoUnpauseEnabled: true,
        },
      )

      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    } catch (error) {
      console.error('Pause by feature webhook error:', error)
      return new Response(JSON.stringify({ error: 'Internal server error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }
  }),
})

export default http
