export function formatDate(timestamp: string): string {
  return new Date(timestamp).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
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
