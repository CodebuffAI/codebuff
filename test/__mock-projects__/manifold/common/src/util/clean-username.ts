export const cleanUsername = (name: string, maxLength = 25) => {
  return name
    .replace(/\s+/g, '')
    .normalize('NFD') // split an accented letter in the base letter and the accent
    .replace(/[\u0300-\u036f]/g, '') // remove all previously split accents
    .replace(/[^A-Za-z0-9_]/g, '') // remove all chars not letters, numbers and underscores
    .substring(0, maxLength)
}

export const cleanDisplayName = (displayName: string, maxLength = 30) => {
  return displayName.replace(/\s+/g, ' ').substring(0, maxLength).trim()
}
