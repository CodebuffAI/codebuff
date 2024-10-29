<search>
export function processData(items: string[]) {
  const results = []
  for (const item of items) {
    // Process each item
    const processed = item.toUpperCase()
    results.push(processed)
  }
  return results
}
</search>
<replace>
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
</replace>