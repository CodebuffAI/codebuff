/**
 * Parses XML content for a tool call into a structured object with only string values.
 * Example input:
 * <type>click</type>
 * <selector>#button</selector>
 * <timeout>5000</timeout>
 */
export function parseToolCallXml(xmlString: string): Record<string, string> {
  if (!xmlString.trim()) return {}

  const result: Record<string, string> = {}
  const tagPattern = /<(\w+)>([\s\S]*?)<\/\1>/g
  let match

  while ((match = tagPattern.exec(xmlString)) !== null) {
    const [, key, rawValue] = match

    // Remove leading/trailing whitespace but preserve internal whitespace
    const value = rawValue.replace(/^\s+|\s+$/g, '')

    // Assign all values as strings
    result[key] = value
  }

  return result
}

