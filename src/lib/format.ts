export function formatDate(timestamp: string): string {
  return new Date(timestamp).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

// Plain yyyy-mm-dd, e.g. for "Started 2026-07-24" — no locale formatting.
export function formatIsoDate(timestamp: string): string {
  return timestamp.slice(0, 10)
}

// "2 days and 4 hours", "1 hour", "less than a minute" — for a countdown to
// a future timestamp. Assumes targetTimestamp is in the future; days/hours
// are floored (a "day" only counts once it's fully elapsed).
export function formatTimeUntil(targetTimestamp: string): string {
  const totalMinutes = Math.max(
    0,
    Math.floor((new Date(targetTimestamp).getTime() - Date.now()) / 60000),
  )
  const days = Math.floor(totalMinutes / (60 * 24))
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60)
  const minutes = totalMinutes % 60

  const parts: string[] = []
  if (days > 0) parts.push(`${days} day${days === 1 ? '' : 's'}`)
  if (hours > 0) parts.push(`${hours} hour${hours === 1 ? '' : 's'}`)
  if (parts.length > 0) return parts.join(' and ')

  if (minutes > 0) return `${minutes} minute${minutes === 1 ? '' : 's'}`
  return 'less than a minute'
}

export function formatPercentChange(percentChange: number | null): string {
  if (percentChange === null) return '—'
  const sign = percentChange > 0 ? '+' : ''
  return `${sign}${percentChange.toFixed(2)}%`
}

export function changeClass(percentChange: number | null): string {
  if (percentChange === null || percentChange === 0) return 'change-neutral'
  return percentChange > 0 ? 'change-positive' : 'change-negative'
}

export function formatRate(rate: number): string {
  if (rate >= 1000) return `${(rate / 1000).toFixed(rate >= 10000 ? 0 : 1)}k`
  if (rate >= 100) return rate.toFixed(0)
  if (rate >= 10) return rate.toFixed(1)
  return rate.toFixed(2)
}
