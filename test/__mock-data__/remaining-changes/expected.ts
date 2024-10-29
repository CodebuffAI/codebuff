export function processData(items: string[]) {
  const results = []
  for (const item of items) {
    // Add validation check
    if (!item) continue

    // Process each item
    const processed = item.toUpperCase()
    results.push(processed)
  }
  return results
}
