import { NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import { join } from 'path'

/**
 * API route that serves the content of the agent-definition.ts file
 * This allows the docs to dynamically include the actual TypeScript types
 */
export async function GET() {
  try {
    // Path to the agent-definition.ts file
    const filePath = join(
      process.cwd(),
      '../common/src/templates/initial-agents-dir/types/agent-definition.ts',
    )

    // Read the file content
    const fileContent = await readFile(filePath, 'utf-8')

    return new NextResponse(fileContent, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        // Cache for 5 minutes to improve performance while allowing updates
        'Cache-Control': 'public, max-age=300, stale-while-revalidate=60',
      },
    })
  } catch (error) {
    console.error('Error reading agent-definition.ts:', error)

    return NextResponse.json(
      {
        error: 'Failed to load agent definition file',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    )
  }
}
