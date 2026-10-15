/** Number blank projects after the highest existing Untitled name. */
export function nextUntitledProjectName(
  existingNames: Iterable<string | null | undefined>,
): string {
  let highest = 0
  for (const name of existingNames) {
    const match = name?.trim().match(/^untitled(?: ([1-9]\d*))?$/i)
    if (!match) continue
    const number = match[1] ? Number(match[1]) : 1
    if (Number.isSafeInteger(number) && number < Number.MAX_SAFE_INTEGER)
      highest = Math.max(highest, number)
  }
  return highest === 0 ? 'Untitled' : `Untitled ${highest + 1}`
}
