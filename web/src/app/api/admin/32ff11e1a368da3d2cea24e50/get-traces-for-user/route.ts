import { getTracesAndRelabelsForUser } from 'common/src/bigquery/client'
import { NextRequest, NextResponse } from 'next/server'
export async function GET(request: NextRequest) {
  try {
    // Extract userId from the URL search params
    const searchParams = request.nextUrl.searchParams
    const userId = searchParams.get('userId')

    if (!userId) {
      return NextResponse.json(
        { error: 'Missing required parameter: userId' },
        { status: 400 }
      )
    }

    // Call the function to get traces and relabels
    const tracesAndRelabels = await getTracesAndRelabelsForUser(userId)

    // Transform data for the frontend
    const formattedResults = tracesAndRelabels.map(({ trace, relabels }) => {
      // Extract timestamp
      const timestamp = (trace.created_at as unknown as { value: string }).value

      // Extract query from the last message in the messages array
      const messages = trace.payload.messages || []
      const queryBody =
        Array.isArray(messages) && messages.length > 0
          ? messages[messages.length - 1].content[0].text || 'Unknown query'
          : 'Unknown query'

      // User prompt: User prompt: \"still not seeing it, can you see it on the page?\"
      // Extract using regex the above specific substring, matching the bit inside quotes
      const query = queryBody.match(/"(.*?)"/)?.[1] || 'Unknown query'

      // Get base model output
      const baseOutput = trace.payload.output || ''

      // Initialize outputs with base model
      const outputs: Record<string, string> = {
        base: baseOutput,
      }

      // Add outputs from relabels
      relabels.forEach((relabel) => {
        if (relabel.model && relabel.payload?.output) {
          outputs[relabel.model] = relabel.payload.output
        }
      })

      return {
        timestamp,
        query,
        outputs,
      }
    })

    // Return the formatted data
    return NextResponse.json({ data: formattedResults })
  } catch (error) {
    console.error('Error fetching traces and relabels:', error)
    return NextResponse.json(
      { error: 'Failed to fetch traces and relabels' },
      { status: 500 }
    )
  }
}
