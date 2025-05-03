import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

export async function GET(
  _req: Request,
  { params }: { params: { version: string; file: string } }
) {
  // Always serve the same file regardless of params
  const filePath = path.join(process.cwd(), 'web', 'public', 'codecane-darwin-arm64.tar.gz')
  
  try {
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 })
    }

    // Read the file
    const fileBuffer = fs.readFileSync(filePath)

    // Create response with appropriate headers
    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': 'application/gzip',
        'Content-Disposition': 'attachment; filename=codecane-darwin-arm64.tar.gz',
        'Cache-Control': 'no-store', // Prevent caching
      },
    })
  } catch (error) {
    console.error('Error serving file:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}