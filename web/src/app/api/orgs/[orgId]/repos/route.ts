import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options'
import db from 'common/db'
import * as schema from 'common/db/schema'
import { eq, and } from 'drizzle-orm'
import { AddRepositoryRequest } from 'common/types/organization'

interface RouteParams {
  params: { orgId: string }
}

interface RepositoryValidationResult {
  isValid: boolean;
  normalizedUrl?: string;
  error?: string;
}

/**
 * Validates and normalizes a repository URL.
 * Supports HTTP, HTTPS, Git SSH, and SSH protocol URLs.
 * Normalizes owner and repository names to lowercase.
 */
function validateAndNormalizeRepositoryUrl(repositoryUrl: string): RepositoryValidationResult {
  if (!repositoryUrl || typeof repositoryUrl !== 'string' || repositoryUrl.trim() === '') {
    return { isValid: false, error: 'Repository URL cannot be empty.' };
  }

  let originalInput = repositoryUrl.trim();

  // Regexes to capture components: host, owner, repo
  // HTTP/S: e.g., https://github.com/User/Repo.git
  const httpRegex = /^(https?:\/\/)(?:[\w.-]+@)?([\w.-]+)\/([\w.-]+)\/([\w.-]+?)(\.git)?\/?$/i;
  // Git SSH: e.g., git@github.com:User/Repo.git
  const gitSshRegex = /^(?:([\w.-]+)@)?([\w.-]+):([\w.-]+)\/([\w.-]+?)(\.git)?$/i;
  // SSH protocol: e.g., ssh://git@github.com/User/Repo.git
  // This regex captures: 1:protocol, 2:user (optional), 3:host, 4:owner, 5:repo, 6:.git (optional)
  const sshProtocolRegex = /^(ssh:\/\/)(?:([\w.-]+)@)?([\w.-]+)\/([\w.-]+)\/([\w.-]+?)(\.git)?\/?$/i;

  let match;
  let normalizedUrl: string;

  if ((match = originalInput.match(httpRegex))) {
    const protocol = match[1];
    const host = match[2];
    const owner = match[3].toLowerCase();
    const repo = match[4].toLowerCase();
    normalizedUrl = `${protocol}${host}/${owner}/${repo}.git`;
    return { isValid: true, normalizedUrl };
  } else if ((match = originalInput.match(gitSshRegex))) {
    const user = match[1] || 'git'; // Default to 'git' user
    const host = match[2];
    const owner = match[3].toLowerCase();
    const repo = match[4].toLowerCase();
    normalizedUrl = `${user}@${host}:${owner}/${repo}.git`;
    return { isValid: true, normalizedUrl };
  } else if ((match = originalInput.match(sshProtocolRegex))) {
    const protocolPart = match[1]; // "ssh://"
    const userPart = match[2] ? `${match[2]}@` : 'git@'; // Default to git@ if user is not in URL
    const hostPart = match[3];
    const ownerPart = match[4].toLowerCase();
    const repoPart = match[5].toLowerCase();
    normalizedUrl = `${protocolPart}${userPart}${hostPart}/${ownerPart}/${repoPart}.git`;
    return { isValid: true, normalizedUrl };
  }

  return { isValid: false, error: 'Invalid repository URL format. Supported formats: HTTP(S), git@host:path/repo, ssh://user@host/path/repo.' };
}

export async function GET(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { orgId } = params

    // Check if user is a member of this organization
    const membership = await db
      .select({ role: schema.orgMember.role })
      .from(schema.orgMember)
      .where(
        and(
          eq(schema.orgMember.org_id, orgId),
          eq(schema.orgMember.user_id, session.user.id)
        )
      )
      .limit(1)

    if (membership.length === 0) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

    // Get repositories
    const repositories = await db
      .select({
        id: schema.orgRepo.id,
        repository_url: schema.orgRepo.repo_url,
        repository_name: schema.orgRepo.repo_name,
        approved_by: schema.orgRepo.approved_by,
        approved_at: schema.orgRepo.approved_at,
        is_active: schema.orgRepo.is_active,
        approver: {
          name: schema.user.name,
          email: schema.user.email,
        },
      })
      .from(schema.orgRepo)
      .innerJoin(schema.user, eq(schema.orgRepo.approved_by, schema.user.id))
      .where(eq(schema.orgRepo.org_id, orgId))

    return NextResponse.json({ repositories })
  } catch (error) {
    console.error('Error fetching repositories:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function POST(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { orgId } = params
    const body: AddRepositoryRequest = await request.json()

    // Check if user is owner or admin
    const membership = await db
      .select({ role: schema.orgMember.role })
      .from(schema.orgMember)
      .where(
        and(
          eq(schema.orgMember.org_id, orgId),
          eq(schema.orgMember.user_id, session.user.id)
        )
      )
      .limit(1)

    if (membership.length === 0) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

    const { role } = membership[0]
    if (role !== 'owner' && role !== 'admin') {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    // Validate and normalize repository URL
    const validation = validateAndNormalizeRepositoryUrl(body.repository_url)
    if (!validation.isValid) {
      return NextResponse.json(
        { error: validation.error || 'Invalid repository URL' },
        { status: 400 }
      )
    }

    const normalizedUrl = validation.normalizedUrl!

    // Check if repository already exists for this organization
    const existingRepo = await db
      .select()
      .from(schema.orgRepo)
      .where(
        and(
          eq(schema.orgRepo.org_id, orgId),
          eq(schema.orgRepo.repo_url, normalizedUrl)
        )
      )
      .limit(1)

    if (existingRepo.length > 0) {
      return NextResponse.json(
        { error: 'Repository already added to organization' },
        { status: 409 }
      )
    }

    // Add repository
    const [newRepo] = await db
      .insert(schema.orgRepo)
      .values({
        org_id: orgId,
        repo_url: normalizedUrl,
        repo_name: body.repository_name,
        approved_by: session.user.id,
      })
      .returning()

    return NextResponse.json(newRepo, { status: 201 })
  } catch (error) {
    console.error('Error adding repository:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
