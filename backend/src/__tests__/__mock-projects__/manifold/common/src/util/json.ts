export const safeJsonParse = (json: string | undefined | null) => {
  try {
    return JSON.parse(json ?? '') 
  } catch (e) {
    return null
  }
}
