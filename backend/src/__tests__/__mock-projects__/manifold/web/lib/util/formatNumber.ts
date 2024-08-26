// returns a string no longer than 4 characters
export function shortenNumber(num: number): string {
  if (num < 1e3) return Math.round(num).toString() // less than 1000
  if (num >= 1e3 && num < 1e6) {
    const rounded = Math.round(num / 100) / 10
    return rounded.toFixed(rounded < 10 ? 1 : 0) + 'k' // Ensuring the total length is 4 or less
  }
  if (num >= 1e6 && num < 1e9) {
    const rounded = Math.round(num / 1e5) / 10
    return rounded.toFixed(rounded < 10 ? 1 : 0) + 'M'
  }
  if (num >= 1e9 && num < 1e12) {
    const rounded = Math.round(num / 1e8) / 10
    return rounded.toFixed(rounded < 10 ? 1 : 0) + 'B'
  }
  if (num >= 1e12) {
    const rounded = Math.round(num / 1e11) / 10
    return rounded.toFixed(rounded < 10 ? 1 : 0) + 'T'
  }
  return num.toString() // Fallback, ideally never hit if all cases are covered
}

export function numberWithCommas(x: number) {
  return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}
