/**
 * Parses XML content for a tool call into a structured object.
 * Example input:
 * <type>click</type>
 * <selector>#button</selector>
 * <timeout>5000</timeout>
 */
export function parseToolCallXml(xmlString: string): Record<string, any> {
  // Remove whitespace around the content
  const trimmed = xmlString.trim()
  if (!trimmed) {
    return {}
  }

  // Parse all top-level tags into key-value pairs
  const input: Record<string, any> = {}
  const tagPattern = /<([^>\s]+)(?:\s+[^>]*)?>([\s\S]*?)<\/\1>/g
  let tagMatch

  while ((tagMatch = tagPattern.exec(trimmed))) {
    const [, tagName, tagContent] = tagMatch
    // Convert tag content to appropriate type
    let value: string | boolean | number = tagContent.trim()

    // Convert boolean strings
    if (value.toLowerCase() === 'true') value = true
    else if (value.toLowerCase() === 'false') value = false
    // Convert numeric strings
    else if (/^\d+$/.test(value)) value = parseInt(value, 10)
    else if (/^\d*\.\d+$/.test(value)) value = parseFloat(value)

    input[tagName] = value
  }

  return input
}
