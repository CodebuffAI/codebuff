export type ValidationIssue = {
  expected?: unknown
  code?: string
  keys?: string[]
  path?: PropertyKey[]
  message?: string
}

export function formatValidationIssues(params: {
  issues: ValidationIssue[]
  toolName?: string
}): string {
  const { issues, toolName } = params
  const toolSpecificSummary = toolName
    ? summarizeToolSpecificValidationIssues(toolName, issues)
    : undefined
  if (toolSpecificSummary) return toolSpecificSummary

  const missingRequired = summarizeMissingRequiredFields(issues)
  if (missingRequired) return missingRequired

  const details = issues
    .map((issue) => {
      const path = formatIssuePath(issue.path)
      return path ? `${path}: ${issue.message}` : issue.message
    })
    .filter((message): message is string => Boolean(message))

  return details.length > 0
    ? details.join('; ')
    : JSON.stringify(issues, null, 2)
}

function summarizeToolSpecificValidationIssues(
  toolName: string,
  issues: ValidationIssue[],
): string | undefined {
  if (toolName !== 'str_replace') {
    return undefined
  }

  const missingFields = issues.flatMap((issue) => {
    const [root, index, field] = issue.path ?? []
    const isMissingReplacementString =
      issue.code === 'invalid_type' &&
      issue.expected === 'string' &&
      issue.message?.includes('received undefined') &&
      root === 'replacements' &&
      typeof index === 'number' &&
      (field === 'oldString' || field === 'newString')

    return isMissingReplacementString
      ? [`replacements[${index}].${String(field)}`]
      : []
  })

  if (missingFields.length !== issues.length || missingFields.length === 0) {
    return undefined
  }

  return [
    'Missing required replacement fields:',
    ...missingFields.map((field) => `- ${field}`),
    '',
    'If the intent is deletion, set "newString": "" explicitly.',
  ].join('\n')
}

function summarizeMissingRequiredFields(
  issues: ValidationIssue[],
): string | undefined {
  const missingFields = issues.flatMap((issue) => {
    const isMissing =
      issue.code === 'invalid_type' &&
      issue.message?.includes('received undefined') &&
      issue.path &&
      issue.path.length > 0
    return isMissing ? [formatIssuePath(issue.path)] : []
  })

  if (missingFields.length !== issues.length || missingFields.length === 0) {
    return undefined
  }

  return `Missing required: ${missingFields.join(', ')}`
}

function formatIssuePath(path: PropertyKey[] | undefined): string {
  if (!path || path.length === 0) return ''

  return path
    .map((part, index) => {
      if (typeof part === 'number') return `[${part}]`
      const key = String(part)
      return index === 0 ? key : `.${key}`
    })
    .join('')
}
