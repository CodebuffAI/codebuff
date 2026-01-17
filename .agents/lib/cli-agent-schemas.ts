// Shared output schema for CLI tester agents. testResults for test mode, reviewFindings for review mode.
export const outputSchema = {
  type: 'object' as const,
  properties: {
    overallStatus: {
      type: 'string' as const,
      enum: ['success', 'failure', 'partial'],
      description: 'Overall test outcome',
    },
    summary: {
      type: 'string' as const,
      description: 'Brief summary of what was tested and the outcome',
    },
    testResults: {
      type: 'array' as const,
      items: {
        type: 'object' as const,
        properties: {
          testName: { type: 'string' as const, description: 'Name/description of the test' },
          passed: { type: 'boolean' as const, description: 'Whether the test passed' },
          details: { type: 'string' as const, description: 'Details about what happened' },
          capturedOutput: { type: 'string' as const, description: 'Relevant output captured from the CLI' },
        },
        required: ['testName', 'passed'],
      },
      description: 'Array of individual test results',
    },
    scriptIssues: {
      type: 'array' as const,
      items: {
        type: 'object' as const,
        properties: {
          script: { type: 'string' as const, description: 'Which script had the issue (e.g., "tmux-start.sh", "tmux-send.sh")' },
          issue: { type: 'string' as const, description: 'What went wrong when using the script' },
          errorOutput: { type: 'string' as const, description: 'The actual error message or unexpected output' },
          suggestedFix: { type: 'string' as const, description: 'Suggested fix or improvement for the parent agent to implement' },
        },
        required: ['script', 'issue', 'suggestedFix'],
      },
      description: 'Issues encountered with the helper scripts that the parent agent should fix',
    },
    captures: {
      type: 'array' as const,
      items: {
        type: 'object' as const,
        properties: {
          path: { type: 'string' as const, description: 'Path to the capture file (relative to project root)' },
          label: { type: 'string' as const, description: 'What this capture shows (e.g., "initial-cli-state", "after-help-command")' },
          timestamp: { type: 'string' as const, description: 'When the capture was taken' },
        },
        required: ['path', 'label'],
      },
      description: 'Paths to saved terminal captures for debugging - check debug/tmux-sessions/{session}/',
    },
    reviewFindings: {
      type: 'array' as const,
      items: {
        type: 'object' as const,
        properties: {
          file: { type: 'string' as const, description: 'File path where the issue was found' },
          severity: { type: 'string' as const, enum: ['critical', 'warning', 'suggestion', 'info'], description: 'Severity level of the finding' },
          line: { type: 'number' as const, description: 'Line number (if applicable)' },
          finding: { type: 'string' as const, description: 'Description of the issue or suggestion' },
          suggestion: { type: 'string' as const, description: 'Suggested fix or improvement' },
        },
        required: ['file', 'severity', 'finding'],
      },
      description: 'Code review findings (only populated in review mode)',
    },
  },
  required: ['overallStatus', 'summary', 'scriptIssues', 'captures'],
}
