export function processData(items: string[]) {
  const results = []
  for (const item of items) {
    // Process each item
    const processed = item.toUpperCase()
    results.push(processed)
  }
  return results
}
