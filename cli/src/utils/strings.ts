export function getSubsequenceIndices(
  str: string,
  sub: string,
): number[] | null {
  let strIndex = 0
  let subIndex = 0

  const indices: number[] = []

  while (strIndex < str.length && subIndex < sub.length) {
    if (str[strIndex] === sub[subIndex]) {
      indices.push(strIndex)
      subIndex++
    }
    strIndex++
  }

  if (subIndex >= sub.length) {
    return indices
  }

  return null
}
