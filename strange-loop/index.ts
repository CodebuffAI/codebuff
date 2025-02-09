console.log('Strange Loop initialized!')

// Example function to demonstrate Bun's capabilities
export async function readFile(path: string) {
  const file = Bun.file(path)
  const text = await file.text()
  return text
}
