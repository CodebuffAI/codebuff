import { NextRequest, NextResponse } from 'next/server'

/**
 * Proxy endpoint for CLI binary downloads.
 * Redirects to the actual download location (currently GitHub releases).
 * This allows us to change the download location in the future without breaking old CLI versions.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ version: string; filename: string }> },
) {
  const { version, filename } = await params

  if (!version || !filename) {
    return NextResponse.json({ error: 'Missing parameters' }, { status: 400 })
  }

  // Current download location - can be changed in the future without affecting old clients
  const downloadUrl = `https://github.com/CodebuffAI/codebuff-community/releases/download/v${version}/${filename}`

  return NextResponse.redirect(downloadUrl, 302)
}
